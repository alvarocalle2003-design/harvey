# Autoprueba sin red del lector de fichas de objetivo de tablero.py: python prueba_tablero.py (en /opt/data/hud)
import os, tempfile
from datetime import date

import tablero

FICHA = """---
estado: activo
desde: 2026-11-01
fecha_limite: 2026-11-30
tablero: negocio
cupo_maximo: 30 % de la ventana de 5 horas por día
---
# Objetivo: Conseguir 3 reuniones con talleres

## Hitos
- [x] Lista de 20 talleres
- [ ] 10 propuestas
- [ ] 3 reuniones

## Estado
Jordan tiene la lista revisada.

## Siguiente paso
- Propuestas para los 5 primeros
"""

with tempfile.TemporaryDirectory() as d:
    for nombre, txt in {"2026-11-talleres.md": FICHA, "_plantilla.md": FICHA, "README.md": "# nada",
                        "2026-11-pausa.md": FICHA.replace("estado: activo", "estado: en pausa")}.items():
        open(os.path.join(d, nombre), "w", encoding="utf-8").write(txt)
    o = {x["id"]: x for x in tablero.objetivos(d, hoy=date(2026, 11, 5))}
    assert set(o) == {"2026-11-talleres", "2026-11-pausa"}, o.keys()  # sin plantilla ni README
    t = o["2026-11-talleres"]
    assert t["titulo"] == "Conseguir 3 reuniones con talleres" and t["hechos"] == 1 and len(t["hitos"]) == 3
    assert t["siguiente"] == "Propuestas para los 5 primeros" and t["situacion"] == "Jordan tiene la lista revisada."
    assert t["semaforo"] == "verde"                    # 1/3 de hitos a los 4 de 29 días
    assert o["2026-11-pausa"]["semaforo"] == "gris"
    assert tablero.objetivos(d, hoy=date(2026, 11, 25))[1]["semaforo"] == "rojo"   # 1/3 con el 83 % del plazo gastado
    assert tablero.objetivos(d, hoy=date(2026, 11, 16))[1]["semaforo"] == "ambar"  # 1/3 con el 52 %
    assert tablero.objetivos(d, hoy=date(2026, 12, 2))[1]["semaforo"] == "rojo"    # plazo vencido
print("tablero.py: lector de objetivos OK")
