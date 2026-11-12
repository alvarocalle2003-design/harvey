# Guarda las claves de Harvey en el VPS sin mostrarlas en pantalla.
# Deja en blanco (Enter) cualquier campo que no quieras configurar ahora.

function Read-Secret($prompt) {
    $s = Read-Host -Prompt $prompt -AsSecureString
    $p = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
    try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($p).Trim() } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p) }
}

Write-Host "`n=== Claves de Harvey (no se muestran al escribir) ===`n"
$tg     = Read-Secret "Token del bot de Telegram (BotFather > /mybots > Harvey > API Token)"
$tgUser = (Read-Host -Prompt "Tu ID numerico de Telegram (te lo da @userinfobot)").Trim()
$gemini = Read-Secret "API key de Gemini (Google AI Studio)"
$or     = Read-Secret "API key de OpenRouter"
$notion = Read-Secret "Token de la integracion de Notion (empieza por ntn_)"
$tavily = Read-Secret "API key de Tavily para leer webs (app.tavily.com, plan gratis; empieza por tvly-)"
$github = Read-Secret "Llave de GitHub para Leonardo (fine-grained; empieza por github_pat_)"

$lines = @()
if ($tg)     { $lines += "TELEGRAM_BOT_TOKEN=$tg" }
if ($tgUser) { $lines += "TELEGRAM_ALLOWED_USERS=$tgUser"; $lines += "TELEGRAM_HOME_CHANNEL=$tgUser" }
if ($gemini) { $lines += "GEMINI_API_KEY=$gemini" }
if ($or)     { $lines += "OPENROUTER_API_KEY=$or" }
if ($notion) { $lines += "NOTION_API_KEY=$notion" }
if ($tavily) { $lines += "TAVILY_API_KEY=$tavily" }
if ($github) { $lines += "GITHUB_TOKEN=$github" }

if ($lines.Count -eq 0) { Write-Host "Nada que guardar."; exit }

($lines -join "`n") | & ssh -i "$env:USERPROFILE\.ssh\hermes_vps" -o BatchMode=yes root@72.60.46.112 /root/hermes-set-secrets.sh
$tg = $gemini = $or = $notion = $tavily = $github = $null; $lines = $null
Write-Host "`nListo. Avisa a Claude para que termine la configuracion."
