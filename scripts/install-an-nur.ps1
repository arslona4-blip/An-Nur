# An-Nur - mijoz kompyuteriga o'rnatish
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  An-Nur - do'kon kassasi o'rnatish" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Papka: $root" -ForegroundColor Gray
Write-Host ""

if ($root -match "Program Files") {
  Write-Host "XATO: Program Files papkasida o'rnatilgan." -ForegroundColor Red
  Write-Host "Dasturni o'chirib, yangi Setup.exe ni qayta o'rnating." -ForegroundColor Yellow
  Write-Host "Tavsiya: C:\Users\...\AppData\Local\An-Nur papkasiga o'rnating." -ForegroundColor Yellow
  exit 1
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Host "Node.js topilmadi." -ForegroundColor Red
  Write-Host "Avval o'rnating: https://nodejs.org/ - LTS versiya" -ForegroundColor Yellow
  Start-Process "https://nodejs.org/"
  exit 1
}

$nodeVer = (node -v) -replace "v", ""
Write-Host "Node.js: v$nodeVer"

$hasModules = Test-Path "node_modules\next\package.json"
$hasBuild = Test-Path ".next\BUILD_ID"

if (-not $hasModules) {
  Write-Host "Kutubxonalar o'rnatilmoqda, internet kerak..." -ForegroundColor Yellow
  npm ci
  if ($LASTEXITCODE -ne 0) { throw "npm ci xatolik" }
} else {
  Write-Host "Kutubxonalar tayyor." -ForegroundColor Green
}

if (-not $hasBuild) {
  Write-Host "Dastur yig'ilmoqda, 1-3 daqiqa..." -ForegroundColor Yellow
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "npm run build xatolik" }
} else {
  Write-Host "Dastur tayyor." -ForegroundColor Green
}

if (-not (Test-Path "data")) {
  New-Item -ItemType Directory -Path "data" | Out-Null
}

$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "An-Nur.lnk"
$launcher = Join-Path $root "An-Nur-Ishga-Tushirish.cmd"
$wsh = New-Object -ComObject WScript.Shell
$sc = $wsh.CreateShortcut($shortcutPath)
$sc.TargetPath = $launcher
$sc.WorkingDirectory = $root
$sc.IconLocation = "$env:SystemRoot\System32\imageres.dll,109"
$sc.Description = "An-Nur do'kon kassasi"
$sc.Save()
Write-Host "Bosh ekranga yorliq qo'yildi: An-Nur" -ForegroundColor Green

$auto = Read-Host "Kompyuter yoqilganda avtomatik ishga tushsinmi? h/H = ha"
if ($auto -eq "h" -or $auto -eq "H" -or $auto -eq "ha") {
  try {
    & (Join-Path $root "scripts\install-windows-task.ps1")
  } catch {
    Write-Host "Avtomatik ishga tushirish sozlanmadi, lekin dastur tayyor." -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "O'rnatish tugadi." -ForegroundColor Green
Write-Host "Ishga tushirish: Bosh ekrandagi An-Nur yorlig'i" -ForegroundColor Green
Write-Host "Link: http://localhost:3000" -ForegroundColor Green
Write-Host "Login: admin / admin123" -ForegroundColor Yellow

$run = Read-Host "Hozir ishga tushirilsinmi? h/H = ha"
if ($run -eq "h" -or $run -eq "H" -or $run -eq "ha") {
  Start-Process $launcher
}
