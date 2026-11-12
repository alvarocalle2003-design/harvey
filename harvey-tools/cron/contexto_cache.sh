#!/bin/bash
# Cron «Contexto» (sin IA): refresca la caché que usa el gancho contexto.py. No imprime nada: no avisa a nadie.
exec /opt/hermes/.venv/bin/python /opt/data/hud/snapshot.py --cache
