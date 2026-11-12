# Autoprueba sin red de parecido.py (lo que usan tareas.py y agenda.py). Debe acabar en «OK».
import os, sys
from datetime import date, datetime, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from parecido import TZ, bonita, elegir, fecha

J = date(2026, 10, 29)  # jueves
f = lambda s: fecha(s, J)
assert f("hoy") == J and f("mañana") == date(2026, 10, 30) and f("pasado mañana") == date(2026, 10, 31)
assert f("sábado") == date(2026, 10, 31) and f("el jueves") == date(2026, 11, 5) and f("el próximo lunes") == date(2026, 11, 2)
assert f("31/10") == date(2026, 10, 31) and f("5/1") == date(2027, 1, 5) and f("15/10/2027") == date(2027, 10, 15)
assert f("15 de octubre de 2027") == date(2027, 10, 15) and f("3 de noviembre") == date(2026, 11, 3)
assert f("2026-11-03") == date(2026, 11, 3)
assert f("2026-11-03T09:30") == datetime(2026, 11, 3, 9, 30, tzinfo=TZ)
assert f("mañana 18:00") == datetime(2026, 10, 30, 18, 0, tzinfo=TZ)
assert f("domingo a las 6:30") == datetime(2026, 11, 1, 6, 30, tzinfo=TZ)
assert f("sábado a las 18") == datetime(2026, 10, 31, 18, 0, tzinfo=TZ)
assert f("viernes 18h") == datetime(2026, 10, 30, 18, 0, tzinfo=TZ)
assert f("18:00") == datetime(2026, 10, 29, 18, 0, tzinfo=TZ)
try:
    f("cuando pueda")
    raise AssertionError("debía fallar")
except ValueError:
    pass

ts = [{"titulo": t} for t in ["Escribir a la lotera", "Pedir cita dentista", "Llamar a San Juan de Dios y pedir cita con el trauma",
                               "Hacer transferencia restante a Andoni", "Apuntarme a 42 Urduliz", "Preguntar a Andoni por cambiar la web de AMET"]]
pick = lambda q: elegir(q, ts)
assert pick("lo de la lotera")[0]["titulo"] == "Escribir a la lotera"
assert pick("inscribir a la lotera")[0]["titulo"] == "Escribir a la lotera"
assert pick("el trauma")[0]["titulo"].startswith("Llamar a San Juan")
assert pick("transferencia a Andoni")[0]["titulo"] == "Hacer transferencia restante a Andoni"
assert pick("42 hordules")[0]["titulo"] == "Apuntarme a 42 Urduliz"
assert pick("Andoni")[0] is None  # dos de Andoni: tiene que preguntar
assert pick("comprar pan")[0] is None
assert pick("cita")[0] is None  # dentista o trauma
assert bonita("2026-10-31") == "sáb 31/10" and bonita("2026-10-31T18:00:00+01:00") == "sáb 31/10 18:00"
print("OK")
