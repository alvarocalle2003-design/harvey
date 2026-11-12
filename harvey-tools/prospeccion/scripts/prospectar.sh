#!/bin/sh
# Prospección completa con Claude Code (Opus) como director: horas de trabajo con sus propios subagentes.
#   prospectar.sh <nombre-proyecto> "<encargo del señor>"
# Lánzalo en segundo plano (terminal background). Al terminar sube informe.pdf a Drive (Entregables de Harvey) y avisa
# al señor en el iPhone y el HUD con un cron de una sola vez «Recordatorio: …». Registro: <carpeta>/prospectar.log
P=/opt/data/skills/productivity/prospeccion-comercial
NOMBRE=$(printf %s "$1" | tr -c 'A-Za-z0-9_-' '-' | cut -c1-60)
DIR=/opt/data/workspace/proyectos/prospeccion-$NOMBRE
[ -n "$1" ] && [ -n "$2" ] || { echo 'Uso: prospectar.sh <nombre-proyecto> "<encargo>"'; exit 2; }
mkdir -p "$DIR" && cd "$DIR" || exit 1
LOG="$DIR/prospectar.log"
echo "[$(date '+%F %T')] empieza: $2" >> "$LOG"

PROMPT="$(cat $P/encargo_claude.md)

## Encargo del señor
$2

## Carpeta del proyecto
$DIR"
HOME=/opt/data/home claude -p "$PROMPT" --model claude-opus-5-5 --effort high --max-turns 600 \
  --permission-mode acceptEdits --allowedTools "Bash,Read,Write,Edit,Glob,Grep,WebSearch,WebFetch,Task,TodoWrite" \
  --output-format text > "$DIR/claude-respuesta.md" 2>> "$LOG"
echo "[$(date '+%F %T')] Claude ha terminado (código $?)" >> "$LOG"

if [ -s "$DIR/informe.pdf" ]; then
  SUBIDA=$(/opt/hermes/.venv/bin/python /opt/data/skills/productivity/google-workspace/scripts/google_api.py drive upload \
    "$DIR/informe.pdf" --name "Prospección $NOMBRE $(date +%F).pdf" --parent 1lfpwEt3b3CwWDvH7YMEd4t69zgShKpS8 2>> "$LOG")
  ID=$(printf %s "$SUBIDA" | sed -n 's/.*"id": *"\([^"]*\)".*/\1/p' | head -1)
  ENLACE=${ID:+https://drive.google.com/file/d/$ID/view}
  AVISO="Señor, el informe de prospección «$NOMBRE» está listo en Drive (Entregables de Harvey). ${ENLACE:-No pude subirlo: está en $DIR/informe.pdf}"
else
  AVISO="Señor, la prospección «$NOMBRE» ha terminado sin PDF. Revise $DIR/claude-respuesta.md y $LOG."
fi
echo "[$(date '+%F %T')] $AVISO" >> "$LOG"
# Aviso al iPhone y al HUD: cron de una sola vez sin IA cuyo nombre empieza por «Recordatorio» (ver movil/server.mjs)
printf '%s\n' "$AVISO" > /opt/data/hud/aviso_prospeccion.txt
hermes cron create 1m --name "Recordatorio: prospección $NOMBRE" --script aviso_prospeccion.sh --no-agent --deliver local --repeat 1 >> "$LOG" 2>&1
echo "$AVISO"
echo "--- Resumen de Claude:"
cat "$DIR/claude-respuesta.md"
