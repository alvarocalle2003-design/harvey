# Autoprueba sin red de los horarios en castellano de sistema.py: python prueba_sistema.py (en /opt/data/hud)
import sistema

c = lambda expr: sistema.cuando({"kind": "cron", "expr": expr, "display": expr})
assert c("*/15 * * * *") == "cada 15 min"
assert c("*/30 8-22 * * *") == "cada 30 min de 8 a 22 h"
assert c("0 8-22/2 * * *") == "cada 2 h de 8 a 22 h"
assert c("0 8 * * *") == "a las 8:00"
assert c("15 10,12,14 * * *") == "a las 10:15, 12:15, 14:15"
assert c("0 3 * * 0") == "domingos a las 3:00"
assert c("0 10 4,11,13 11 *") == "los días 4, 11, 13 de noviembre a las 10:00"
assert c("5 4 L * *") == "5 4 L * *"  # lo raro se queda como está
assert sistema.cuando({"kind": "interval", "minutes": 1}) == "cada 1 min"
assert sistema.cuando({"kind": "once", "run_at": "2026-11-01T06:30:00+01:00"}) == "una vez, el 1 de noviembre a las 6:30"
print("sistema.py: horarios OK")
