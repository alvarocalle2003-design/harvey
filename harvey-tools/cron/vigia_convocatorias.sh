#!/bin/bash
# Vigía de convocatorias (sin IA): solo imprime entradas NUEVAS de cada fuente (skill oficial watchers, con memoria
# de lo ya visto). Salida vacía = el cron no despierta a la IA. Para añadir fuentes: otra línea "nombre|url".
W=/opt/data/skills/devops/watchers/scripts/watch_rss.py
while IFS='|' read -r nombre url; do
  # shortcut: una fuente caída se salta en silencio; si se vuelve habitual, avisar del fallo por Telegram
  nuevo=$(/opt/hermes/.venv/bin/python "$W" --name "$nombre" --url "$url" --max 30 --with-summary 2>/dev/null) || continue
  [ -n "$nuevo" ] && printf '# Fuente: %s\n%s\n\n' "$nombre" "$nuevo"
done <<'FUENTES'
BOE-ayudas|https://www.boe.es/rss/canal.php?c=ayudas
BOPV-Euskadi|https://www.euskadi.eus/bopv2/datos/Ultimo.xml
EIC-Europa|https://eic.ec.europa.eu/node/2/rss_en
FUENTES
