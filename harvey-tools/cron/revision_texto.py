"""Para el cron «Revisión semanal»: foto de 7 días + tareas hechas esta semana, sin que la IA necesite herramientas."""
import datetime, subprocess, sys
sys.path.insert(0, "/opt/data/hud")
import tareas  # noqa: E402  (puerta única de Notion: misma clave y misma base)

r = subprocess.run(["/opt/hermes/.venv/bin/python", "/opt/data/hud/snapshot.py", "--texto", "--dias", "7"],
                   capture_output=True, text=True, timeout=180)
print(r.stdout.strip() or f"Foto rápida no disponible: {r.stderr.strip()[:300]}")

desde = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=7)).isoformat()
try:
    hechas = [p for p in tareas.todas(tareas.DS)
              if (p["properties"]["Estado"]["select"] or {}).get("name") == "Hecha" and p["last_edited_time"] >= desde]
    print(f"\nTAREAS HECHAS ESTA SEMANA ({len(hechas)}):")
    for p in hechas:
        print("- " + tareas.texto_de(p["properties"]["Tarea"]["title"]))
except BaseException as e:  # tareas.api sale con sys.exit si Notion falla
    print(f"\nTAREAS HECHAS ESTA SEMANA: no disponible ({str(e)[:200]})")
