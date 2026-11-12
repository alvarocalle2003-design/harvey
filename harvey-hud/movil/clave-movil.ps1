# Claves de la app de Harvey del iPhone. No se muestra nada en pantalla.
#  Contrasena de la app (Enter para no cambiarla). Cambiarla cierra la sesion en el movil.
#  (La voz usa la clave de Google que Harvey ya tiene en el VPS: no hace falta copiar nada.)
# Al guardar, Harvey se reinicia (unos segundos).

function Read-Secret($prompt) {
    $s = Read-Host -Prompt $prompt -AsSecureString
    $p = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
    try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($p).Trim() } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p) }
}

Write-Host "`n=== Claves de la app de Harvey (iPhone) ===`n"
Write-Host "Contrasena: minimo 10 caracteres, mejor sin tildes ni enies. Enter = no cambiarla.`n"
$lines = @()
$a = Read-Secret "Contrasena nueva"
if ($a) {
    $b = Read-Secret "Repitala"
    if ($a -ne $b) { Write-Host "No coinciden. No se ha cambiado nada."; exit 1 }
    if ($a.Length -lt 10) { Write-Host "Demasiado corta (minimo 10). No se ha cambiado nada."; exit 1 }
    $lines += "HUD_MOVIL_PASSWORD=$a"
}

if ($lines.Count -eq 0) { Write-Host "Nada que guardar."; exit }
($lines -join "`n") | & ssh -i "$env:USERPROFILE\.ssh\hermes_vps" -o BatchMode=yes root@72.60.46.112 /root/hermes-set-secrets.sh
$a = $b = $null; $lines = $null
Write-Host "`nListo. Avisa a Claude."
