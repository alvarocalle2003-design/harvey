#!/bin/bash
# Cron «Biblioteca» (sin IA, cada 15 min): sincroniza /opt/data/wiki con GitHub (el señor la edita desde Obsidian) y
# rehace los SOUL.md del equipo si cambió equipo/. Silencio si todo va bien; si falla, el texto llega por Telegram.
cd /opt/data/wiki || exit 0

# Guardia: equipo/ (se hornea en los SOUL de todos, Harvey incluido) y manual/ solo se cambian desde el PC.
# Cualquier cambio hecho en el servidor (sin guardar o en commits sin subir) se deshace y se guarda aparte.
PROTEGIDAS="equipo manual"
if git rev-parse -q --verify '@{u}' >/dev/null; then
  if [ -n "$(git status --porcelain -- $PROTEGIDAS)$(git diff --name-only '@{u}' HEAD -- $PROTEGIDAS)" ]; then
    mkdir -p /opt/data/hud/guardia
    parche=/opt/data/hud/guardia/$(date +%Y%m%d-%H%M%S).patch
    { git diff '@{u}' -- $PROTEGIDAS; git status --porcelain -- $PROTEGIDAS; } > "$parche"
    lista=$(git status --porcelain -- $PROTEGIDAS; git diff --name-only '@{u}' HEAD -- $PROTEGIDAS)
    git restore --source='@{u}' --staged --worktree -- $PROTEGIDAS
    git clean -fdq -- $PROTEGIDAS
    git diff --cached --quiet -- $PROTEGIDAS || git commit -q -m "Guardia: deshechos cambios del servidor en equipo/ o manual/" -- $PROTEGIDAS
    echo "🛡️ Alguien del servidor cambió las instrucciones del equipo o el manual y lo he deshecho (solo se cambian desde el PC). Archivos: $(echo "$lista" | sort -u | tr '\n' ' ' | cut -c1-300). Copia del cambio: $parche"
  fi
fi

if [ -n "$(git status --porcelain)" ]; then  # Tomo debería guardarlo él; que no se pierda nada
  git add -A && git commit -q -m "Cambios del servidor sin guardar"
fi
out=$(git pull -q --rebase 2>&1) || { git rebase --abort 2>/dev/null; echo "⚠️ La biblioteca del equipo no se ha podido sincronizar con GitHub (¿la misma nota cambiada en Obsidian y en el servidor?): ${out: -300}"; exit 0; }
out=$(git push -q 2>&1) || { echo "⚠️ La biblioteca del equipo no se ha podido subir a GitHub: ${out: -300}"; exit 0; }
exec /opt/hermes/.venv/bin/python /opt/data/hud/equipo.py --callado
