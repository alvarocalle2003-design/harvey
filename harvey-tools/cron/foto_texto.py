"""Para el cron «Informe matutino»: inyecta la foto rápida del día (agenda, correos, tareas) sin gastar llamadas de IA."""
import subprocess, sys
r = subprocess.run(["/opt/hermes/.venv/bin/python", "/opt/data/hud/snapshot.py", "--texto", "--dias", "1"],
                   capture_output=True, text=True, timeout=120)
print(r.stdout.strip() or f"Foto rápida no disponible: {r.stderr.strip()[:300]}")
sys.exit(0 if r.stdout.strip() else 1)
