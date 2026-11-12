"""Autoprueba del filtro de «Pensamientos de Harvey» (sin red ni IA):
/opt/hermes/.venv/bin/python /opt/data/scripts/prueba_pensamientos.py  -> imprime OK o falla con assert."""
import sys, time
from datetime import datetime

sys.path.insert(0, "/opt/data/scripts")
import pensamientos as p

TZ = p.contexto.TZ
ahora = time.time()
dia = datetime.fromtimestamp(ahora, TZ).replace(hour=15, minute=0)  # media tarde, dentro del horario
H = 3600
pens = lambda hace: {"t": ahora - hace, "tipo": "pensamiento"}
callar = lambda av=(), charlas=(), now=dia: p.motivo_para_callar(now, list(av), sorted(charlas, reverse=True))

assert callar(now=dia.replace(hour=8)) == "fuera de horario"
assert callar(now=dia.replace(hour=22)) == "fuera de horario"
assert callar([{"t": dia.timestamp() - H, "tipo": "seguimiento"}] * 3) == "tope diario"  # cuentan también los seguimientos
assert callar([pens(60)]) == "último pensamiento muy reciente"
assert callar(charlas=[ahora - 5 * 60]) == "está hablando con Harvey ahora"
# dos pensamientos sin respuesta y sin hablar después: se calla
assert callar([pens(30 * H), pens(26 * H)], charlas=[ahora - 40 * H]) == "ignoró los dos últimos"
# si contestó a uno de ellos, vuelve a pensar
assert callar([pens(30 * H), pens(26 * H)], charlas=[ahora - 25 * H]) is None
assert callar() is None
print("OK")
