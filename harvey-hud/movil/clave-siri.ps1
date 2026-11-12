# Llave del atajo de Siri para Harvey. No tienes que escribir nada: se inventa una llave larga al azar,
# se guarda en el VPS (HUD_SIRI_TOKEN) y no se muestra en pantalla.
# Luego, en la app de Harvey del iPhone: boton del altavoz > COPIAR LLAVE DE SIRI, y la pegas en el atajo.
# Volver a ejecutarlo cambia la llave (el atajo viejo deja de funcionar). Harvey se reinicia (unos segundos).

$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$token = -join ($bytes | ForEach-Object { $_.ToString('x2') })

Write-Host "`n=== Llave de Siri para Harvey ===`n"
"HUD_SIRI_TOKEN=$token" | & ssh -i "$env:USERPROFILE\.ssh\hermes_vps" -o BatchMode=yes root@72.60.46.112 /root/hermes-set-secrets.sh
$token = $null; $bytes = $null
Write-Host "`nListo. Ahora en el iPhone: app Harvey > altavoz (arriba a la derecha) > COPIAR LLAVE DE SIRI. Avisa a Claude."
