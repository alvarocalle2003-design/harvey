# Cron «Cupo de ChatGPT» (sin IA, cada 15 min): avisa al iPhone y al HUD cuando queda poco cupo de Codex.
# Un aviso por umbral (25 %, 10 %, agotado) y por ventana (5 horas y semanal). Sin novedades no imprime nada: no se envía.
# Freno: con 10 % o menos en cualquier ventana aparca las tarjetas listas del equipo («scheduled», no arrancan) y las
# suelta cuando el cupo vuelve. Las que ya están trabajando terminan.
#   cupo_vigia.py              -> lo que haya que avisar (o nada)
#   cupo_vigia.py --prueba N   -> simula que queda N % en la ventana de 5 horas (no guarda estado ni frena)
import glob, json, os, sqlite3, subprocess, sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Europe/Madrid")
ESTADO = "/opt/data/hud/cupo_estado.json"
UMBRALES = (0, 10, 25)  # % que queda
VENTANA = {"Session": "de 5 horas", "Weekly": "semanal"}
DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]


def cuando(iso):
    h = datetime.fromisoformat(iso).astimezone(TZ)
    hoy = datetime.now(TZ).date()
    dia = "hoy" if h.date() == hoy else "mañana" if h.date() == hoy + timedelta(days=1) else f"el {DIAS[h.weekday()]} {h:%d/%m}"
    return f"{dia} a las {h:%H:%M}"


def avisos(ventanas, estado):
    out = []
    for w in ventanas:
        queda = max(0.0, 100 - (w.get("used_percent") or 0))
        clave = f"{w['label']}|{w.get('resets_at')}"
        umbral = next((u for u in UMBRALES if queda <= u), None)  # el más bajo que ha cruzado
        if umbral is None or umbral >= estado.get(clave, 101):
            continue
        estado[clave] = umbral
        nombre = VENTANA.get(w["label"], w["label"])
        out.append(f"se ha agotado el cupo {nombre} de ChatGPT; vuelve {cuando(w['resets_at'])}." if umbral == 0 else
                   f"queda el {queda:.0f} % del cupo {nombre} de ChatGPT; se renueva {cuando(w['resets_at'])}.")
    return out


FRENO = 10  # % que queda


def kanban(slug, *args):
    subprocess.run(["/opt/hermes/bin/hermes", "kanban", "--board", slug, *args], capture_output=True, timeout=90)


def freno(ventanas, estado):
    """Aparca o suelta las tarjetas listas según el cupo; devuelve el aviso (o None)."""
    queda = min((100 - (w.get("used_percent") or 0) for w in ventanas), default=100)
    aparcadas = estado.setdefault("freno", {})
    if queda > FRENO:
        if not aparcadas:
            return None
        for slug, ids in aparcadas.items():
            kanban(slug, "unblock", *ids, "--reason", "Cupo renovado: sigue el trabajo")
        n = sum(map(len, aparcadas.values()))
        aparcadas.clear()
        return f"el cupo de ChatGPT se ha renovado y el equipo retoma {n} tarjeta{'s' * (n != 1)} que tenía en espera."
    nuevas = 0
    for db in glob.glob("/opt/data/kanban/boards/*/kanban.db"):
        slug = os.path.basename(os.path.dirname(db))
        c = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
        ids = [r[0] for r in c.execute("select id from tasks where status = 'ready'")]
        c.close()
        if ids:
            # el motivo va antes de --ids, que se traga todo lo que le sigue
            kanban(slug, "schedule", ids[0], f"Freno de cupo: queda el {queda:.0f} %; vuelve sola cuando se renueve",
                   *(["--ids", *ids[1:]] if ids[1:] else []))
            aparcadas.setdefault(slug, []).extend(ids)
            nuevas += len(ids)
    if nuevas and sum(map(len, aparcadas.values())) == nuevas:  # se avisa al echar el freno, no en cada vuelta
        return (f"he frenado al equipo: {nuevas} tarjeta{'s' * (nuevas != 1)} espera{'n' * (nuevas != 1)} "
                "a que se renueve el cupo.")
    return None


if __name__ == "__main__":
    if sys.argv[1:2] == ["--prueba"]:
        fin = (datetime.now(TZ) + timedelta(hours=2)).isoformat()
        a = avisos([{"label": "Session", "used_percent": 100 - float(sys.argv[2]), "resets_at": fin}], {})
    else:
        r = subprocess.run(["/opt/hermes/bin/hermes", "usage", "--json"], capture_output=True, text=True, timeout=90)
        try:
            ventanas = json.loads(r.stdout).get("windows") or []
        except ValueError:
            sys.exit(0)  # sin datos de OpenAI: mejor callar que avisar en falso
        try:
            estado = json.load(open(ESTADO))
        except (OSError, ValueError):
            estado = {}
        a = avisos(ventanas, estado)
        f = freno(ventanas, estado)
        if f:
            a.append(f)
        limite = (datetime.now(TZ) - timedelta(days=8)).isoformat()
        json.dump({k: v for k, v in estado.items() if k == "freno" or k.split("|", 1)[1] >= limite}, open(ESTADO, "w"))
        # lo último medido, para la barra del HUD (snapshot.py, bloque «cupo»)
        json.dump({"ventanas": ventanas, "freno": bool(estado.get("freno")), "t": datetime.now(TZ).isoformat()},
                  open("/opt/data/hud/cupo_ultimo.json", "w"))
    if a:
        print("Señor, " + " Además, ".join(a) + " Si se agota, el equipo tirará de los créditos que tenga recargados en ChatGPT;"
              " si no hay, esperará a la renovación.")
