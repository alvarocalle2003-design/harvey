# Conecta Gmail, Calendar y Drive de tu cuenta de Google a Harvey (VPS).
# Uso: ejecuta el script y sigue las instrucciones. Los codigos no se muestran a Claude.

$ErrorActionPreference = "Continue"   # en PS 5.1 "Stop" rompe con cualquier aviso de ssh por stderr
trap { Write-Host "`nERROR: $_" -ForegroundColor Red; Read-Host "Copia este error para Claude y pulsa Enter para cerrar"; exit 1 }
$key  = "$env:USERPROFILE\.ssh\hermes_vps"
$vps  = "root@72.60.46.112"
$c    = "hermes-agent-ndkm-hermes-agent-1"
$py   = "/opt/hermes/.venv/bin/python /opt/data/skills/productivity/google-workspace/scripts/setup.py"
function Remote($cmd) { & ssh -i $key -o BatchMode=yes $vps $cmd }

Write-Host "`n=== Paso 1: credenciales de Google Cloud ===" -ForegroundColor Cyan
$latest = Get-ChildItem "$env:USERPROFILE\Downloads\client_secret_*.json" -ErrorAction SilentlyContinue |
          Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($latest) { Write-Host "Encontrado: $($latest.FullName)" }
$path = Read-Host "Ruta del JSON descargado (Enter para usar el encontrado)"
if (-not $path) { $path = $latest.FullName }
if (-not (Test-Path $path)) { Write-Host "No existe el archivo: $path" -ForegroundColor Red; exit 1 }

& scp -q -i $key "$path" "${vps}:/tmp/gcs.json"
Remote "docker cp /tmp/gcs.json ${c}:/tmp/gcs.json && rm -f /tmp/gcs.json && docker exec -u root $c chown hermes /tmp/gcs.json && docker exec -u hermes $c sh -c '$py --client-secret /tmp/gcs.json; rm -f /tmp/gcs.json'"

Write-Host "`n=== Paso 2: autorizar en el navegador ===" -ForegroundColor Cyan
$out = (Remote "docker exec -u hermes $c $py --auth-url" 2>&1) | Out-String
$m = [regex]::Match($out, 'https://accounts\.google\.com/\S+')
if (-not $m.Success) { throw "No se pudo obtener el enlace de Google. Salida del servidor:`n$out" }
$url = $m.Value
Write-Host "Se abrira Google en el navegador. Elige tu cuenta y acepta los permisos."
Write-Host "Si sale 'Google no ha verificado esta app': Configuracion avanzada > Ir a ... (no seguro). Es tu propia app."
Write-Host "Al final el navegador mostrara un ERROR de 'localhost'. Es normal." -ForegroundColor Yellow
Start-Process $url
Write-Host "Copia la direccion COMPLETA de la barra del navegador (empieza por http://localhost:1/?...)"
$s = Read-Host "Pegala aqui (no se mostrara)" -AsSecureString
$b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
$redirect = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b).Trim()
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b)

$redirect | & ssh -i $key -o BatchMode=yes $vps "read -r CODE; docker exec -u hermes $c $py --auth-code `$CODE"
$redirect = $null

Write-Host "`n=== Paso 3: comprobacion ===" -ForegroundColor Cyan
Remote "docker exec -u hermes $c $py --check"
Write-Host "`nListo. Avisa a Claude." -ForegroundColor Green
Read-Host "Pulsa Enter para cerrar"
