# Agenda del señor (Google Calendar principal). Única puerta para Harvey: una llamada, busca por parecido y comprueba lo escrito.
#   agenda.py [--desde F] [--dias 7]                            -> eventos (texto)
#   agenda.py crear "Título" INICIO [--fin F | --duracion 60] [--lugar L] [--notas N]   (sin hora = todo el día)
#   agenda.py mover "texto" NUEVO_INICIO [--fecha F]           -> conserva la duración
#   agenda.py editar "texto" [--titulo T] [--lugar L] [--notas N] [--fecha F]
#   agenda.py borrar "texto" [--fecha F]
# Fechas como tareas.py: AAAA-MM-DD, DD/MM, «15 de octubre de 2027», hoy, mañana, lunes..domingo, + hora (18:00).
# --fecha acota la búsqueda a ese día cuando hay dos parecidos. Salida: una línea; código 2 = duda o no encontrado.
import argparse, os, subprocess, sys
from datetime import date, datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from parecido import TZ, bonita, elegir, fecha, hoy, norm

sys.path.insert(0, "/opt/data/skills/productivity/google-workspace/scripts")
import google_api  # credenciales del señor ya autorizadas (renueva el token solo)

FOTO_HUD = "/opt/data/hud/snapshot_hud.json"
CAL = "primary"


def servicio():
    return google_api.build_service("calendar", "v3").events()


def inicio(e):
    s = e.get("start", {})
    return s.get("dateTime") or s.get("date")


def evento(e):
    return {"id": e["id"], "titulo": e.get("summary") or "(sin título)", "inicio": inicio(e),
            "fin": e.get("end", {}).get("dateTime") or e.get("end", {}).get("date"), "lugar": e.get("location") or ""}


def rango(ev, desde, hasta):
    r = ev.list(calendarId=CAL, timeMin=desde.isoformat(), timeMax=hasta.isoformat(), singleEvents=True,
                orderBy="startTime", maxResults=2500).execute()
    return [evento(e) for e in r.get("items", []) if e.get("status") != "cancelled"]


def dia0(d):
    return datetime.combine(d, datetime.min.time(), TZ)


def buscar(ev, q, en_dia):
    if en_dia:  # acotado a un día concreto
        d = fecha(en_dia)
        d = d.date() if isinstance(d, datetime) else d
        cand = rango(ev, dia0(d), dia0(d + timedelta(days=1)))
    else:  # del mes pasado a dos años vista (el señor apunta cosas para 2027)
        cand = rango(ev, dia0(hoy() - timedelta(days=31)), dia0(hoy() + timedelta(days=730)))
        futuros = [e for e in cand if (e["inicio"] or "")[:10] >= hoy().isoformat()]
        e, _ = elegir(q, futuros, detalle=lambda e: f" ({bonita(e['inicio'])})")
        if e:
            return e
    e, duda = elegir(q, cand, detalle=lambda e: f" ({bonita(e['inicio'])})")
    if not e:
        print(duda)
        sys.exit(2)
    return e


def cuerpo_hora(v):
    """Campo start/end de Google a partir de date (todo el día) o datetime."""
    return {"date": v.isoformat()} if not isinstance(v, datetime) else {"dateTime": v.isoformat(), "timeZone": "Europe/Madrid"}


def linea(e):
    return f"«{e['titulo']}» · {bonita(e['inicio'])}" + (f"–{e['fin'][11:16]}" if "T" in (e["fin"] or "") and "T" in e["inicio"] else "") \
        + (f" · {e['lugar']}" if e["lugar"] else "")


def comprobar(ev, eid, esperado):
    e = evento(ev.get(calendarId=CAL, eventId=eid).execute())
    mal = [k for k, v in esperado.items() if (e[k] or "")[:16] != v[:16]]
    if mal:
        sys.exit(f"Google Calendar no refleja el cambio en {', '.join(mal)} de «{e['titulo']}». No lo des por hecho.")
    return e


def fmt(v):
    return v.isoformat() if not isinstance(v, datetime) else v.isoformat(timespec="minutes")


def crear(ev, a):
    if len(a.textos) < 2:
        sys.exit('Uso: agenda.py crear "Título" INICIO [--fin F | --duracion MIN]')
    titulo, ini = a.textos[0].strip(), fecha(" ".join(a.textos[1:]))
    if a.fin:
        fin = fecha(a.fin, ini.date() if isinstance(ini, datetime) else ini)
        if not isinstance(fin, datetime) and isinstance(ini, datetime):
            sys.exit("--fin necesita hora si el inicio la tiene")
    else:
        fin = ini + timedelta(minutes=a.duracion) if isinstance(ini, datetime) else ini + timedelta(days=1)
    d = ini.date() if isinstance(ini, datetime) else ini
    # el HUD a veces manda la misma orden dos veces: no duplicar
    dup = next((e for e in rango(ev, dia0(d), dia0(d + timedelta(days=1)))
                if norm(e["titulo"]) == norm(titulo) and e["inicio"][:16] == fmt(ini)[:16]), None)
    if dup:
        print(f"Ya estaba en la agenda: {linea(dup)}")
        return
    body = {"summary": titulo, "start": cuerpo_hora(ini), "end": cuerpo_hora(fin)}
    if a.lugar:
        body["location"] = a.lugar
    if a.notas:
        body["description"] = a.notas
    eid = ev.insert(calendarId=CAL, body=body).execute()["id"]
    print(f"✓ En la agenda: {linea(comprobar(ev, eid, {'titulo': titulo, 'inicio': fmt(ini)}))}")


def mover(ev, a):
    if len(a.textos) < 2:
        sys.exit('Uso: agenda.py mover "texto" NUEVO_INICIO')
    e = buscar(ev, a.textos[0], a.fecha)
    raw = ev.get(calendarId=CAL, eventId=e["id"]).execute()
    ini = fecha(" ".join(a.textos[1:]))
    viejo_ini, viejo_fin = inicio(raw), raw["end"].get("dateTime") or raw["end"]["date"]
    if "T" in viejo_ini and not isinstance(ini, datetime):  # «muévelo al viernes»: misma hora, otro día
        ini = datetime.combine(ini, datetime.fromisoformat(viejo_ini).astimezone(TZ).timetz())
    dur = (datetime.fromisoformat(viejo_fin) - datetime.fromisoformat(viejo_ini)) if "T" in viejo_ini else \
        (date.fromisoformat(viejo_fin) - date.fromisoformat(viejo_ini))
    if isinstance(ini, datetime) and "T" not in viejo_ini:
        dur = timedelta(hours=1)  # pasa de «todo el día» a una hora concreta
    ev.patch(calendarId=CAL, eventId=e["id"], body={"start": cuerpo_hora(ini), "end": cuerpo_hora(ini + dur)}).execute()
    print(f"✓ Movido: {linea(comprobar(ev, e['id'], {'inicio': fmt(ini)}))} (antes {bonita(viejo_ini)})")


def editar(ev, a):
    e = buscar(ev, a.textos[0], a.fecha)
    body = {k: v for k, v in {"summary": a.titulo, "location": a.lugar, "description": a.notas}.items() if v is not None}
    if not body:
        sys.exit("No has dicho qué cambiar (--titulo, --lugar o --notas)")
    ev.patch(calendarId=CAL, eventId=e["id"], body=body).execute()
    print(f"✓ Cambiado: {linea(comprobar(ev, e['id'], {'titulo': a.titulo} if a.titulo else {}))}")


def borrar(ev, a):
    e = buscar(ev, a.textos[0], a.fecha)
    ev.delete(calendarId=CAL, eventId=e["id"]).execute()
    if ev.get(calendarId=CAL, eventId=e["id"]).execute().get("status") != "cancelled":
        sys.exit(f"Google no ha borrado «{e['titulo']}». No lo des por hecho.")
    print(f"✓ Borrado de la agenda: {linea(e)}")


def listar(ev, a):
    d = fecha(a.desde) if a.desde else hoy()
    d = d.date() if isinstance(d, datetime) else d
    es = rango(ev, dia0(d), dia0(d + timedelta(days=a.dias)))
    print(f"AGENDA del {bonita(d)} al {bonita(d + timedelta(days=a.dias - 1))}: " + (f"{len(es)} eventos" if es else "nada"))
    for e in es:
        print(f"- {linea(e)}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Agenda del señor en Google Calendar")
    ap.add_argument("accion", nargs="?", choices=["crear", "mover", "editar", "borrar"])
    ap.add_argument("textos", nargs="*")
    for o in ("--fecha", "--fin", "--lugar", "--notas", "--titulo", "--desde"):
        ap.add_argument(o)
    ap.add_argument("--duracion", type=int, default=60)
    ap.add_argument("--dias", type=int, default=7)
    a = ap.parse_args()
    try:
        ev = servicio()
        if not a.accion:
            listar(ev, a)
        elif not a.textos:
            sys.exit(f'Uso: agenda.py {a.accion} "texto" ...')
        else:
            {"crear": crear, "mover": mover, "editar": editar, "borrar": borrar}[a.accion](ev, a)
            try:
                os.remove(FOTO_HUD)  # los HUD no deben ver la agenda vieja durante 40 s
            except OSError:
                pass
            # el gancho de contexto de Harvey lee esta caché (agenda de 36 h)
            subprocess.Popen(["/opt/hermes/.venv/bin/python", "/opt/data/hud/snapshot.py", "--cache"],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    except ValueError as e:
        sys.exit(str(e))
