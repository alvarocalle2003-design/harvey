' Arranca el HUD de Harvey: servidor local oculto + ventana de Edge en modo app (perfil propio).
' Si el servidor ya estaba encendido, el segundo se cierra solo y simplemente se abre la ventana.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
data = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\HarveyHUD"
If Not fso.FolderExists(data) Then fso.CreateFolder(data)
' El servidor escribe él mismo su registro en servidor.log (la redirección «>>» de cmd se quedaba muda al arrancar Windows)
sh.Run "node """ & dir & "\server.mjs""", 0, False
' Tecla º global (abre/cierra la conversación aunque el HUD esté detrás); si ya estaba en marcha, la copia se cierra sola
sh.Run "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & dir & "\tecla-global.ps1""", 0, False

' Espera (hasta 30 s) a que el servidor responda; al encender el PC la red puede tardar
On Error Resume Next
For i = 1 To 60
  Set http = CreateObject("MSXML2.XMLHTTP")
  http.Open "GET", "http://localhost:7777/hud.css", False
  http.Send
  ready = False
  ready = (http.Status = 200)
  If Err.Number <> 0 Then ready = False
  Err.Clear
  If ready Then Exit For
  WScript.Sleep 500
Next
On Error GoTo 0

sh.Run """C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"" --app=http://localhost:7777 --start-maximized" & _
       " --autoplay-policy=no-user-gesture-required --user-data-dir=""" & data & "\edge""", 1, False
