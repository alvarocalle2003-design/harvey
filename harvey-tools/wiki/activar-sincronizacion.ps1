# Crea (o arregla) la tarea programada «Harvey wiki»: cada 15 minutos sincroniza la biblioteca del equipo (carpeta
# harvey-wiki, la que abres con Obsidian) con GitHub, sin ventanas. También con el portátil a batería (Windows, por defecto,
# no la lanzaba sin enchufe) y, si el PC estaba dormido, en cuanto despierta. Para quitarla: schtasks /Delete /TN "Harvey wiki" /F
$vbs = Join-Path $PSScriptRoot "sincronizar-wiki.vbs"
schtasks /Create /TN "Harvey wiki" /TR "wscript.exe `"$vbs`"" /SC MINUTE /MO 15 /F | Out-Null
$ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
Set-ScheduledTask -TaskName "Harvey wiki" -Settings $ajustes | Out-Null
schtasks /Run /TN "Harvey wiki" | Out-Null
Write-Host "Listo: la biblioteca se sincroniza sola cada 15 minutos, también con batería."
