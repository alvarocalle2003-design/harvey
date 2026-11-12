#!/bin/bash
# Aviso sin IA: el VPS de Harvey (Hostinger KVM 1, srv2061704) vence el 14/11/2026.
dias=$(( ( $(date -d 2026-11-14 +%s) - $(date +%s) ) / 86400 ))
echo "⏰ Señor, el servidor de Harvey (VPS de Hostinger) vence el 14 de noviembre: quedan ${dias} días. Si no se renueva, Harvey se apaga y se pierden sus datos. Renuévelo en hpanel.hostinger.com > VPS > Facturación."
