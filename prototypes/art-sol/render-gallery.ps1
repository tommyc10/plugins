# Optional Windows-only review image. The showcase itself only needs Node.
# Renders the same half-pixel buffers and cell overlays without a browser or deps.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$modulePath = (Join-Path $PSScriptRoot 'showcase.mjs').Replace('\', '/')
$moduleUrl = ([System.Uri]::new($modulePath)).AbsoluteUri
$javascript = "import {SCENES} from '$moduleUrl'; process.stdout.write(JSON.stringify(SCENES.map(s => {const f=s.draw(s.seconds,1,true); return {name:s.name,pixels:f.pixels,cells:[...f.cells]};})));"
$scenes = (node --input-type=module -e $javascript) | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Scene export failed.' }
$cellWidth = 9
$cellHeight = 18
$panelWidth = 88 * $cellWidth
$panelHeight = 22 * $cellHeight
$gap = 22
$columns = 3
$rows = [Math]::Ceiling($scenes.Count / $columns)
$bitmap = [System.Drawing.Bitmap]::new(($panelWidth + $gap) * $columns + $gap, ($panelHeight + $gap) * $rows + $gap)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.Clear([System.Drawing.Color]::FromArgb(5, 6, 12))
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$font = [System.Drawing.Font]::new('Consolas', 15, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$boldFont = [System.Drawing.Font]::new('Consolas', 15, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$format = [System.Drawing.StringFormat]::GenericTypographic.Clone()
$brushes = @{}
function Get-ArtBrush($rgb) {
  $key = $rgb -join ','
  if (-not $brushes.ContainsKey($key)) { $brushes[$key] = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb($rgb[0], $rgb[1], $rgb[2])) }
  return $brushes[$key]
}
try {
  for ($i = 0; $i -lt $scenes.Count; $i++) {
    $scene = $scenes[$i]
    $originX = $gap + ($i % $columns) * ($panelWidth + $gap)
    $originY = $gap + [Math]::Floor($i / $columns) * ($panelHeight + $gap)
    $graphics.FillRectangle((Get-ArtBrush @(9, 11, 19)), $originX, $originY, $panelWidth, $panelHeight)
    for ($n = 0; $n -lt $scene.pixels.Count; $n++) {
      $rgb = $scene.pixels[$n]
      if ($null -ne $rgb) {
        $graphics.FillRectangle((Get-ArtBrush $rgb), ($originX + ($n % 88) * $cellWidth), ($originY + [Math]::Floor($n / 88) * $cellHeight / 2), $cellWidth, ($cellHeight / 2))
      }
    }
    foreach ($entry in $scene.cells) {
      $index = [int]$entry[0]
      $cell = $entry[1]
      $x = $originX + ($index % 88) * $cellWidth
      $y = $originY + [Math]::Floor($index / 88) * $cellHeight
      $graphics.FillRectangle((Get-ArtBrush $cell.bg), $x, $y, $cellWidth, $cellHeight)
      $chosenFont = if ($cell.bold) { $boldFont } else { $font }
      $graphics.DrawString($cell.ch, $chosenFont, (Get-ArtBrush $cell.fg), [single]$x, [single]($y + 1), $format)
    }
  }
  $destination = Join-Path $PSScriptRoot 'gallery.png'
  $bitmap.Save($destination, [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Output $destination
} finally {
  foreach ($brush in $brushes.Values) { $brush.Dispose() }
  $format.Dispose()
  $font.Dispose()
  $boldFont.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}
