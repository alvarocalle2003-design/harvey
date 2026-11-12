# Hábitos del señor: 3 casillas diarias en la base Hábitos de Notion (columnas Gym, Lectura (min), Instagram OK).
# Única puerta para los dos HUDs, Harvey y el cron de las 22:00 (/opt/hermes/.venv/bin/python /opt/data/hud/habitos.py):
#   habitos.py                                      -> JSON de la semana (lunes-domingo) con progreso
#   habitos.py marcar gym|instagram si|no|nada [--fecha AAAA-MM-DD]
#   habitos.py marcar lectura <minutos>|nada [--fecha AAAA-MM-DD]   (0 = hoy no he leído)  -> escribe y devuelve el JSON
#   habitos.py --texto                              -> resumen para Harvey
#   habitos.py --vigia                              -> cron 22:00: vacío si todo está marcado y no hay rachas malas
# Cada hábito tiene 3 estados: sin marcar (None) / cumplido / no cumplido. Un día pasado sin marcar cuenta como no cumplido.
import argparse, fcntl, json, os, sys, urllib.request
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

DS = "02b6956c-993d-4e4e-a547-720e077cfbc4"
INICIO = date(2026, 10, 16)                         # antes de este día no se registraba: no cuenta
METAS = {"gym": 5, "lectura": 240, "instagram": 7}  # por semana: días, minutos, días
COL = {"gym": "Gym", "lectura": "Lectura (min)", "instagram": "Instagram OK"}
NOMBRE = {"gym": "Gimnasio", "lectura": "Lectura", "instagram": "Instagram ≤15 min"}
HITOS = {"gym": (3, 5, 7), "lectura": (3, 5, 7), "instagram": (2, 3, 5, 7)}  # días seguidos fallando que merecen aviso
PAGINAS = "/opt/data/hud/habitos_paginas.json"      # fecha -> página de Notion (la búsqueda de Notion tarda en ver las nuevas)
FOTO_HUD = "/opt/data/hud/snapshot_hud.json"        # foto compartida de los HUD (snapshot.py): se tira al marcar
DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]


def hoy():
    return datetime.now(ZoneInfo("Europe/Madrid")).date()


def env(name):
    for line in open("/opt/data/.env", encoding="utf-8"):
        if line.startswith(name + "="):
            return line.split("=", 1)[1].strip().strip('"')


def api(method, path, body=None):
    req = urllib.request.Request("https://api.notion.com/v1/" + path, json.dumps(body).encode() if body is not None else None,
                                 {"Authorization": "Bearer " + env("NOTION_API_KEY"), "Notion-Version": "2025-09-03",
                                  "Content-Type": "application/json"}, method=method)
    return json.load(urllib.request.urlopen(req, timeout=30))


def filas(desde, hasta):
    f = {"and": [{"property": "Fecha", "date": {"on_or_after": desde.isoformat()}},
                 {"property": "Fecha", "date": {"on_or_before": hasta.isoformat()}}]}
    out, cur = [], None
    while True:
        r = api("POST", f"data_sources/{DS}/query", {"page_size": 100, "filter": f, **({"start_cursor": cur} if cur else {})})
        out += r["results"]
        if not r.get("has_more"):
            return out
        cur = r["next_cursor"]


def registro(desde, hasta):
    """{'AAAA-MM-DD': {gym, lectura, instagram}}. Si un día tuviera dos filas, gana el primer valor no vacío."""
    reg = {}
    for p in filas(desde, hasta):
        pr = p["properties"]
        d = ((pr["Fecha"]["date"] or {}).get("start") or "")[:10]
        if not d:
            continue
        sino = lambda k: None if not pr[COL[k]]["select"] else pr[COL[k]]["select"]["name"] == "Sí"
        dia = reg.setdefault(d, dict.fromkeys(COL))
        for k, v in {"gym": sino("gym"), "lectura": pr[COL["lectura"]]["number"], "instagram": sino("instagram")}.items():
            if dia[k] is None:
                dia[k] = v
    return reg


def hecho(k, v):
    return (v or 0) > 0 if k == "lectura" else v is True


def semana(ref=None, reg=None):
    t = hoy()
    ref = ref or t
    lunes = ref - timedelta(days=ref.weekday())
    reg = reg if reg is not None else registro(lunes, lunes + timedelta(days=6))
    dias = [{"fecha": (d := lunes + timedelta(days=i)).isoformat(), "activo": INICIO <= d <= t,
             **reg.get(d.isoformat(), dict.fromkeys(COL))} for i in range(7)]
    validos = [x for x in dias if x["fecha"] >= INICIO.isoformat()]
    # la semana en que se empezó a registrar tiene metas proporcionales a los días que quedaban
    metas = {k: round(m * len(validos) / 7) for k, m in METAS.items()}
    progreso = {"gym": sum(hecho("gym", x["gym"]) for x in validos), "lectura": sum(x["lectura"] or 0 for x in validos),
                "instagram": sum(hecho("instagram", x["instagram"]) for x in validos)}
    return {"hoy": t.isoformat(), "dias": dias, "metas": metas, "progreso": progreso}


def valor(k, v):
    if v in ("nada", ""):
        return None
    if k == "lectura":
        n = int(v)
        if not 0 <= n <= 1440:
            sys.exit("Minutos de lectura fuera de rango (0-1440)")
        return n
    if v.lower() in ("si", "sí"):
        return True
    if v.lower() == "no":
        return False
    sys.exit("Valor no válido: usa si, no o nada")


def marcar(k, v, d):
    if k not in COL:
        sys.exit("Hábito desconocido: gym, lectura o instagram")
    if not INICIO <= d <= hoy():
        sys.exit(f"Solo se pueden marcar días entre el {INICIO:%d/%m} y hoy")
    v = valor(k, v)
    prop = {"number": v} if k == "lectura" else {"select": None if v is None else {"name": "Sí" if v else "No"}}
    with open(__file__) as lk:
        fcntl.flock(lk, fcntl.LOCK_EX)  # dos toques seguidos (PC, móvil o Harvey) no deben crear dos filas del mismo día
        try:
            pags = json.load(open(PAGINAS))
        except (OSError, ValueError):
            pags = {}
        pid = pags.get(d.isoformat()) or next((p["id"] for p in filas(d, d)), None)
        if pid:
            api("PATCH", f"pages/{pid}", {"properties": {COL[k]: prop}})
        else:
            pid = api("POST", "pages", {"parent": {"type": "data_source_id", "data_source_id": DS}, "properties": {
                "Día": {"title": [{"text": {"content": d.isoformat()}}]}, "Fecha": {"date": {"start": d.isoformat()}},
                COL[k]: prop}})["id"]
        pags[d.isoformat()] = pid
        tmp = PAGINAS + ".tmp"
        json.dump({f: p for f, p in pags.items() if f >= (hoy() - timedelta(days=40)).isoformat()}, open(tmp, "w"))
        os.replace(tmp, PAGINAS)
    try:
        os.remove(FOTO_HUD)  # el otro HUD no debe ver la casilla antigua durante 40 s
    except OSError:
        pass
    s = semana(d)
    # la consulta de Notion puede no reflejar aún lo recién escrito: el valor que manda es el que acabamos de poner
    next(x for x in s["dias"] if x["fecha"] == d.isoformat())[k] = v
    return semana(d, {x["fecha"]: {c: x[c] for c in COL} for x in s["dias"]})


def celda(k, v):
    if v is None:
        return "·"
    if k == "lectura":
        return f"{v}'" if v else "✗"
    return "✓" if v else "✗"


def horas(m):
    return f"{m // 60} h {m % 60:02d}" if m >= 60 else f"{m} min"


def texto(s):
    m, p, d = s["metas"], s["progreso"], s["dias"]
    L = [f"HÁBITOS semana {d[0]['fecha'][8:]}/{d[0]['fecha'][5:7]}–{d[6]['fecha'][8:]}/{d[6]['fecha'][5:7]}"
         + (" (el registro empezó a mitad de semana: metas reducidas)" if m["gym"] < METAS["gym"] else "") + ":",
         f"- Gimnasio: HECHO {p['gym']} de una META de {m['gym']} días",
         f"- Lectura: HECHO {horas(p['lectura'])} de una META de {horas(m['lectura'])}",
         f"- Instagram ≤15 min: CUMPLIDO {p['instagram']} de {m['instagram']} días",
         "- Días L-D: " + " | ".join(f"{k}: " + " ".join(celda(k, x[k]) if x["activo"] else "-" for x in s["dias"]) for k in COL),
         "  (✓ cumplido, ✗ no, · sin marcar, - no cuenta/futuro; lectura en minutos)"]
    return "\n".join(L)


def vigia():
    t = hoy()
    if t < INICIO:
        return ""
    reg = registro(max(INICIO, t - timedelta(days=35)), t)
    v = lambda d, k: reg.get(d.isoformat(), {}).get(k)
    s = semana(t, reg)
    m, p = s["metas"], s["progreso"]
    pend = [NOMBRE[k] for k in COL if v(t, k) is None]
    alertas = []
    for k in COL:
        d = t if v(t, k) is not None else t - timedelta(days=1)  # hoy solo cuenta si ya lo ha marcado
        n = 0
        while d >= INICIO and not hecho(k, v(d, k)):
            n, d = n + 1, d - timedelta(days=1)
        if n in HITOS[k] or (n > 7 and n % 7 == 0):
            alertas.append(f"{NOMBRE[k]}: lleva {n} días seguidos sin cumplirlo.")
    resto = 6 - t.weekday()
    if not hecho("gym", v(t, "gym")) and p["gym"] + resto == m["gym"] - 1:
        alertas.append(f"Gimnasio: con {p['gym']} de {m['gym']} y {resto} días por delante, esta semana ya no llega a la meta"
                       + (" (hoy aún sin marcar: puede que sí haya ido)." if v(t, "gym") is None else "."))
    transcurridos = sum(INICIO <= date.fromisoformat(x["fecha"]) <= t for x in s["dias"])
    validos = sum(x["fecha"] >= INICIO.isoformat() for x in s["dias"])
    ritmo = m["lectura"] * transcurridos // validos
    if t.weekday() in (3, 5) and p["lectura"] < ritmo - 30:
        alertas.append(f"Lectura: va por detrás, {horas(p['lectura'])} de {horas(m['lectura'])}; a estas alturas tocaría unos {horas(ritmo)}.")
    if not pend and not alertas:
        return ""
    return "\n".join([f"HOY: {DIAS[t.weekday()]} {t:%d/%m}, 22:00.",
                      "SIN MARCAR HOY: " + (", ".join(pend) if pend else "nada, todo marcado."),
                      "ALERTAS DE RACHA:" + ("".join("\n- " + a for a in alertas) if alertas else " ninguna."),
                      texto(s)])


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("accion", nargs="*", help="marcar <habito> <valor>")
    ap.add_argument("--fecha", type=date.fromisoformat)
    ap.add_argument("--texto", action="store_true")
    ap.add_argument("--vigia", action="store_true")
    a = ap.parse_args()
    if a.accion[:1] == ["marcar"] and len(a.accion) == 3:
        print(json.dumps(marcar(a.accion[1], a.accion[2], a.fecha or hoy()), ensure_ascii=False))
    elif a.accion:
        sys.exit("Uso: habitos.py marcar gym|lectura|instagram <valor> [--fecha AAAA-MM-DD]")
    elif a.vigia:
        print(vigia(), end="")
    elif a.texto:
        print(texto(semana(a.fecha)))
    else:
        print(json.dumps(semana(a.fecha), ensure_ascii=False))
