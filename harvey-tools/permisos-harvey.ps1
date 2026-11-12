# Aplica los dos ajustes de permisos de Harvey que aprobaste el 23/10/2026 (lo ejecutas tú: la sesión de Claude no
# puede tocar la seguridad de Harvey). 1) el vigilante de autorizaciones razona lo mínimo y contesta (aprueba lo
# inocuo, deniega lo peligroso, te pasa lo dudoso); 2) Harvey puede usar execute_code desde el HUD, el móvil y Siri.
# Después reinicia Harvey (unos 30 s) para que los use.
$c = 'hermes-agent-ndkm-hermes-agent-1'
$k = "$HOME\.ssh\hermes_vps"
Write-Host 'Aplicando los ajustes en el servidor de Harvey...'
ssh -i $k root@72.60.46.112 "docker exec -u hermes -w /opt/data $c hermes config set auxiliary.approval.reasoning_effort minimal"
ssh -i $k root@72.60.46.112 "docker exec -u hermes -w /opt/data $c hermes config set approvals.unattended_mode approve"
Write-Host 'Reiniciando Harvey...'
ssh -i $k root@72.60.46.112 "docker exec $c /package/admin/s6/command/s6-svc -r /run/service/gateway-default"
Start-Sleep -Seconds 30
Write-Host 'Listo. Ya puedes cerrar esta ventana y decirle a Claude que lo compruebe.' -ForegroundColor Green
