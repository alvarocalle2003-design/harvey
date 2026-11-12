#!/bin/bash
# Hábitos 22:00 (sin IA): imprime qué falta por marcar hoy y las rachas malas (habitos.py --vigia).
# Salida vacía (todo marcado y sin rachas malas) = el cron no despierta a la IA. El aviso llega al iPhone por push.
exec /opt/hermes/.venv/bin/python /opt/data/hud/habitos.py --vigia
