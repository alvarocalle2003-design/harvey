# Tecla º global del HUD de Harvey: aunque haya otra ventana delante, la º abre o cierra la conversación.
# La lanza iniciar-harvey.vbs (oculta). Windows reserva la º para Harvey (no se puede escribir en otros programas;
# el usuario lo aceptó). Si otra copia ya la tiene registrada, esta termina sola.
Add-Type -TypeDefinition @'
using System;
using System.Net;
using System.Runtime.InteropServices;
public static class TeclaHarvey {
  [StructLayout(LayoutKind.Sequential)]
  struct MSG { public IntPtr hwnd; public uint message; public UIntPtr wParam; public IntPtr lParam; public uint time; public int x, y; }
  [DllImport("user32.dll")] static extern bool RegisterHotKey(IntPtr hWnd, int id, uint mods, uint vk);
  [DllImport("user32.dll")] static extern int GetMessage(out MSG msg, IntPtr hWnd, uint min, uint max);
  public static void Run() {
    if (!RegisterHotKey(IntPtr.Zero, 1, 0x4000, 0xDC)) return; // MOD_NOREPEAT; 0xDC = tecla º del teclado español
    MSG m;
    while (GetMessage(out m, IntPtr.Zero, 0, 0) > 0) {
      if (m.message != 0x0312) continue; // WM_HOTKEY
      try { using (var c = new WebClient()) c.UploadString("http://127.0.0.1:7777/api/tecla", ""); } catch { }
    }
  }
}
'@
[TeclaHarvey]::Run()
