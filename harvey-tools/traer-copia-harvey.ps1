# Trae al PC la última copia de seguridad semanal de Harvey (la hace el VPS los domingos a las 3:00).
# Queda en %LOCALAPPDATA%\HarveyHUD\copias (fuera de la nube: la copia contiene claves). Guarda las 4 últimas.
# Lo lanza la tarea programada "Harvey copia" al iniciar sesión; si ya la tiene, no descarga nada.
$dest = Join-Path $env:LOCALAPPDATA 'HarveyHUD\copias'
New-Item -ItemType Directory -Force $dest | Out-Null
$key = Join-Path $env:USERPROFILE '.ssh\hermes_vps'
$ultima = & ssh -i $key -o BatchMode=yes -o ConnectTimeout=15 root@72.60.46.112 'ls -t /docker/hermes-agent-ndkm/data/backups/hermes-backup-*.zip | head -1' 2>> (Join-Path $dest 'registro.txt')
if (-not $ultima) { Add-Content (Join-Path $dest 'registro.txt') "$(Get-Date -f s) sin respuesta del VPS"; exit }  # sin red o sin copias: se intentará en el próximo inicio de sesión
$local = Join-Path $dest (Split-Path $ultima -Leaf)
if (Test-Path $local) { exit }
& scp -q -i $key -o BatchMode=yes "root@72.60.46.112:$ultima" "$local.part"
if ($LASTEXITCODE -eq 0) {
    Move-Item "$local.part" $local -Force
    Get-ChildItem $dest -Filter 'hermes-backup-*.zip' | Sort-Object Name -Descending | Select-Object -Skip 4 | Remove-Item -Confirm:$false
} else { Remove-Item "$local.part" -ErrorAction SilentlyContinue }
