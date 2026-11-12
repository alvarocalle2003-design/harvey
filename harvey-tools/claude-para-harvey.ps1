# Guarda en el VPS el token de tu suscripción de Claude para que Harvey pueda usar Claude Code.
# Si aún no tienes token: este script te ofrece generarlo (abre el navegador para iniciar sesión en Claude).
# El token no se muestra ni lo ve nadie más: va directo a /opt/data/.claude-token (solo lectura para Harvey).

$gen = Read-Host '¿Necesitas generar el token ahora? (s/n)'
if ($gen -match '^[sS]') {
    Write-Host "`nSe abrirá el navegador para entrar en tu cuenta de Claude. Al terminar, copia el token que aparece (empieza por sk-ant-).`n"
    npx -y @anthropic-ai/claude-code setup-token
}

$s = Read-Host "`nPega el token (no se verá al pegarlo) y pulsa Enter" -AsSecureString
$p = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
try { $tok = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($p).Trim() } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p) }
if ($tok -notmatch '^sk-ant-') { Write-Host 'Eso no parece un token de Claude (debe empezar por sk-ant-).' -ForegroundColor Red; exit 1 }

# Sin comillas en el comando remoto: PowerShell 5.1 las elimina al pasarlas a ssh (antes eso corrompía el token).
# Los saltos de línea que añade el pipe los quita el lanzador /opt/data/bin/claude al leerlo.
$tok | & ssh -i "$env:USERPROFILE\.ssh\hermes_vps" -o BatchMode=yes root@72.60.46.112 'f=/docker/hermes-agent-ndkm/data/.claude-token; cat > $f; chmod 600 $f; chown 10000:10000 $f; echo guardado'
$tok = $null
Write-Host "`nListo. Avisa a Claude para que compruebe que Harvey ya puede usar Claude Code." -ForegroundColor Green
