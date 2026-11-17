# Autoprueba de claude-encargo con un Claude falso (no gasta nada): lanzar, estado mientras trabaja, estado al terminar,
# no dos a la vez en el mismo repo, seguir con la misma conversación, y el tope de tiempo (corta a Claude y a sus hijos).  python3 prueba_claude_encargo.py /opt/data/bin/claude-encargo
import os, subprocess, sys, tempfile, time

SCRIPT = sys.argv[1]
d = tempfile.mkdtemp(dir="/opt/data/workspace")  # dentro de workspace: ahí busca el candado de «uno por repo»
repo, tarjeta = os.path.join(d, "repo"), os.path.join(d, "tarjeta")
os.makedirs(repo); os.makedirs(tarjeta)
subprocess.run(["git", "init", "-q", repo], check=True)
falso = os.path.join(d, "claude-falso")
with open(falso, "w") as f:  # imita la salida stream-json de claude -p; crea un archivo y tarda 2 s
    f.write("""#!/bin/sh
echo "$@" > args.txt
echo '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Write","input":{"file_path":"hola.txt"}}]}}'
echo hola > hola.txt
[ -f lento ] && { sleep 60 & echo $! > hijo.pid; echo '{"type":"system","subtype":"init","session_id":"ses-lento"}'; wait; }
sleep 2
echo '{"type":"assistant","message":{"content":[{"type":"text","text":"Hecho: hola.txt creado"}]}}'
echo '{"type":"result","subtype":"success","is_error":false,"num_turns":3,"duration_ms":2000,"result":"Informe: todo bien","session_id":"ses-123"}'
""")
os.chmod(falso, 0o755)
encargo = os.path.join(tarjeta, "ENCARGO.md")
with open(encargo, "w") as f:
    f.write("Crea hola.txt")
env = dict(os.environ, CLAUDE_ENCARGO_BIN=falso)
run = lambda *a: subprocess.run([sys.executable, SCRIPT, *a], capture_output=True, text=True, env=env)

r = run("lanzar", repo, encargo, "documentar")
assert r.returncode == 0 and "segundo plano" in r.stdout, r
time.sleep(0.5)
r = run("estado", encargo)
assert r.stdout.startswith("TRABAJANDO") and "Write hola.txt" in r.stdout, r.stdout
otra = os.path.join(tarjeta, "OTRO.md")
with open(otra, "w") as f:
    f.write("otra cosa")
r = run("lanzar", repo, otra)
assert r.returncode and "Ya hay un encargo" in r.stderr, r
time.sleep(2.5)
r = run("estado", encargo)
assert r.stdout.startswith("TERMINADO bien") and "Informe: todo bien" in r.stdout and "hola.txt" in r.stdout, r.stdout
args = open(os.path.join(repo, "args.txt")).read()
assert "--model sonnet" in args and "--permission-mode acceptEdits" in args and "--resume" not in args, args
r = run("seguir", encargo, "corrige esto")
assert r.returncode == 0, r
time.sleep(2.5)
args = open(os.path.join(repo, "args.txt")).read()
assert "--resume ses-123" in args and "corrige esto" in args, args
assert os.path.exists(os.path.join(tarjeta, "ENCARGO.claude.anterior.jsonl"))
# Tope: Claude lento con un tope de 2 s → se corta solo (y su proceso hijo), estado lo dice y «seguir» retoma la sesión
open(os.path.join(repo, "lento"), "w").close()
lento = os.path.join(tarjeta, "LENTO.md")
with open(lento, "w") as f:
    f.write("tarda mucho")
env["CLAUDE_ENCARGO_TOPE"] = "2"
r = run("lanzar", repo, lento)
assert r.returncode == 0 and "se para solo a los 0 min" in r.stdout, r
time.sleep(4)
r = run("estado", lento)
assert r.stdout.startswith("PARADO POR EL TOPE"), r.stdout
hijo = int(open(os.path.join(repo, "hijo.pid")).read())
assert not os.path.exists(f"/proc/{hijo}") or open(f"/proc/{hijo}/stat").read().split(")")[-1].split()[0] == "Z", "el hijo sigue vivo"
os.remove(os.path.join(repo, "lento"))
r = run("seguir", lento, "cierra el informe")
assert r.returncode == 0, r
time.sleep(1)
assert "--resume ses-lento" in open(os.path.join(repo, "args.txt")).read()
assert "timeout --kill-after=30 2" not in args  # el tope va delante de claude, no en sus argumentos
del env["CLAUDE_ENCARGO_TOPE"]
time.sleep(2)
r = run("lanzar", repo, encargo, "inventado")
assert r.returncode and "Modo desconocido" in r.stderr
subprocess.run(["rm", "-rf", d])
print("claude-encargo: autoprueba OK")
