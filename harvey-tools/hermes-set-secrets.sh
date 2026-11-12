#!/bin/bash
# Lee KEY=VALUE por stdin y los guarda en el .env de Hermes (sin mostrarlos). Luego reinicia el agente.
set -e
f=/docker/hermes-agent-ndkm/data/.env
cp "$f" "$f.bak"
n=0
while IFS= read -r line || [ -n "$line" ]; do
  line="${line%$'\r'}"
  k="${line%%=*}"; v="${line#*=}"
  [[ "$k" =~ ^[A-Z_]+$ ]] && [ -n "$v" ] || continue
  tmp=$(mktemp); grep -v "^$k=" "$f" > "$tmp" || true
  printf '%s\n' "$line" >> "$tmp"; cat "$tmp" > "$f"; rm -f "$tmp"
  echo "  guardado: $k"; n=$((n+1))
done
chmod 600 "$f"; chown 10000:10000 "$f"
[ "$n" -gt 0 ] && docker restart hermes-agent-ndkm-hermes-agent-1 >/dev/null && echo "Agente reiniciado."
