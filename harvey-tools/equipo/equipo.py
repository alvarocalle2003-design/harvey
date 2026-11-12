# El equipo de Harvey (/opt/data/hud/equipo.py): crea los perfiles y les escribe el SOUL.md desde la biblioteca.
#   equipo.py              -> rehace los SOUL.md del equipo y el bloque «equipo» del de Harvey si cambió /opt/data/wiki/equipo
#   equipo.py --callado    -> lo mismo sin imprimir nada (cron «Biblioteca», wiki_sync.sh)
#   equipo.py perfiles     -> crea o ajusta los siete perfiles: modelo, claves, herramientas y skills (idempotente)
# La fuente de verdad es la biblioteca (el señor la edita en Obsidian); este script solo la copia donde Hermes la lee.
import copy, io, os, re, shutil, subprocess, sys
from ruamel.yaml import YAML  # la que trae Hermes (no hay PyYAML)

YAML_ = YAML(typ="safe")
YAML_.allow_unicode, YAML_.default_flow_style = True, False

DATA = "/opt/data"
EQ_DIR = f"{DATA}/wiki/equipo"
HERMES = "/opt/hermes/bin/hermes"
SKILLS, EXTRA = f"{DATA}/skills", f"{DATA}/skills-equipo"
INICIO, FIN = "<!-- equipo:inicio", "<!-- equipo:fin -->"

TODAS = ["web", "browser", "terminal", "file", "code_execution", "vision", "image_gen", "tts", "skills", "todo", "memory",
         "session_search", "connections", "clarify", "delegation", "cronjob", "computer_use"]
BASE = ["terminal", "file", "skills", "todo", "memory", "session_search"]  # kanban lo activa solo el despachador
# claves que puede ver el equipo (el resto, como Notion o las del HUD, son solo de Harvey)
CLAVE_OK = re.compile(r"^(TERMINAL_|BROWSER|WEB_TOOLS|VISION_TOOLS|MOA_TOOLS|IMAGE_TOOLS)|^(GEMINI_API_KEY|OPENROUTER_API_KEY|TAVILY_API_KEY|TZ)=")

PERFILES = {
    "sherlock": dict(provider="openai-codex", model="gpt-6.1-sol", effort="medium",
                 tools=BASE + ["web", "browser", "vision", "delegation"],
                 skills=["research/grounded-citations", "research/arxiv", "media/youtube-content", "research/llm-wiki",
                         "web/blocked-page-recovery", "productivity/pdf", "productivity/xlsx", "productivity/maps",
                         "research/competitor-news-monitor", "research/rss-feeds", "autonomous-ai-agents/dynamic-workflow",
                         "+marketing/competitive-brief"],
                 desc="Investigación con fuentes: busca, contrasta y entrega informes con cada dato enlazado a su fuente "
                      "(normativa, subvenciones, mercados, competidores, empresas, vídeos)."),
    "jordan": dict(provider="openai-codex", model="gpt-6.1-terra", effort="medium",
                 tools=BASE + ["web", "browser", "vision"],
                 skills=["productivity/prospeccion-comercial", "creative/humanizer", "productivity/docx", "productivity/pdf",
                         "productivity/powerpoint", "productivity/xlsx", "productivity/maps", "web/blocked-page-recovery",
                         "+marketing/content-creation", "+marketing/draft-content",
                         "+marketing/email-sequence", "+marketing/campaign-plan", "+marketing/seo-audit",
                         "+marketing/brand-review", "+marketing/competitive-brief"],
                 desc="Comercial: busca clientes potenciales con un problema demostrable, los puntúa y prepara propuestas "
                      "y correos en borrador (IA, automatizaciones, formaciones y webs)."),
    "eco": dict(provider="openai-codex", model="gpt-6.1-terra", effort="medium",
                tools=BASE + ["web", "browser", "vision", "image_gen", "tts"],
                skills=["creative/humanizer", "creative/baoyu-infographic", "productivity/powerpoint", "productivity/docx",
                        "productivity/pdf", "+marketing/content-creation", "+marketing/draft-content",
                        "+marketing/campaign-plan", "+marketing/brand-review"]
                       + [f"+linkedin/li-{s}" for s in ("post", "carousel", "plan", "comment", "reply", "repurpose",
                                                        "profile", "audit", "human", "dm", "inbox")],
                # voz: la misma de Harvey (voz.mjs); imágenes: gpt-image con el ChatGPT del señor, sin clave aparte
                keep=["tts"], extra_cfg={"image_gen": {"provider": "openai-codex"}},
                desc="Contenido y formación: posts y carruseles de LinkedIn, textos de la web del señor y material de "
                     "sus formaciones, con imágenes y audios. Solo borradores: publica el señor."),
    "leonardo": dict(provider="openai-codex", model="gpt-6.1-terra", effort="low", extra_env=["GITHUB_TOKEN"],
                  tools=BASE + ["web", "browser", "vision"],
                  skills=["productivity/programar-con-claude", "autonomous-ai-agents/claude-code",
                          "software-development/codebase-inspection", "software-development/systematic-debugging",
                          "software-development/code-wiki",
                          "productivity/prospeccion-comercial"],
                  desc="Programación y mediciones: dirige a Claude Code en los repositorios de GitHub del señor (y crea los "
                       "nuevos allí), prueba y sube el código; mide webs con Lighthouse; genera documentos complejos."),
    "lince": dict(provider="gemini", model="gemini-3.8-flash", effort="medium",
                  tools=BASE + ["web", "browser", "vision"],
                  skills=["devops/sdlc-review", "research/grounded-citations", "web/blocked-page-recovery", "productivity/pdf",
                          "autonomous-ai-agents/dynamic-workflow", "+marketing/brand-review"],
                  # paga por uso y cada paso reenvía lo leído: sin recorte (rompe la caché), páginas cortas
                  # (la entera queda en cache/web para search_files) y tope de pasos con aviso al 75 %
                  extra_cfg={"compression": {"proactive_prune_tokens": 0}, "web": {"extract_char_limit": 4000},
                             "agent": {"max_turns": 30, "budget_warning_ratio": 0.75}},
                  desc="Revisión de calidad: comprueba cada entrega contra su rúbrica antes de que llegue al señor; "
                       "aprueba o devuelve con lo que falta."),
    "tomo": dict(provider="openai-codex", model="gpt-6-luna", effort="low",
                 tools=BASE,
                 skills=["research/llm-wiki", "note-taking/obsidian"],
                 desc="Memoria y archivo: mantiene la biblioteca común del equipo (/opt/data/wiki) con lo aprendido de "
                      "cada encargo."),
}


def leer(p):
    with open(p, encoding="utf-8") as f:
        return f.read()


def escribir_si_cambia(p, texto):
    try:
        if leer(p) == texto:
            return False
    except OSError:
        pass
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(texto)
    os.replace(tmp, p)
    return True


def hermes(*args, perfil=None):
    r = subprocess.run([HERMES, *(["-p", perfil] if perfil else []), *args], capture_output=True, text=True, timeout=120)
    if r.returncode:
        sys.exit(f"hermes {' '.join(args)} ({perfil or 'default'}) falló: {(r.stderr or r.stdout).strip()[-300:]}")
    return r.stdout


def perfiles():
    base = YAML_.load(leer(f"{DATA}/config.yaml"))
    raiz_env = leer(f"{DATA}/.env").splitlines()
    existentes = hermes("profile", "list")
    for nombre, p in PERFILES.items():
        dirp = f"{DATA}/profiles/{nombre}"
        if not os.path.isdir(dirp) or f" {nombre} " not in existentes:
            # sin skills: así Hermes no le vuelve a meter las 66 de Harvey en cada actualización
            hermes("profile", "create", nombre, "--no-skills", "--no-alias", "--description", p["desc"])
        hermes("profile", "describe", nombre, "--text", p["desc"])

        cfg = copy.deepcopy(base)
        for k in ("hooks", "mcp_servers", "stt", "tts", "voice", "dashboard", "platform_toolsets", "skills"):
            if k not in p.get("keep", ()):
                cfg.pop(k, None)  # sin Notion, sin el gancho de contexto personal del señor, sin voz, sin las skills apagadas de Harvey
        for k, v in copy.deepcopy(p.get("extra_cfg", {})).items():  # un nivel: no pisa el resto de la sección
            cfg[k] = {**cfg[k], **v} if isinstance(v, dict) and isinstance(cfg.get(k), dict) else v
        cfg["model"] = {"provider": p["provider"], "default": p["model"]}
        cfg.setdefault("agent", {})["reasoning_effort"] = p["effort"]
        buf = io.StringIO()
        YAML_.dump(cfg, buf)
        escribir_si_cambia(f"{dirp}/config.yaml", buf.getvalue())

        extra = tuple(f"{k}=" for k in p.get("extra_env", []))
        env = "\n".join(l for l in raiz_env if CLAVE_OK.match(l) or l.startswith(extra)) + "\n"
        if escribir_si_cambia(f"{dirp}/.env", env):
            os.chmod(f"{dirp}/.env", 0o600)

        sk = f"{dirp}/skills"
        shutil.rmtree(sk, ignore_errors=True)
        for s in p["skills"]:
            origen = f"{EXTRA}/{s[1:]}" if s.startswith("+") else f"{SKILLS}/{s}"
            if not os.path.isfile(f"{origen}/SKILL.md"):
                sys.exit(f"Falta la skill {s} para {nombre}")
            destino = f"{sk}/{s.lstrip('+')}"
            os.makedirs(os.path.dirname(destino), exist_ok=True)
            os.symlink(origen, destino)  # enlace: si Harvey mejora la skill, el equipo la recibe

        hermes("tools", "disable", "--platform", "cli", *[t for t in TODAS if t not in p["tools"]], perfil=nombre)
        hermes("tools", "enable", "--platform", "cli", *p["tools"], perfil=nombre)
        print(f"{nombre}: {p['model']} ({p['effort']}), {len(p['skills'])} skills, herramientas {', '.join(p['tools'])}")


def seccion(md, hasta):
    """El texto de md hasta el título `hasta` (sin incluirlo)."""
    i = md.find(hasta)
    return md if i < 0 else md[:i].rstrip() + "\n"


def almas(callado):
    eq = leer(f"{EQ_DIR}/EQUIPO.md")
    cambios = []
    for nombre in PERFILES:
        dirp = f"{DATA}/profiles/{nombre}"
        if os.path.isdir(dirp) and escribir_si_cambia(f"{dirp}/SOUL.md", leer(f"{EQ_DIR}/oficios/{nombre}.md").replace("{{EQUIPO}}", eq)):
            cambios.append(nombre)
    # Harvey: su oficio + el equipo sin «cómo trabajamos» (es para los demás; las reglas comunes sí) + cómo dirige
    eq_h = seccion(eq, "## Cómo trabajamos") + "\n" + eq[eq.find("## Reglas comunes"):] if "## Reglas comunes" in eq else seccion(eq, "## Cómo trabajamos")
    bloque = (f"{INICIO} (lo escribe equipo.py desde la biblioteca: no editar aquí) -->\n"
              + leer(f"{EQ_DIR}/oficios/harvey.md").replace("{{EQUIPO}}", eq_h).rstrip() + "\n\n"
              + leer(f"{EQ_DIR}/DIRECCION.md").rstrip() + f"\n{FIN}")
    soul = leer(f"{DATA}/SOUL.md")
    if INICIO in soul and FIN in soul:
        nuevo = soul[:soul.index(INICIO)] + bloque + soul[soul.index(FIN) + len(FIN):]
    else:
        i = soul.find("## Contexto mínimo")
        nuevo = (soul[:i] + bloque + "\n\n" + soul[i:]) if i >= 0 else soul.rstrip() + "\n\n" + bloque + "\n"
    if escribir_si_cambia(f"{DATA}/SOUL.md", nuevo):
        cambios.append("harvey")
    if cambios and not callado:
        print("SOUL actualizado: " + ", ".join(cambios))


if __name__ == "__main__":
    if sys.argv[1:2] == ["perfiles"]:
        perfiles()
        almas(False)
    else:
        almas("--callado" in sys.argv)
