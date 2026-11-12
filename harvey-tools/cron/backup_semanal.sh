#!/bin/bash
# Copia semanal de Harvey (sin IA). Silencio si va bien; si falla, el texto llega al señor por Telegram.
out=$(hermes backup -o /opt/data/backups/ -k 4 2>&1) || { echo "⚠️ Falló la copia de seguridad semanal de Harvey: ${out: -300}"; exit 0; }
chmod 600 /opt/data/backups/hermes-backup-*.zip  # contiene claves y tokens
