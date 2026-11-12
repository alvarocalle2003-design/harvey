# Pantalla Sistema del HUD (/opt/data/hud/sistema.py), solo lectura: lo que gasta cada agente y cada objetivo, lo que
# gasta Claude Code, las tareas automáticas con su última ejecución y el historial de avisos.
#   sistema.py   -> JSON {agentes, objetivos, claude, tareas, avisos}
# Servidor y cupo de ChatGPT ya vienen en snapshot.py (bloques «system» y «cupo»).
import glob, json, os, re, sqlite3, sys, time
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vivo  # respuesta() y tipo_aviso(): la misma regla de avisos que el HUD y el iPhone

AGENTES = {"default": "/opt/data/state.db", **{os.path.basename(os.path.dirname(p)): p for p in glob.glob("/opt/data/profiles/*/state.db")}}
HABITOS = "6421874d67bd"  # cron «Hábitos 22:00»: solo avisa al iPhone (no es de vivo.tipo_aviso)
DIAS = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"]
MESES = ["", "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]


def dia0():
    return datetime.now().replace(hour=0, minute=0, second=0, microsecond=0).timestamp()


def gasto_agentes():
    """Tokens (entrada + salida) y euros de verdad (Gemini, OpenRouter) de cada agente hoy y en 7 días."""
    hoy, semana, out = dia0(), time.time() - 7 * 86400, []
    for agente, db in AGENTES.items():
        try:
            c = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
            fila = lambda desde: c.execute(
                "select coalesce(sum(input_tokens + output_tokens), 0), coalesce(sum(estimated_cost_usd), 0), count(distinct session_id)"
                " from session_model_usage where last_seen >= ?", (desde,)).fetchone()
            (th, ch, sh), (ts, cs, ss) = fila(hoy), fila(semana)
            c.close()
        except sqlite3.Error:
            continue
        out.append({"agente": agente, "hoy": th, "hoy_usd": round(ch, 3), "semana": ts, "semana_usd": round(cs, 3), "sesiones_semana": ss})
    return sorted(out, key=lambda a: -a["semana"])


def gasto_objetivos():
    """Lo gastado hoy en cada objetivo (el mismo cálculo que la franja del Tablero)."""
    import tablero
    return [{k: o.get(k) for k in ("id", "titulo", "estado", "semaforo", "tokens_hoy", "cupo_maximo", "tarjetas")}
            for o in tablero.tablero()["objetivos"]]


def claude():
    """Tokens de Claude Code (Leonardo) hoy y en 7 días, leídos de sus registros. Sin claves: el % del plan no está aquí."""
    hoy, semana = dia0(), time.time() - 7 * 86400
    vistos, sesiones, t = set(), set(), {"hoy": 0, "semana": 0}
    for f in glob.glob("/opt/data/home/.claude/projects/*/*.jsonl") + glob.glob("/opt/data/.claude/projects/*/*.jsonl"):
        if os.path.getmtime(f) < semana:
            continue
        for linea in open(f, encoding="utf-8", errors="replace"):
            if '"usage"' not in linea:
                continue
            try:
                e = json.loads(linea)
                m, cuando = e["message"], datetime.fromisoformat(e["timestamp"].replace("Z", "+00:00")).timestamp()
            except (ValueError, KeyError, TypeError, AttributeError):
                continue
            if cuando < semana or m.get("id") in vistos:  # cada respuesta se apunta varias veces mientras llega
                continue
            vistos.add(m.get("id"))
            u = m.get("usage") or {}
            n = (u.get("input_tokens") or 0) + (u.get("cache_creation_input_tokens") or 0) + (u.get("output_tokens") or 0)
            t["semana"] += n
            sesiones.add(e.get("sessionId"))
            if cuando >= hoy:
                t["hoy"] += n
    return {**t, "sesiones_semana": len(sesiones - {None})}


def cuando(s):
    """El horario de un cron en castellano: «cada 15 min», «cada 2 h de 8 a 22», «domingos a las 3:00»…"""
    k = s.get("kind")
    if k == "interval":
        return f"cada {s.get('minutes')} min"
    if k == "once":
        try:
            d = datetime.fromisoformat(s["run_at"])
            return f"una vez, el {d.day} de {MESES[d.month]} a las {d.hour}:{d.minute:02d}"
        except (KeyError, ValueError):
            return "una vez"
    try:
        m, h, dom, mes, dow = s.get("expr", "").split()
    except ValueError:
        return s.get("display", "")
    if not all(x == "*" or re.fullmatch(r"\d+([,-]\d+)*", x) for x in (dom, mes, dow)):
        return s.get("display", "")
    rango = lambda r: "de {} a {} h".format(*r.split("-"))
    if m.startswith("*/"):
        txt = f"cada {m[2:]} min" + ("" if h == "*" else " " + rango(h))
    elif "/" in h:
        r, n = h.split("/")
        txt = f"cada {n} h" + ("" if r == "*" else " " + rango(r))
    elif re.fullmatch(r"\d+(,\d+)*", h) and m.isdigit():
        txt = "a las " + ", ".join(f"{x}:{int(m):02d}" for x in h.split(","))
    else:
        return s.get("display", "")
    if dow != "*":
        txt = ("entre semana" if dow == "1-5" else " y ".join(DIAS[int(x) % 7] for x in dow.split(",") if x.isdigit())) + " " + txt
    if dom != "*":
        txt = f"los días {dom.replace(',', ', ')}" + (f" de {MESES[int(mes)]}" if mes.isdigit() else "") + " " + txt
    return txt


def tareas():
    """Los crons activos con su horario, última ejecución, si fue bien y la próxima."""
    try:
        j = json.load(open(vivo.JOBS))
        jobs = j.get("jobs", j) if isinstance(j, dict) else j
    except (OSError, ValueError):
        return []
    out = []
    for x in jobs if isinstance(jobs, list) else jobs.values():
        if not x.get("enabled") or x.get("state") == "completed":
            continue
        out.append({"id": x.get("id"), "nombre": x.get("name"), "cuando": cuando(x.get("schedule") or {}),
                    "ultima": x.get("last_run_at"), "estado": x.get("last_status"), "error": (x.get("last_error") or "")[:200],
                    "fallos": x.get("failure_streak") or 0, "siguiente": x.get("next_run_at"), "ia": not x.get("no_agent"),
                    # la reunión de dirección solo despierta a Harvey si su vigilante vio cambios
                    "desperto": (x.get("monitor_state") or {}).get("last_changed_at")})
    return out


def avisos(dias=7, cuantos=40):
    """Lo que le llegó al señor por iniciativa de Harvey en los últimos días, lo más reciente primero."""
    desde, out = time.time() - dias * 86400, []
    for f in vivo.CRON_OUT.glob("*/*.md"):
        t = f.stat().st_mtime
        if t < desde:
            continue
        txt = f.read_text(encoding="utf-8", errors="replace")
        tipo = vivo.tipo_aviso(f.parent.name, txt) or ("habitos" if f.parent.name == HABITOS else None)
        resp = vivo.respuesta(txt) if tipo else ""
        if resp and "[SILENT]" not in resp:
            out.append({"t": t, "tipo": tipo, "nombre": txt.split("\n", 1)[0].removeprefix("# Cron Job:").strip(), "texto": resp[:1500]})
    return sorted(out, key=lambda a: -a["t"])[:cuantos]


def seguro(f):
    try:
        return {"ok": True, "data": f()}
    except Exception as e:  # un bloque roto no tumba la pantalla entera
        return {"ok": False, "error": str(e)[:200]}


if __name__ == "__main__":
    print(json.dumps({k: seguro(f) for k, f in {"agentes": gasto_agentes, "objetivos": gasto_objetivos, "claude": claude,
                                                  "tareas": tareas, "avisos": avisos}.items()}, ensure_ascii=False))
