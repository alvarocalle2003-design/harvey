# Autoprueba sin red de equipo_vigia.py: nombre del encargo (tarjeta raíz), informe de Harvey tras los avisos del tablero,
# «Aprobar» solo cuando terminan todas sus madres, y no dar por terminado un encargo con un «Rehacer» en marcha.
import os, sqlite3, sys, tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import equipo_vigia as v

d = tempfile.mkdtemp()
kdb = os.path.join(d, "k.db")
k = sqlite3.connect(kdb)
k.executescript("""create table tasks (id, title, session_id, created_at, status, assignee, result);
create table task_links (parent_id, child_id);
create table task_events (id integer primary key, task_id, kind, payload);
create table task_runs (id integer primary key, task_id, summary);
insert into tasks values ('a', 'Seleccionar 3 clientes', 'S', 100, 'done', 'jordan', ''),
  ('b', 'Mockups', 'S', 101, 'running', 'leonardo', ''), ('c', 'Archivar: todo', 'S', 102, 'done', 'tomo', ''),
  ('p', 'Aprobar: correos', 'S', 103, 'blocked', 'default', '');
insert into task_links values ('a', 'b'), ('a', 'c'), ('b', 'c'), ('a', 'p'), ('b', 'p');
insert into task_events (task_id, kind, payload) values ('a', 'completed', '{}');""")
k.commit()
assert v.raiz(k, "c") == ("Seleccionar 3 clientes", "S", 100)
assert v.raiz(k, "a")[0] == "Seleccionar 3 clientes"
# «a» termina pero la «Aprobar» aún espera a «b»: no se avisa todavía
assert v.novedades("negocio", kdb, 0)[1] == []

h = os.path.join(d, "h.db")
s = sqlite3.connect(h)
s.executescript("""create table messages (id integer primary key, session_id, role, content, timestamp);
insert into messages (session_id, role, content, timestamp) values
 ('S', 'user', 'Busca 3 clientes', 101), ('S', 'assistant', 'En marcha, señor.', 102),
 ('S', 'user', '[kanban] Task a completed', 103), ('S', 'assistant', '[SILENT]', 104),
 ('S', 'user', '[kanban] Task b completed', 105), ('S', 'assistant', 'Señor, el trabajo está listo.', 106),
 ('S', 'user', '[kanban] Task c completed', 107), ('S', 'assistant', '[SILENT]', 108);""")
s.commit()
v.HARVEY_DB = h
assert v.informe_harvey("S", 100) == "Señor, el trabajo está listo.", v.informe_harvey("S", 100)
assert v.informe_harvey("S", 106) is None  # nada nuevo tras ese momento
assert v.informe_harvey(None, 0) is None
assert v.informe_harvey("S", 100, ["zz"]) is None  # avisos de otras tarjetas (mensajes viejos compactados) no cuentan
assert v.informe_harvey("S", 100, ["b"]) == "Señor, el trabajo está listo."

v.TABLEROS = {"negocio": kdb}
fin = {"tablero": "negocio", "tarjeta": "c", "t": 0}
assert v.fin_de_encargo(fin) is None  # «b» sigue trabajando (como un «Rehacer»): el encargo no ha terminado
k.execute("update tasks set status = 'done' where id = 'b'"); k.commit()
assert v.fin_de_encargo(fin) == "Encargo terminado: «Seleccionar 3 clientes».\n\nEl trabajo está listo.", v.fin_de_encargo(fin)
print("equipo_vigia.py: OK")
