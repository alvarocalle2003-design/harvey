# Piezas comunes de «Harvey vivo» (/opt/data/hud/vivo.py): lo que Harvey dijo por iniciativa propia, cuándo habló
# el señor por última vez y la caché de contexto que refresca el cron «Contexto» (snapshot.py --cache).
# La usan snapshot.py (HUD), contexto.py (gancho de cada mensaje) y pensamientos.py (cron).
import json, sqlite3, time
from pathlib import Path

CRON_OUT = Path("/opt/data/cron/output")
JOBS = Path("/opt/data/cron/jobs.json")
CACHE = Path("/opt/data/hud/contexto_cache.json")
PENSAMIENTOS = "Pensamientos de Harvey"   # nombre exacto del cron
SEGUIMIENTO = "Seguimiento"               # prefijo de los seguimientos que programa Harvey
RECORDATORIO = "Recordatorio"             # prefijo de los «recuérdame…» del señor
CARTERO = "138ae670470c"                  # cron «Cartero» (correo importante, ya filtrado)
CUPO = "Cupo de ChatGPT"                  # cron sin IA que avisa cuando queda poco cupo de Codex
EQUIPO = "Equipo de Harvey"               # cron sin IA: encargo terminado o tarjeta que espera al señor


def respuesta(txt):
    """Lo que dijo el cron: tras «## Response» si pasó por la IA; tras la primera «---» si es un cron sin IA."""
    if "\n## Response\n" in txt:
        return txt.split("\n## Response\n", 1)[1].strip()
    return txt.split("\n---\n", 1)[1].strip() if "**Mode:** no_agent" in txt[:400] and "\n---\n" in txt else ""


def tipo_aviso(carpeta, txt):
    """Qué clase de aviso es la salida de un cron, o None si no es un aviso para el señor.
    Misma regla que movil/server.mjs (avisoDe). Cualquier cron de una sola vez cuenta como recordatorio, aunque Harvey
    no le haya puesto el prefijo (el 20/10 «Llamar a Beti» no llegó ni al iPhone ni al HUD)."""
    nombre = txt.split("\n", 1)[0].removeprefix("# Cron Job:").strip()
    if carpeta == CARTERO:
        return "correo"
    if nombre.startswith(PENSAMIENTOS):
        return "pensamiento"
    if nombre.startswith(SEGUIMIENTO):
        return "seguimiento"
    if nombre.startswith(CUPO):
        return "cupo"
    if nombre.startswith(EQUIPO):
        return "equipo"
    if nombre.startswith(RECORDATORIO) or "\n**Schedule:** once at" in txt[:400]:
        return "recordatorio"
    return None


def avisos(horas=12):
    """Lo que le llegó al señor por iniciativa de Harvey (pensamientos, seguimientos, recordatorios y correo importante)
    en las últimas `horas`, del más antiguo al más reciente."""
    desde, out = time.time() - horas * 3600, []
    for f in CRON_OUT.glob("*/*.md"):
        t = f.stat().st_mtime
        if t < desde:
            continue
        txt = f.read_text(encoding="utf-8", errors="replace")
        tipo = tipo_aviso(f.parent.name, txt)
        resp = respuesta(txt) if tipo else ""
        if resp and "[SILENT]" not in resp:
            nombre = txt.split("\n", 1)[0].removeprefix("# Cron Job:").strip()
            out.append({"id": f"{f.parent.name}/{f.stem}", "t": t, "nombre": nombre, "texto": resp, "tipo": tipo})
    return sorted(out, key=lambda a: a["t"])


def seguimientos_pendientes():
    """[(nombre, próxima ejecución ISO)] de los seguimientos aún por saltar."""
    try:
        jobs = json.loads(JOBS.read_text())["jobs"]
    except (OSError, ValueError, KeyError):
        return []
    return [(j["name"], j.get("next_run_at") or "") for j in jobs
            if (j.get("name") or "").startswith(SEGUIMIENTO) and j.get("enabled") and j.get("state") == "scheduled"]


def charlas(n=2):
    """Horas (epoch) de los últimos n mensajes del señor en HUD, móvil, Siri o Telegram (lo más reciente primero)."""
    db = sqlite3.connect("file:/opt/data/state.db?mode=ro", uri=True)
    try:
        return [r[0] for r in db.execute(
            "select m.timestamp from messages m join sessions s on s.id=m.session_id where m.role='user'"
            " and s.source in ('api_server','telegram','tui','cli') and s.parent_session_id is null"
            " and coalesce(s.session_key,'') not in ('claude-code') and coalesce(s.session_key,'') not like 'movil-prueba%'"
            # Hermes 0.22.5: la clave del cliente está en state_meta y los turnos del señor son 'internal_notification';
            # los automáticos (subagentes, despertador, avisos del tablero, compactación) empiezan por «[»; sus
            # respuestas a un aviso también, pero con «[El señor contesta»
            " and coalesce(m.display_kind,'internal_notification')='internal_notification'"
            " and (m.content not like '[%' or m.content like '[El señor contesta%')"
            " and s.id not in (select value from state_meta where key like 'gateway.api.conversation.v1.claude-code%'"
            " or key like 'gateway.api.conversation.v1.movil-prueba%')"
            " order by m.timestamp desc limit ?", (n,))]
    finally:
        db.close()


def cache():
    """Última foto guardada por el cron «Contexto» (o {} si aún no hay)."""
    try:
        return json.loads(CACHE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def hace(segundos):
    m = int(segundos // 60)
    if m < 1:
        return "menos de un minuto"
    if m < 60:
        return f"{m} min"
    if m < 48 * 60:
        return f"{m // 60} h {m % 60:02d} min"
    return f"{m // 1440} días"
