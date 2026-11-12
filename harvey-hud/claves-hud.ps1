# Guarda las claves del HUD de Harvey en %APPDATA%\HarveyHUD\secrets.json (solo en este PC).
# Las copia del servidor de Harvey: la llave del API de Harvey y la de Google (voz). Lo ejecuta el usuario;
# no hay que pegar nada y nadie mas ve las claves.
$dir = Join-Path $env:APPDATA 'HarveyHUD'
New-Item -ItemType Directory -Force $dir | Out-Null

function Get-Clave($nombre) {
  $v = ssh -i "$HOME\.ssh\hermes_vps" root@72.60.46.112 "docker exec hermes-agent-ndkm-hermes-agent-1 sed -n s/^$nombre=//p /opt/data/.env"
  "$v".Trim().Trim('"').Trim("'")
}
Write-Host 'Recogiendo las claves del servidor de Harvey...'
$api = Get-Clave 'API_SERVER_KEY'
$gemini = Get-Clave 'GEMINI_API_KEY'
if (-not $api -or -not $gemini) { Write-Host 'No pude leer las claves del VPS.' -ForegroundColor Red; exit 1 }

$json = @{ harvey = $api; gemini = $gemini } | ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $dir 'secrets.json'), $json)
Write-Host 'Claves guardadas. Reiniciando el HUD para que las use...'

# El servidor solo lee las claves al arrancar: se cierran el servidor y la ventana del HUD y se vuelven a abrir
Get-CimInstance Win32_Process -Filter "name='node.exe'" | Where-Object { $_.CommandLine -like '*harvey-hud*server.mjs*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Get-CimInstance Win32_Process -Filter "name='msedge.exe'" | Where-Object { $_.CommandLine -like '*HarveyHUD\edge*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2
Start-Process wscript.exe -ArgumentList "`"$PSScriptRoot\iniciar-harvey.vbs`""
Write-Host 'Listo. Harvey se abre con su voz nueva; ya puedes cerrar esta ventana.' -ForegroundColor Green
