# An-Nur - kompyuter yoqilganda avtomatik ishga tushirish
# Admin huquqi kerak emas - Startup papkasiga yorliq qo'yiladi

$root = Split-Path -Parent $PSScriptRoot
$launcher = Join-Path $root "An-Nur-Ishga-Tushirish.cmd"

if (-not (Test-Path $launcher)) {
  Write-Host "Launcher topilmadi: $launcher" -ForegroundColor Red
  exit 1
}

$startup = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startup "An-Nur.lnk"

$wsh = New-Object -ComObject WScript.Shell
$sc = $wsh.CreateShortcut($shortcutPath)
$sc.TargetPath = $launcher
$sc.WorkingDirectory = $root
$sc.IconLocation = "$env:SystemRoot\System32\imageres.dll,109"
$sc.Description = "An-Nur do'kon kassasi - avtomatik ishga tushirish"
$sc.Save()

Write-Host "Avtomatik ishga tushirish yoqildi." -ForegroundColor Green
Write-Host "Papka: $startup" -ForegroundColor Gray
Write-Host "O'chirish: Startup papkasidan An-Nur yorlig'ini o'chiring." -ForegroundColor Gray
