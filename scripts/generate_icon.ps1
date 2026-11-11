$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$repo = Split-Path -Parent $PSScriptRoot
$targets = @(
    (Join-Path $repo 'public\favicon.ico'),
    (Join-Path $repo 'build\icon.ico')
)

$sizes = @(16, 32, 48, 256)
$pngBuffers = New-Object System.Collections.Generic.List[byte[]]

foreach ($sz in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($sz, $sz)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.Clear([System.Drawing.Color]::Transparent)

    $pad = [Math]::Max(1, [int]([Math]::Round($sz * 0.04)))
    $w = $sz - ($pad * 2)
    $radius = [Math]::Max(2, [int]([Math]::Round($sz * 0.22)))

    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $diam = $radius * 2
    $path.AddArc($pad, $pad, $diam, $diam, 180, 90)
    $path.AddArc($pad + $w - $diam, $pad, $diam, $diam, 270, 90)
    $path.AddArc($pad + $w - $diam, $pad + $w - $diam, $diam, $diam, 0, 90)
    $path.AddArc($pad, $pad + $w - $diam, $diam, $diam, 90, 90)
    $path.CloseFigure()

    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Point(0, 0)),
        (New-Object System.Drawing.Point($sz, $sz)),
        ([System.Drawing.Color]::FromArgb(255, 13, 148, 136)),
        ([System.Drawing.Color]::FromArgb(255, 15, 118, 110))
    )
    $g.FillPath($bgBrush, $path)

    $fontSize = [float]($sz * 0.56)
    $font = New-Object System.Drawing.Font('Segoe UI', $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $rect = New-Object System.Drawing.RectangleF(0, ($sz * 0.03), $sz, $sz)
    $g.DrawString('Z', $font, [System.Drawing.Brushes]::White, $rect, $sf)

    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngBuffers.Add($ms.ToArray())

    $ms.Dispose()
    $sf.Dispose()
    $font.Dispose()
    $bgBrush.Dispose()
    $path.Dispose()
    $g.Dispose()
    $bmp.Dispose()
}

# Assemble standard ICO header + PNG frames
$icoStream = New-Object System.IO.MemoryStream
$writer = New-Object System.IO.BinaryWriter($icoStream)
$writer.Write([uint16]0)
$writer.Write([uint16]1)
$writer.Write([uint16]$sizes.Count)

$dataOffset = 6 + (16 * $sizes.Count)
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $dim = if ($sizes[$i] -ge 256) { [byte]0 } else { [byte]$sizes[$i] }
    $len = $pngBuffers[$i].Length
    $writer.Write($dim)
    $writer.Write($dim)
    $writer.Write([byte]0)
    $writer.Write([byte]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]32)
    $writer.Write([uint32]$len)
    $writer.Write([uint32]$dataOffset)
    $dataOffset += $len
}
foreach ($buf in $pngBuffers) {
    $writer.Write($buf)
}
$writer.Flush()
$icoBytes = $icoStream.ToArray()
$writer.Dispose()
$icoStream.Dispose()

foreach ($t in $targets) {
    $dir = Split-Path -Parent $t
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    [System.IO.File]::WriteAllBytes($t, $icoBytes)
    Write-Host "[OK] Icon written: $t ($($icoBytes.Length) bytes)"
}
