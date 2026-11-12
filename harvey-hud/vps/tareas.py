# Tareas del señor (base Tareas de Notion). Única puerta para Harvey: una llamada, busca por parecido y comprueba lo escrito.
#   tareas.py [--texto] [--todas] [--json]                     -> pendientes (por fecha)
#   tareas.py crear "Título" [--fecha F] [--objetivo O] [--prioridad alta|media|baja] [--notas N]
#   tareas.py hecha "lo de la lotera" ["otra" ...]             -> marca como Hecha (varias a la vez)
#   tareas.py reabrir "texto"                                  -> vuelve a Por hacer
#   tareas.py editar "texto" [--titulo T] [--fecha F|nada] [--objetivo O] [--prioridad P] [--notas N] [--estado E]
#   tareas.py borrar "texto"                                   -> a la papelera de Notion (se recupera 30 días)
# F admite: AAAA-MM-DD, DD/MM, «15 de octubre de 2027», hoy, mañana, lunes..domingo, con hora opcional (18:00).
# Sin --objetivo va a «Genérico» (lo pidió el señor el 14/10). Salida: una línea por acción; código 2 = duda o no encontrada.
import argparse, fcntl, json, os, subprocess, sys, time, urllib.error, urllib.request
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from parecido import TZ, bonita, elegir, fecha, hoy, norm, parecido

DS = "f57016ab-3737-4ab7-a68f-3590e6db8a6c"
DS_OBJ = "ccc745cf-28fe-40be-850d-fa8cbc2bd958"
PRIO = {"alta": "🔥 Alta", "media": "Media", "baja": "Baja"}
ESTADOS = {"por hacer": "Por hacer", "en curso": "En curso", "hecha": "Hecha"}
RECIENTES = "/opt/data/hud/tareas_recientes.json"  # creadas hace <10 min: la consulta de Notion tarda en verlas
FOTO_HUD = "/opt/data/hud/snapshot_hud.json"
PY, SNAPSHOT = "/opt/hermes/.venv/bin/python", "/opt/data/hud/snapshot.py"


def env(name):
    for line in open("/opt/data/.env", encoding="utf-8"):
        if line.startswith(name + "="):
            return line.split("=", 1)[1].strip().strip('"')


def api(method, path, body=None):
    req = urllib.request.Request("https://api.notion.com/v1/" + path, json.dumps(body).encode() if body is not None else None,
                                 {"Authorization": "Bearer " + env("NOTION_API_KEY"), "Notion-Version": "2025-09-03",
                                  "Content-Type": "application/json"}, method=method)
    try:
        return json.load(urllib.request.urlopen(req, timeout=30))
    except urllib.error.HTTPError as e:
        sys.exit(f"Notion rechazó la operación ({e.code}): {e.read().decode()[:300]}")


def todas(ds):
    out, cur = [], None
    while True:
        r = api("POST", f"data_sources/{ds}/query", {"page_size": 100, **({"start_cursor": cur} if cur else {})})
        out += r["results"]
        if not r.get("has_more"):
            return out
        cur = r["next_cursor"]


texto_de = lambda rt: "".join(x["plain_text"] for x in rt)


def tarea(p):
    pr = p["properties"]
    return {"id": p["id"], "titulo": texto_de(pr["Tarea"]["title"]), "estado": (pr["Estado"]["select"] or {}).get("name"),
            "prioridad": (pr["Prioridad"]["select"] or {}).get("name"), "fecha": (pr["Fecha"]["date"] or {}).get("start"),
            "objetivos": [r["id"] for r in pr["Objetivo"]["relation"]], "notas": texto_de(pr["Notas"]["rich_text"]),
            "papelera": p.get("in_trash", False)}


def cargar():
    ts = {t["id"]: t for t in map(tarea, todas(DS))}
    for pid in recientes():  # recién creadas que la consulta aún no devuelve
        if pid not in ts:
            t = tarea(api("GET", f"pages/{pid}"))
            if not t["papelera"]:
                ts[pid] = t
    return list(ts.values())


def recientes(nueva=None):
    try:
        r = json.load(open(RECIENTES))
    except (OSError, ValueError):
        r = {}
    r = {k: v for k, v in r.items() if v > time.time() - 600}
    if nueva:
        r[nueva] = time.time()
        json.dump(r, open(RECIENTES + ".tmp", "w"))
        os.replace(RECIENTES + ".tmp", RECIENTES)
    return list(r)


def objetivos():
    out = []
    for p in todas(DS_OBJ):
        pr = p["properties"]
        out.append({"id": p["id"], "titulo": texto_de(pr["Objetivo"]["title"]),
                    "area": (pr["Área"]["select"] or {}).get("name") or "", "estado": (pr["Estado"]["select"] or {}).get("name")})
    return out


def objetivo(q, objs):
    q = q or "Genérico"
    vivos = [o for o in objs if o["estado"] != "Hecho"] or objs
    por_area = [o for o in vivos if norm(o["area"]) and norm(q) == norm(o["area"])]
    if len(por_area) == 1:
        return por_area[0]
    if por_area:  # «AMET» a secas: hay varios objetivos en esa área
        print(f"El área {por_area[0]['area']} tiene varios objetivos: " + "; ".join(f"«{o['titulo']}»" for o in por_area)
              + ". Dime cuál (--objetivo).")
        sys.exit(2)
    o, duda = elegir(q, vivos, detalle=lambda o: f" ({o['area']})")
    if duda:
        print("Objetivo: " + duda)
        sys.exit(2)
    return o


def fecha_notion(v):
    if v in (None, "nada"):
        return None
    f = fecha(v)
    return {"start": f.isoformat(timespec="minutes") if isinstance(f, datetime) else f.isoformat()}


def props(a, objs=None, titulo=None):
    p = {}
    if titulo:
        p["Tarea"] = {"title": [{"text": {"content": titulo}}]}
    if a.fecha is not None:
        p["Fecha"] = {"date": fecha_notion(a.fecha)}
    if a.objetivo is not None:
        p["Objetivo"] = {"relation": [{"id": objetivo(a.objetivo, objs or objetivos())["id"]}]}
    if a.prioridad:
        p["Prioridad"] = {"select": {"name": PRIO[norm(a.prioridad)]}}
    if a.notas is not None:
        p["Notas"] = {"rich_text": [{"text": {"content": a.notas}}]} if a.notas else {"rich_text": []}
    if getattr(a, "estado", None):
        p["Estado"] = {"select": {"name": ESTADOS[norm(a.estado)]}}
    return p


def comprobar(pid, esperado):
    """Relee la página: lo que Harvey confirme al señor tiene que estar de verdad en Notion."""
    t = tarea(api("GET", f"pages/{pid}"))
    mal = [k for k, v in esperado.items() if t.get(k) != v and not (k == "fecha" and v and (t["fecha"] or "")[:16] == v[:16])]
    if mal:
        sys.exit(f"Notion no refleja el cambio en {', '.join(mal)} de «{t['titulo']}». No lo des por hecho.")
    return t


def nombre_obj(t, objs):
    return next((o["titulo"] for o in objs if o["id"] in t["objetivos"]), "sin objetivo")


def linea(t, objs=None):
    s = f"«{t['titulo']}» · {bonita(t['fecha'])}"
    return s + (f" · {nombre_obj(t, objs)}" if objs is not None else "") + (f" · {t['prioridad']}" if t["prioridad"] not in (None, "Media") else "")


def buscar(q, ts, preferir):
    """Busca primero entre las del estado preferido (pendientes para «hecha», hechas para «reabrir»)."""
    det = lambda t: f" ({bonita(t['fecha'])}, {t['estado']})"
    pref = [t for t in ts if preferir(t)]
    t, duda = elegir(q, pref, detalle=det)
    if t:
        return t, None
    otra, _ = elegir(q, [x for x in ts if not preferir(x)], detalle=det)
    return (None, f"«{otra['titulo']}» ya está «{otra['estado']}».") if otra and parecido(q, otra["titulo"]) >= 0.8 else (None, duda)


def refrescar():
    try:
        os.remove(FOTO_HUD)  # los HUD no deben ver la lista vieja durante 40 s
    except OSError:
        pass
    # el gancho de contexto de Harvey lee esta caché: que no le diga al señor que algo sigue pendiente
    subprocess.Popen([PY, SNAPSHOT, "--cache"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)


def crear(a):
    titulo = a.textos[0].strip()
    if not titulo:
        sys.exit("Falta el título de la tarea")
    ts, objs = cargar(), objetivos()
    a.objetivo = a.objetivo if a.objetivo is not None else "Genérico"
    p = props(a, objs, titulo)
    p.setdefault("Prioridad", {"select": {"name": "Media"}})
    p["Estado"] = {"select": {"name": "Por hacer"}}
    f = (p.get("Fecha", {}).get("date") or {}).get("start")
    # el HUD a veces manda la misma orden dos veces: no duplicar
    dup = next((t for t in ts if t["estado"] != "Hecha" and parecido(titulo, t["titulo"]) >= 0.92 and (t["fecha"] or "")[:10] == (f or "")[:10]), None)
    if dup:
        print(f"Ya estaba apuntada: {linea(dup, objs)}")
        return
    pid = api("POST", "pages", {"parent": {"type": "data_source_id", "data_source_id": DS}, "properties": p})["id"]
    recientes(pid)
    t = comprobar(pid, {"titulo": titulo, "estado": "Por hacer", "fecha": f})
    print(f"✓ Apuntada: {linea(t, objs)}")


def cambiar(a, accion):
    ts = cargar()
    preferir = {"reabrir": lambda t: t["estado"] == "Hecha", "hecha": lambda t: t["estado"] != "Hecha"}.get(accion, lambda t: True)
    errores = 0
    for q in a.textos if accion == "hecha" else a.textos[:1]:
        t, duda = buscar(q, ts, preferir)
        if not t:
            print(duda)
            errores += 1
            continue
        if accion == "borrar":
            api("PATCH", f"pages/{t['id']}", {"in_trash": True})
            if not api("GET", f"pages/{t['id']}").get("in_trash"):
                sys.exit(f"Notion no ha borrado «{t['titulo']}». No lo des por hecho.")
            print(f"✓ Borrada (en la papelera de Notion 30 días): {linea(t)}")
            continue
        if accion == "hecha":
            p, esperado = {"Estado": {"select": {"name": "Hecha"}}}, {"estado": "Hecha"}
        elif accion == "reabrir":
            p, esperado = {"Estado": {"select": {"name": "Por hacer"}}}, {"estado": "Por hacer"}
        else:
            p = props(a, titulo=a.titulo)
            if not p:
                sys.exit("No has dicho qué cambiar (--titulo, --fecha, --objetivo, --prioridad, --notas o --estado)")
            esperado = {k: v for k, v in {"titulo": a.titulo, "estado": p.get("Estado", {}).get("select", {}).get("name"),
                                          "fecha": (p.get("Fecha", {}).get("date") or {}).get("start") if "Fecha" in p else None}.items() if v}
        api("PATCH", f"pages/{t['id']}", {"properties": p})
        n = comprobar(t["id"], esperado)
        print({"hecha": "✓ Hecha: ", "reabrir": "✓ Reabierta: ", "editar": "✓ Cambiada: "}[accion] + linea(n))
    if errores:
        sys.exit(2)


def listar(a):
    ts, objs = cargar(), objetivos()
    pend = sorted((t for t in ts if a.todas or t["estado"] != "Hecha"), key=lambda t: t["fecha"] or "9999")
    if a.json:
        print(json.dumps([t | {"objetivo": nombre_obj(t, objs)} for t in pend], ensure_ascii=False))
        return
    d = hoy().isoformat()
    marca = lambda t: " ⚠ ATRASADA" if t["fecha"] and t["fecha"][:10] < d and t["estado"] != "Hecha" else (" ← HOY" if (t["fecha"] or "")[:10] == d else "")
    print(f"TAREAS {'(todas)' if a.todas else 'pendientes'}: {len(pend)} de {len(ts)}")
    for t in pend:
        print(f"- {linea(t, objs)}{' · ' + t['estado'] if a.todas or t['estado'] == 'En curso' else ''}{marca(t)}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Tareas del señor en Notion")
    ap.add_argument("accion", nargs="?", choices=["crear", "hecha", "reabrir", "editar", "borrar"])
    ap.add_argument("textos", nargs="*")
    for o in ("--fecha", "--objetivo", "--prioridad", "--notas", "--titulo", "--estado"):
        ap.add_argument(o)
    ap.add_argument("--texto", action="store_true")
    ap.add_argument("--todas", action="store_true")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    if a.prioridad and norm(a.prioridad) not in PRIO:
        sys.exit("Prioridad: alta, media o baja")
    if a.estado and norm(a.estado) not in ESTADOS:
        sys.exit("Estado: por hacer, en curso o hecha")
    try:
        if not a.accion:
            listar(a)
            sys.exit(0)
        if not a.textos:
            sys.exit(f"Uso: tareas.py {a.accion} \"texto\"")
        with open(__file__) as lk:
            fcntl.flock(lk, fcntl.LOCK_EX)  # dos órdenes iguales seguidas (HUD duplicado) no deben crear dos filas
            crear(a) if a.accion == "crear" else cambiar(a, a.accion)
        refrescar()
    except ValueError as e:
        sys.exit(str(e))
