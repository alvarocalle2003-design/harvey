# "Foto rápida" del día del señor. Una sola fuente para el HUD y para Harvey (skill foto-rapida):
#   /opt/hermes/.venv/bin/python /opt/data/hud/snapshot.py            -> JSON completo (HUD)
#   /opt/hermes/.venv/bin/python /opt/data/hud/snapshot.py --texto    -> resumen compacto ya contado (Harvey)
#   --dias N  correos no leídos de los últimos N días (por defecto 3; los antiguos se ignoran a propósito)
#   --cache   guarda lo del señor en contexto_cache.json sin imprimir nada (cron «Contexto»; lo lee el gancho contexto.py)
# Cada bloque va en su propio try: si falla Gmail, el resto sigue funcionando.
# El JSON del HUD se comparte 40 s entre el PC y el móvil (FOTO_HUD): el VPS tiene una sola CPU.
import argparse, html, json, os, re, sqlite3, subprocess, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import habitos  # /opt/data/hud/habitos.py: las 3 casillas diarias (gimnasio, lectura, Instagram)
import vivo     # /opt/data/hud/vivo.py: avisos por iniciativa propia y caché de contexto
import tablero  # /opt/data/hud/tablero.py: qué hace cada agente del equipo
sys.path.insert(0, "/opt/data/scripts")
from cartero_vigila import no_avisar  # el filtro de avisos del Cartero: Sage, alertas de seguridad, publicidad...

ap =argparse.ArgumentParser()
ap.add_argument("--texto", action="store_true", help="resumen compacto para Harvey en vez de JSON")
ap.add_argument("--dias", type=int, default=3, help="días hacia atrás para los correos no leídos")
ap.add_argument("--cache", action="store_true", help="guarda el contexto del señor en contexto_cache.json")
ARGS = ap.parse_args()

FOTO_HUD = habitos.FOTO_HUD  # habitos.py la borra al marcar una casilla
if not ARGS.texto and not ARGS.cache:
    try:
        if time.time() - os.path.getmtime(FOTO_HUD) < 40:
            sys.stdout.write(open(FOTO_HUD, encoding="utf-8").read())
            sys.exit(0)
    except OSError:
        pass

TZ = ZoneInfo("Europe/Madrid")
NOW = datetime.now(TZ)
TODAY = NOW.date().isoformat()
PY = "/opt/hermes/.venv/bin/python"
GAPI = "/opt/data/skills/productivity/google-workspace/scripts/google_api.py"
DS = {"obj": "ccc745cf-28fe-40be-850d-fa8cbc2bd958", "tareas": "f57016ab-3737-4ab7-a68f-3590e6db8a6c"}


def env(name):
    for line in open("/opt/data/.env", encoding="utf-8"):
        if line.startswith(name + "="):
            return line.split("=", 1)[1].strip().strip('"')


def gapi(*args):
    r = subprocess.run([PY, GAPI, *args], capture_output=True, text=True, timeout=40)
    if r.returncode != 0:  # token caducado, Google caído...: el HUD muestra «sin señal», no una agenda vacía
        raise RuntimeError((r.stderr.strip().splitlines() or ["Google no responde"])[-1][:160])
    return json.loads(r.stdout or "[]")


# Los boletines rellenan el extracto con caracteres invisibles (U+200C, U+FEFF...)
INVISIBLES = re.compile(r"[­͏؜ᅟᅠ឴឵᠎​-‏‪-‮⁠-⁯ㅤ﻿ﾠ]")
limpio = lambda s: " ".join(INVISIBLES.sub("", html.unescape(s or "")).split())


def notion_all(ds):
    key, out, cur = env("NOTION_API_KEY"), [], None
    while True:
        body = {"page_size": 100, **({"start_cursor": cur} if cur else {})}
        req = urllib.request.Request(f"https://api.notion.com/v1/data_sources/{ds}/query", json.dumps(body).encode(),
                                     {"Authorization": "Bearer " + key, "Notion-Version": "2025-09-03",
                                      "Content-Type": "application/json"}, method="POST")
        r = json.load(urllib.request.urlopen(req, timeout=40))
        out += r["results"]
        if not r.get("has_more"):
            return out
        cur = r["next_cursor"]


def val(p):
    """Valor plano de cualquier propiedad de Notion."""
    t = p["type"]; v = p.get(t)
    if t in ("title", "rich_text"): return "".join(x["plain_text"] for x in v)
    if t in ("select", "status"): return v and v["name"]
    if t == "multi_select": return [x["name"] for x in v]
    if t == "date": return v and v["start"]
    if t == "formula": return v.get(v["type"])
    if t == "relation": return len(v)
    return v


def flat(page):
    return {k: val(p) for k, p in page["properties"].items()} | {"url": page["url"]}


def calendar():
    end = (NOW + timedelta(days=7)).replace(hour=23, minute=59)
    ev = gapi("calendar", "list", "--start", NOW.replace(hour=0, minute=0, second=0, microsecond=0).isoformat(),
              "--end", end.isoformat())
    return [{"title": e.get("summary"), "start": e.get("start"), "end": e.get("end"), "location": e.get("location")}
            for e in ev]


def gmail():
    m = gapi("gmail", "search", f"is:unread in:inbox newer_than:{ARGS.dias}d -category:promotions -category:social -from:tldrnewsletter.com",
             "--max", "40" if ARGS.texto or ARGS.cache else "12")  # Harvey necesita la cifra exacta; el HUD solo muestra 12
    out = []
    for x in m:
        c = {"from": limpio(x["from"]), "subject": limpio(x["subject"]), "snippet": limpio(x["snippet"])}
        out.append({"id": x["id"], "from": c["from"].split("<")[0].strip(' "') or c["from"], "subject": c["subject"],
                    "snippet": c["snippet"][:140], "date": x["date"], "important": "IMPORTANT" in x.get("labels", []),
                    "avisar": not no_avisar(c)})  # el HUD no avisa de lo que el señor pidió callar
    return out


def notion():
    tareas = [flat(p) for p in notion_all(DS["tareas"])]
    objs = [flat(p) for p in notion_all(DS["obj"])]
    pend = sorted((t for t in tareas if t.get("Estado") != "Hecha"), key=lambda t: t.get("Fecha") or "9999")
    areas = {}
    for o in objs:
        a = areas.setdefault(o.get("Área") or "Sin área", {"total": 0, "hechos": 0, "riesgo": 0})
        a["total"] += 1
        a["hechos"] += o.get("Estado") == "Hecho"
        a["riesgo"] += o.get("Estado") == "En riesgo" or str(o.get("Semáforo", "")).startswith(("🔴", "🟠"))
    proximos = sorted((o for o in objs if o.get("Estado") != "Hecho" and o.get("Fecha límite")),
                      key=lambda o: o["Fecha límite"])[:6]
    return {
        "tareas": [{"title": t.get("Tarea"), "estado": t.get("Estado"), "prioridad": t.get("Prioridad"),
                    "fecha": t.get("Fecha"), "cuando": t.get("Cuándo"), "url": t["url"]} for t in pend],
        "tareas_total": len(tareas), "tareas_hechas": sum(t.get("Estado") == "Hecha" for t in tareas),
        "areas": areas,
        "obj_total": len(objs), "obj_estados": {e: sum(o.get("Estado") == e for o in objs)
                                                for e in ("Pendiente", "En curso", "Hecho", "En riesgo")},
        "objetivos": [{"title": o.get("Objetivo"), "area": o.get("Área"), "estado": o.get("Estado"),
                       "fecha": o.get("Fecha límite"), "semaforo": o.get("Semáforo")} for o in proximos],
    }


def cielo(codigo):
    """Código WMO de Open-Meteo en palabras."""
    for hasta, txt in ((0, "despejado"), (2, "poco nuboso"), (3, "nublado"), (48, "niebla"), (57, "llovizna"),
                       (67, "lluvia"), (77, "nieve"), (82, "chubascos")):
        if codigo <= hasta:
            return txt
    return "tormenta"


def tiempo():
    """Portugalete (localidad de referencia del señor) vía Open-Meteo: gratis y sin clave."""
    r = json.load(urllib.request.urlopen(
        "https://api.open-meteo.com/v1/forecast?latitude=43.32&longitude=-3.02&timezone=Europe/Madrid&forecast_days=2"
        "&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code",
        timeout=15))
    d = r["daily"]
    return {"ahora": {"temp": round(r["current"]["temperature_2m"]), "cielo": cielo(r["current"]["weather_code"])},
            "dias": [{"fecha": d["time"][i], "min": round(d["temperature_2m_min"][i]), "max": round(d["temperature_2m_max"][i]),
                      "lluvia": d["precipitation_probability_max"][i], "cielo": cielo(d["weather_code"][i])} for i in range(2)]}


def tiempo_texto(t):
    hoy, man = t["dias"]
    return (f"Portugalete ahora {t['ahora']['temp']} °C, {t['ahora']['cielo']}. Hoy {hoy['min']}-{hoy['max']} °C, {hoy['cielo']},"
            f" lluvia {hoy['lluvia']} %. Mañana {man['min']}-{man['max']} °C, {man['cielo']}, lluvia {man['lluvia']} %.")


def system():
    load = open("/proc/loadavg").read().split()[:3]
    mem = {l.split(":")[0]: int(l.split()[1]) for l in open("/proc/meminfo")}
    st = os.statvfs("/opt/data")
    return {"load": [float(x) for x in load], "cpus": os.cpu_count(),
            "mem_total": mem["MemTotal"] * 1024, "mem_used": (mem["MemTotal"] - mem["MemAvailable"]) * 1024,
            "disk_total": st.f_blocks * st.f_frsize, "disk_used": (st.f_blocks - st.f_bfree) * st.f_frsize,
            "uptime": float(open("/proc/uptime").read().split()[0])}


def harvey():
    db = sqlite3.connect("file:/opt/data/state.db?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    day0 = NOW.replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
    sessions = [dict(r) for r in db.execute(
        "select title, source, model, message_count, tool_call_count, last_activity_at, last_activity_description,"
        " parent_session_id is not null as sub from sessions where coalesce(hidden,0)=0"
        " order by coalesce(last_activity_at, started_at) desc limit 8")]
    hoy = db.execute("select count(*), coalesce(sum(input_tokens+output_tokens),0), coalesce(sum(tool_call_count),0),"
                     " coalesce(sum(estimated_cost_usd),0) from sessions where started_at >= ?", (day0,)).fetchone()
    actividad = [dict(r) for r in db.execute(
        "select m.timestamp as t, m.tool_name as tool, s.source as source from messages m join sessions s on s.id=m.session_id"
        " where m.role='tool' and m.tool_name is not null order by m.id desc limit 14")]
    deleg = []
    for r in db.execute("select delegation_id, state, dispatched_at, completed_at, task_json from async_delegations"
                        " order by dispatched_at desc limit 8"):
        task = json.loads(r["task_json"] or "{}")
        goal = next((task[k] for k in ("goal", "task", "prompt", "title", "description") if isinstance(task.get(k), str)), "")
        deleg.append({"id": r["delegation_id"], "state": r["state"], "start": r["dispatched_at"],
                      "end": r["completed_at"], "goal": goal[:120]})
    # turnos que abrió el despertador de movil/server.mjs al acabar unos subagentes: el HUD del PC los adopta
    desp = "/opt/data/hud/despertares.json"
    despertares = [d for d in json.load(open(desp)) if d.get("run")][-10:] if os.path.exists(desp) else []
    return {"sesiones": sessions, "hoy": dict(zip(("sesiones", "tokens", "herramientas", "coste"), hoy)),
            "actividad": actividad, "delegaciones": deleg, "despertares": despertares}


def cupo():
    """Cupo de ChatGPT que guardó el cron «Cupo de ChatGPT» en su última vuelta (cada 15 min; consultarlo tarda 4 s)."""
    return json.load(open("/opt/data/hud/cupo_ultimo.json"))


def claude_code():
    """Sesiones de Claude Code lanzadas por Harvey. Su terminal usa HOME=/opt/data/home; las lanzadas a mano
    (docker exec) quedan en /opt/data/.claude: se leen ambas."""
    import glob
    files = sorted(glob.glob("/opt/data/home/.claude/projects/*/*.jsonl") + glob.glob("/opt/data/.claude/projects/*/*.jsonl"),
                   key=os.path.getmtime, reverse=True)[:8]
    out = []
    for f in files:
        rows = []
        for line in open(f, encoding="utf-8", errors="replace"):
            try:
                rows.append(json.loads(line))
            except ValueError:
                pass
        msgs = [r for r in rows if r.get("type") in ("user", "assistant") and not r.get("isSidechain")]
        if not msgs:
            continue

        def text_of(m):
            c = (m.get("message") or {}).get("content")
            return c if isinstance(c, str) else " ".join(x.get("text", "") for x in c or [] if x.get("type") == "text")

        tools = [x for m in msgs if m["type"] == "assistant" for x in (m["message"].get("content") or [])
                 if isinstance(x, dict) and x.get("type") == "tool_use"]
        cwd = next((m.get("cwd") for m in msgs if m.get("cwd")), "")
        archivos = []
        for t in tools:
            p = (t.get("input") or {}).get("file_path")
            if t.get("name") in ("Write", "Edit", "MultiEdit", "NotebookEdit") and p:
                p = os.path.relpath(p, cwd) if cwd and p.startswith(cwd) else p
                if p not in archivos:
                    archivos.append(p)
        pasos = []
        for t in tools[-6:]:
            i = t.get("input") or {}
            pasos.append({"tool": t.get("name"), "detalle": str(i.get("description") or i.get("command") or i.get("file_path")
                                                              or i.get("pattern") or i.get("url") or "")[:120]})
        encargo = next((text_of(m) for m in msgs if m["type"] == "user" and text_of(m).strip()), "")
        resultado = next((text_of(m) for m in reversed(msgs) if m["type"] == "assistant" and text_of(m).strip()), "")
        titulo = next((r.get("customTitle") or r.get("aiTitle") for r in reversed(rows)
                       if r.get("type") in ("custom-title", "ai-title")), None)
        mtime = os.path.getmtime(f)
        out.append({
            "id": os.path.basename(f)[:-6], "titulo": titulo or encargo[:80], "proyecto": os.path.basename(cwd) or "—",
            "encargo": encargo[:600], "resultado": resultado[:700], "archivos": archivos[:12], "pasos": pasos,
            "herramientas": len(tools), "inicio": msgs[0].get("timestamp"), "fin": msgs[-1].get("timestamp"),
            "en_curso": time.time() - mtime < 90,  # escribe en la transcripción mientras trabaja
        })
    return out


def safe(fn):
    t = time.time()
    try:
        return {"ok": True, "data": fn(), "ms": int((time.time() - t) * 1000)}
    except Exception as e:  # el HUD muestra el bloque como "sin señal"
        return {"ok": False, "error": f"{type(e).__name__}: {e}"[:200]}


def fecha(iso, hora=True):
    """'jue 15 10:00' a partir de un ISO (con o sin hora)."""
    if not iso:
        return "sin fecha"
    d = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    dias = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"]
    s = f"{dias[d.weekday()]} {d.day}/{d.month}"
    if hora and "T" in iso:
        s += " " + d.astimezone(TZ).strftime("%H:%M")
    return s


def texto(r):
    """Resumen compacto para el modelo: ya filtrado y contado, sin listas enormes."""
    L = [f"FOTO RÁPIDA · {fecha(NOW.isoformat())} (Europe/Madrid)"]
    if r["calendar"]["ok"]:
        ev = r["calendar"]["data"]
        L.append(f"\nAGENDA próximos 7 días ({len(ev)}):" + ("" if ev else " nada programado"))
        L += [f"- {fecha(e['start'].get('dateTime') or e['start'].get('date') if isinstance(e['start'], dict) else e['start'])}"
              f" · {e['title']}" + (f" ({e['location']})" if e.get("location") else "") for e in ev[:10]]
    if r["gmail"]["ok"]:
        m = r["gmail"]["data"]
        L.append(f"\nCORREO no leído de los últimos {ARGS.dias} días, sin promociones/social/boletines TLDR ({len(m)}"
                 f"{'+' if len(m) >= 40 else ''}):" + ("" if m else " nada nuevo"))
        L += [f"- {'[IMPORTANTE] ' if x['important'] else ''}{x['from']} — {x['subject']} (id {x['id']})" for x in m[:12]]
        if len(m) > 12:
            L.append(f"- … y {len(m) - 12} más (pide detalle solo si el señor lo quiere)")
    if r["notion"]["ok"]:
        n = r["notion"]["data"]
        e = n["obj_estados"]
        L.append(f"\nOBJETIVOS: {n['obj_total']} en total · {e['Hecho']} hechos · {e['En curso']} en curso · "
                 f"{e['Pendiente']} pendientes · {e['En riesgo']} en riesgo")
        L += [f"- {a}: {v['hechos']}/{v['total']} hechos" + (f", {v['riesgo']} en riesgo" if v["riesgo"] else "")
              for a, v in n["areas"].items()]
        if n["objetivos"]:
            L.append("Próximos plazos:")
            L += [f"- {fecha(o['fecha'], False)} · {o['semaforo']} · {o['title']} ({o['area']}, {o['estado']})"
                  for o in n["objetivos"]]
        pend = n["tareas"]
        L.append(f"\nTAREAS pendientes ({len(pend)} de {n['tareas_total']}; {n['tareas_hechas']} hechas):"
                 + ("" if pend else " ninguna"))
        L += [f"- {fecha(t['fecha'], False)} · {t['title']} [{t['estado']}{', ' + t['prioridad'] if t['prioridad'] else ''}]"
              for t in pend]
    if r["habitos"]["ok"]:
        L.append("\n" + habitos.texto(r["habitos"]["data"]))
    if r["tiempo"]["ok"]:
        L.append("\nTIEMPO: " + tiempo_texto(r["tiempo"]["data"]))
    caidos = [k for k in ("calendar", "gmail", "notion", "habitos") if not r[k]["ok"]]
    if caidos:
        L.append("\nSIN DATOS de: " + ", ".join(f"{k} ({r[k]['error']})" for k in caidos))
    return "\n".join(L)


# Harvey solo necesita lo del señor; el HUD además quiere servidor y actividad
blocks = {"calendar": calendar, "gmail": gmail, "notion": notion, "habitos": habitos.semana, "tiempo": tiempo}
if not ARGS.texto and not ARGS.cache:
    blocks |= {"system": system, "harvey": harvey, "claude": claude_code, "avisos": vivo.avisos,
               "equipo": tablero.equipo, "cupo": cupo}
with ThreadPoolExecutor(len(blocks)) as ex:
    futs = {k: ex.submit(safe, f) for k, f in blocks.items()}
res = {k: f.result() for k, f in futs.items()}
if ARGS.cache:
    tmp = vivo.CACHE.with_suffix(".tmp")
    tmp.write_text(json.dumps({"t": time.time(), **res}, ensure_ascii=False, default=str), encoding="utf-8")
    os.replace(tmp, vivo.CACHE)
elif ARGS.texto:
    print(texto(res))
else:
    out = json.dumps({"now": NOW.isoformat(), **res}, ensure_ascii=False, default=str)
    tmp = f"{FOTO_HUD}.{os.getpid()}"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(out + "\n")
    os.replace(tmp, FOTO_HUD)
    print(out)
