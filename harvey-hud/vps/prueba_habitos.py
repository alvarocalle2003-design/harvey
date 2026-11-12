# Autoprueba del vigía de hábitos con datos inventados (no toca Notion): python prueba_habitos.py
from datetime import date, timedelta
import habitos as h

def con(dia, reg):
    h.hoy = lambda: dia
    h.registro = lambda desde, hasta: reg
    return h.vigia()

# jueves 29/10: todo marcado hoy, gym cumplido todos los días, lectura 0 los últimos 3 días, Instagram mal 2 días
reg = {(date(2026, 10, 16) + timedelta(days=i)).isoformat(): {"gym": True, "lectura": 40, "instagram": True} for i in range(14)}
for d in ("2026-10-27", "2026-10-28", "2026-10-29"): reg[d] = {"gym": True, "lectura": 0, "instagram": True}
for d in ("2026-10-28", "2026-10-29"): reg[d]["instagram"] = False
out = con(date(2026, 10, 29), reg)
assert "SIN MARCAR HOY: nada" in out, out
assert "Lectura: lleva 3 días seguidos" in out and "Instagram ≤15 min: lleva 2 días" in out, out
assert "Gimnasio: lleva" not in out and "Lectura: va por detrás" in out, out

# todo cumplido y marcado -> salida vacía (el cron no despierta a la IA)
ok = {k: {"gym": True, "lectura": 40, "instagram": True} for k in reg}
assert con(date(2026, 10, 29), ok) == ""

# hoy sin marcar -> recordatorio aunque todo lo demás vaya bien
del ok["2026-10-29"]
assert "SIN MARCAR HOY: Gimnasio, Lectura, Instagram" in con(date(2026, 10, 29), ok)

# miércoles 28/10 sin gym desde el lunes: 0 de 5, quedan 4 días -> ya no llega (aviso una sola vez, el día que pasa)
g = {k: dict(v) for k, v in ok.items()}
for d in ("2026-10-26", "2026-10-27", "2026-10-28"): g[d]["gym"] = False
out = con(date(2026, 10, 28), g)
assert "esta semana ya no llega" in out and "Gimnasio: lleva 3 días seguidos" in out, out
g["2026-10-29"] = dict(g["2026-10-28"])
assert "ya no llega" not in con(date(2026, 10, 29), g)  # al día siguiente no se repite
print("OK: vigía de hábitos")
