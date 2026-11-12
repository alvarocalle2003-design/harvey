#!/bin/sh
# Lo que se pierde al RECREAR el contenedor de Harvey (actualizar Hermes, cambiar docker-compose.yml) y hay que rehacer.
# Se ejecuta en el VPS como root:  ssh -i ~/.ssh/hermes_vps root@72.60.46.112 'sh -s' < harvey-tools/tras-recrear.sh
set -e
C=hermes-agent-ndkm-hermes-agent-1
# 1. Extras de voz (Whisper local y edge-tts): Hermes los instala en /opt/data/installs/…/environments/<hash>/venv, pero el
#    gateway usa /opt/hermes/.venv. El <hash> cambia con cada versión (así se rompió el 29/10): se busca, no se escribe.
docker exec $C sh -c 'v=$(ls -d /opt/hermes/.venv/lib/python3.*/site-packages | head -1); py=$(basename $(dirname $v));
  echo "import glob, sys; sys.path.extend(glob.glob(\"/opt/data/installs/*/environments/*/venv/lib/$py/site-packages\"))" > $v/zz-harvey-extras.pth'
# 2. Claude Code para Leonardo y Harvey (el lanzador vive en /opt/data/bin)
docker exec $C ln -sfn /opt/data/bin/claude /usr/local/bin/claude
# 3. Comprobación
docker exec $C /opt/hermes/.venv/bin/python -c "import faster_whisper; print('Whisper: OK')"
docker exec $C sh -c 'command -v claude >/dev/null && echo "claude: OK"'
# El gateway carga Whisper al arrancar: reinicio para que lo vea (el API vuelve en ~30 s)
# (desde Hermes 0.23 el servicio se llama main-hermes; antes, gateway-default)
docker exec $C /package/admin/s6/command/s6-svc -r /run/service/main-hermes
echo "Hecho. Espere ~30 s a que el API vuelva."
