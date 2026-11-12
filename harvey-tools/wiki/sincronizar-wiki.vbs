' Sincroniza la biblioteca del equipo (carpeta harvey-wiki, la que se abre con Obsidian) con GitHub, sin ventana.
' La lanza la tarea programada «Harvey wiki» cada 15 minutos. Los errores quedan en sincronizar.log, al lado de este archivo.
Set sh = CreateObject("WScript.Shell")
base = "C:\Users\alvar\OneDrive\Escritorio\Antigravity\Claude"
wiki = base & "\harvey-wiki"
' «log» es una función de VBScript y no se puede usar como variable
logf = base & "\harvey-tools\wiki\sincronizar.log"
cmd = "cmd /c cd /d """ & wiki & """ && (git add -A && (git diff --cached --quiet || git commit -q -m ""Cambios desde Obsidian"") && " & _
      "(git pull -q --rebase || (git rebase --abort & echo %date% %time% conflicto al bajar cambios)) && git push -q) >> """ & logf & """ 2>&1"
sh.Run cmd, 0, True
