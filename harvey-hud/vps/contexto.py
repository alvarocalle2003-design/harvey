# Gancho pre_llm_call de Hermes (/opt/data/hud/contexto.py): antes de cada mensaje del señor añade unas líneas de
# contexto (hora, cuánto hace que no hablan, agenda, hábitos, tiempo, avisos que Harvey dio por su cuenta) y un
# recordatorio de su carácter. Sin IA ni red: lee la caché del cron «Contexto» (snapshot.py --cache) y state.db.
# Entrada: JSON de Hermes por stdin. Salida: {"context": "..."} o {} (Hermes lo ignora).
import json, sys, time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

sys.path.insert(0, "/opt/data/hud")
import vivo

TZ = ZoneInfo("Europe/Madrid")
DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
CARACTER = ("Recuerda: eres Harvey, estilo Jarvis. Breve, sereno, con opinión propia; ironía seca solo de vez en cuando "
            "(nivel 2/5) y nunca sobre clientes ni temas sensibles. Usa este contexto solo si aporta; no lo recites.")


def franja(h):
    return "madrugada" if h < 7 else "mañana" if h < 13 else "mediodía" if h < 16 else "tarde" if h < 21 else "noche"


def inicio(e):
    s = e.get("start")
    return (s.get("dateTime") or s.get("date")) if isinstance(s, dict) else s


def lineas(now):
    L = [f"Ahora: {DIAS[now.weekday()]} {now:%d/%m}, {now:%H:%M} ({franja(now.hour)})."]
    previas = vivo.charlas(2)
    # el mensaje actual ya está guardado: la charla anterior es la segunda si la primera es de hace segundos
    antes = previas[1] if len(previas) > 1 and time.time() - previas[0] < 90 else (previas[0] if previas else None)
    if antes:
        L[0] += f" Última vez que el señor te habló antes de este mensaje: hace {vivo.hace(time.time() - antes)}."

    c = vivo.cache()
    if c.get("t") and time.time() - c["t"] > 3600:
        L.append(f"(Datos de agenda y hábitos de hace {vivo.hace(time.time() - c['t'])}.)")
    if c.get("tiempo", {}).get("ok"):
        t = c["tiempo"]["data"]
        hoy, man = t["dias"]
        L.append(f"Tiempo en Portugalete: ahora {t['ahora']['temp']} °C, {t['ahora']['cielo']}; hoy {hoy['min']}-{hoy['max']} °C"
                 f" ({hoy['cielo']}, {hoy['lluvia']} % de lluvia); mañana {man['min']}-{man['max']} °C ({man['cielo']},"
                 f" {man['lluvia']} % de lluvia).")
    if c.get("calendar", {}).get("ok"):
        limite = now + timedelta(hours=36)
        ev = []
        for e in c["calendar"]["data"]:
            i = inicio(e) or ""
            try:
                d = datetime.fromisoformat(i.replace("Z", "+00:00"))
                d = d if d.tzinfo else d.replace(tzinfo=TZ)
            except ValueError:
                continue
            if now - timedelta(hours=2) <= d <= limite:
                ev.append(f"{DIAS[d.weekday()][:3]} {d.astimezone(TZ):%H:%M} {e.get('title')}" if "T" in i
                          else f"{DIAS[d.weekday()][:3]} (todo el día) {e.get('title')}")
        L.append("Agenda próximas 36 h: " + ("; ".join(ev[:4]) if ev else "nada."))
    if c.get("notion", {}).get("ok"):
        hoy_iso = now.date().isoformat()
        vencen = [t["title"] for t in c["notion"]["data"]["tareas"] if t.get("fecha") and t["fecha"][:10] <= hoy_iso]
        if vencen:
            L.append(f"Tareas que vencen hoy o atrasadas ({len(vencen)}): " + "; ".join(vencen[:3]) + ".")
    if c.get("habitos", {}).get("ok"):
        h = c["habitos"]["data"]
        dia = next((x for x in h["dias"] if x["fecha"] == now.date().isoformat()), None)
        if dia:
            est = lambda v, k: "sin marcar" if v is None else (f"{v} min" if k == "lectura" else "sí" if v else "no")
            m, p = h["metas"], h["progreso"]
            L.append(f"Hábitos hoy: gimnasio {est(dia['gym'], 'gym')}, lectura {est(dia['lectura'], 'lectura')}, "
                     f"Instagram ≤15 min {est(dia['instagram'], 'instagram')}. Semana: gimnasio {p['gym']}/{m['gym']} días, "
                     f"lectura {p['lectura']}/{m['lectura']} min, Instagram {p['instagram']}/{m['instagram']} días.")
    if c.get("gmail", {}).get("ok"):
        imp = [m for m in c["gmail"]["data"] if m.get("important")]
        if imp:
            L.append(f"Correo importante sin leer ({len(imp)}): " + "; ".join(f"{m['from']}: {m['subject']}" for m in imp[:2]) + ".")

    av = vivo.avisos(12)
    if av:
        L.append("Avisos que le llegaron de ti sin que preguntara (últimas 12 h; si contesta «sí» o «apúntalo», se refiere al último): "
                 + " | ".join(f"{datetime.fromtimestamp(a['t'], TZ):%H:%M} {a['tipo']} «{a['texto'][:220]}»" for a in av[-3:]))
    seg = vivo.seguimientos_pendientes()
    if seg:
        L.append("Seguimientos que tienes programados: " + "; ".join(f"{n} ({r[:16].replace('T', ' ')})" for n, r in seg[:4]) + ".")
    return L


def main():
    try:
        extra = json.load(sys.stdin).get("extra") or {}
    except ValueError:
        extra = {}
    # cron y subagentes ya traen su propio contexto
    if extra.get("platform") == "cron" or extra.get("parent_session_id"):
        print("{}")
        return
    try:
        cuerpo = lineas(datetime.now(TZ))
    except Exception as e:  # nunca bloquear una respuesta por el contexto
        cuerpo = [f"(Contexto no disponible: {type(e).__name__})"]
    print(json.dumps({"context": "[Contexto automático de Harvey, no visible para el señor]\n" + "\n".join(cuerpo)
                      + "\n" + CARACTER}, ensure_ascii=False))


if __name__ == "__main__":
    main()
