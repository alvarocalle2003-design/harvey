# Dibuja el icono de Harvey (núcleo cian sobre fondo oscuro) y lo guarda como harvey.ico (PNG dentro de ICO).
Add-Type -AssemblyName System.Drawing
$s = 256
$bmp = New-Object Drawing.Bitmap $s, $s
$g = [Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.Clear([Drawing.Color]::Transparent)
$c = [Drawing.Color]::FromArgb(255, 70, 217, 255)

$g.FillEllipse((New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(255, 4, 12, 22))), 4, 4, 248, 248)
$g.DrawEllipse((New-Object Drawing.Pen ([Drawing.Color]::FromArgb(140, 70, 217, 255)), 3), 6, 6, 244, 244)
# marcas del anillo exterior
for ($i = 0; $i -lt 48; $i++) {
    $a = $i * [Math]::PI * 2 / 48; $r1 = 104; $r2 = if ($i % 4 -eq 0) { 92 } else { 98 }
    $g.DrawLine((New-Object Drawing.Pen $c, 2), [float](128 + [Math]::Cos($a) * $r1), [float](128 + [Math]::Sin($a) * $r1),
        [float](128 + [Math]::Cos($a) * $r2), [float](128 + [Math]::Sin($a) * $r2))
}
# arcos intermedios
$pen = New-Object Drawing.Pen $c, 7
foreach ($start in 20, 140, 260) { $g.DrawArc($pen, 46, 46, 164, 164, $start, 80) }
$g.DrawEllipse((New-Object Drawing.Pen ([Drawing.Color]::FromArgb(160, 70, 217, 255)), 2), 64, 64, 128, 128)
# orbe central con brillo
$path = New-Object Drawing.Drawing2D.GraphicsPath
$path.AddEllipse(78, 78, 100, 100)
$glow = New-Object Drawing.Drawing2D.PathGradientBrush $path
$glow.CenterColor = [Drawing.Color]::White
$glow.SurroundColors = @([Drawing.Color]::FromArgb(255, 30, 150, 210))
$g.FillPath($glow, $path)
$g.Dispose()

$ms = New-Object IO.MemoryStream
$bmp.Save($ms, [Drawing.Imaging.ImageFormat]::Png)
$png = $ms.ToArray()
$out = New-Object IO.MemoryStream
$w = New-Object IO.BinaryWriter $out
$w.Write([UInt16]0); $w.Write([UInt16]1); $w.Write([UInt16]1)                     # cabecera ICO, 1 imagen
$w.Write([Byte]0); $w.Write([Byte]0); $w.Write([Byte]0); $w.Write([Byte]0)         # 256x256, sin paleta
$w.Write([UInt16]1); $w.Write([UInt16]32); $w.Write([UInt32]$png.Length); $w.Write([UInt32]22)
$w.Write($png)
[IO.File]::WriteAllBytes((Join-Path $PSScriptRoot 'harvey.ico'), $out.ToArray())
[IO.File]::WriteAllBytes((Join-Path $PSScriptRoot 'public\icono.png'), $png)
'icono creado'
