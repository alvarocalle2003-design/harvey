# Autoprueba de qué salidas de cron son avisos para el señor (sin red): python /opt/data/hud/prueba_vivo.py
import vivo

cab = lambda nombre, sched="every 30m": f"# Cron Job: {nombre}\n\n**Job ID:** x\n**Run Time:** 2026-10-23 09:00:00\n**Schedule:** {sched}\n"
assert vivo.tipo_aviso("ef5aa196b3fd", cab("Pensamientos de Harvey")) == "pensamiento"
assert vivo.tipo_aviso("08b10d338af8", cab("Seguimiento: Llamar a San Juan de Dios", "once at 2026-10-21 09:00")) == "seguimiento"
assert vivo.tipo_aviso("0286a01badfc", cab("Llamar a Beti", "once at 2026-10-20 09:00")) == "recordatorio"  # sin prefijo
assert vivo.tipo_aviso("abc", cab("Recordatorio: dentista")) == "recordatorio"
assert vivo.tipo_aviso("138ae670470c", cab("Cartero")) == "correo"
assert vivo.tipo_aviso("6a0c57478b16", cab("Informe matutino", "0 8 * * *")) is None  # se entrega con «buenos días»
assert vivo.tipo_aviso("27af845782a5", cab("Contexto", "*/15 7-23 * * *")) is None
print("OK: avisos")
