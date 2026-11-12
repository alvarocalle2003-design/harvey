#!/bin/bash
# uso: nrun.sh script.py  (copia notion_common.py + script al contenedor y lo ejecuta)
S="$(cd "$(dirname "$0")" && pwd)"
scp -q -i ~/.ssh/hermes_vps "$S/notion_common.py" "$S/$1" root@72.60.46.112:/tmp/ && \
ssh -i ~/.ssh/hermes_vps -o BatchMode=yes root@72.60.46.112 "C=hermes-agent-ndkm-hermes-agent-1; docker exec -u root \$C mkdir -p /tmp/nb; docker cp /tmp/notion_common.py \$C:/tmp/nb/; docker cp /tmp/$1 \$C:/tmp/nb/; docker exec -u root \$C chmod -R a+r /tmp/nb; docker exec -u hermes -w /tmp/nb \$C /opt/hermes/.venv/bin/python -u $1; rc=\$?; rm -f /tmp/notion_common.py /tmp/$1; exit \$rc"
