"""Cron «Pensamientos de Harvey» (/opt/data/scripts/pensamientos.py): filtro sin IA antes de que Harvey piense por su cuenta.
Salida vacía = el cron no despierta a la IA. Si hay salida, es el contexto con el que Harvey decide si dice algo o [SILENT].
Reglas (las elige el señor): máx. 3 iniciativas al día contando seguimientos, 9:00-21:59, al menos 2 h 30 entre
pensamientos, nunca si está hablando con Harvey ahora mismo, y si ignora dos seguidos se calla hasta que vuelva a hablarle."""
import sys, time
from datetime import datetime

sys.path.insert(0, "/opt/data/hud")
import contexto, vivo

MAX_DIA, HUECO_H, CHARLA_MIN, IGNORADO_H = 3, 2.5, 20, 3


def motivo_para_callar(now, av, charlas):
    if not 9 <= now.hour < 22:
        return "fuera de horario"
    hoy = [a for a in av if datetime.fromtimestamp(a["t"], contexto.TZ).date() == now.date()]
    if len(hoy) >= MAX_DIA:
        return "tope diario"
    pens = [a for a in av if a["tipo"] == "pensamiento"]
    if pens and time.time() - pens[-1]["t"] < HUECO_H * 3600:
        return "último pensamiento muy reciente"
    if charlas and time.time() - charlas[0] < CHARLA_MIN * 60:
        return "está hablando con Harvey ahora"
    # dos pensamientos seguidos sin respuesta en 3 h y sin hablar desde entonces: silencio hasta que escriba
    ultimos = pens[-2:]
    ignorado = lambda a: not any(a["t"] < c < a["t"] + IGNORADO_H * 3600 for c in charlas)
    if len(ultimos) == 2 and all(map(ignorado, ultimos)) and not any(c > ultimos[-1]["t"] for c in charlas):
        return "ignoró los dos últimos"
    return None


def main():
    now = datetime.now(contexto.TZ)
    # recordatorios y correo no son iniciativas suyas: no cuentan para el tope diario
    av = [a for a in vivo.avisos(72) if a["tipo"] in ("pensamiento", "seguimiento")]
    charlas = vivo.charlas(50)
    motivo = motivo_para_callar(now, av, charlas)
    if motivo:
        print(f"[pensamientos] callado: {motivo}", file=sys.stderr)
        return
    L = contexto.lineas(now)
    c = vivo.cache()
    if c.get("notion", {}).get("ok"):
        n = c["notion"]["data"]
        if n["objetivos"]:
            L.append("Objetivos con plazo más cercano: " + "; ".join(
                f"{o['title']} ({o['area']}, {o['estado']}, {o['semaforo']}, límite {o['fecha']})" for o in n["objetivos"][:5]) + ".")
        if n["tareas"]:
            L.append("Tareas pendientes: " + "; ".join(f"{t['title']} ({t['fecha'] or 'sin fecha'})" for t in n["tareas"][:8]) + ".")
    if c.get("gmail", {}).get("ok"):
        L.append(f"Correos sin leer de los últimos 3 días (sin promociones): {len(c['gmail']['data'])}.")
    antes = [a for a in av if datetime.fromtimestamp(a["t"], contexto.TZ).date() != now.date()]
    if antes:
        L.append("Lo que le dijiste por tu cuenta en días anteriores (no lo repitas): "
                 + " | ".join(f"«{a['texto'][:160]}»" for a in antes[-4:]))
    hoy = sum(datetime.fromtimestamp(a["t"], contexto.TZ).date() == now.date() for a in av)
    L.append(f"Iniciativas ya usadas hoy: {hoy} de {MAX_DIA}.")
    print("\n".join(L))


if __name__ == "__main__":
    main()
