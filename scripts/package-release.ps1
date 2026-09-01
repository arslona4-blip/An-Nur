# An-Nur release paketini yaratish (ZIP va ixtiyoriy EXE)
param(
  [string]$Version = "0.1.2"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "An-Nur $Version - paket yaratilmoqda..." -ForegroundColor Cyan

if (-not (Test-Path "node_modules")) {
  Write-Host "npm install..." -ForegroundColor Yellow
  npm install
}

Write-Host "npm run build..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build xatolik" }

$staging = Join-Path $root "dist\An-Nur-$Version"
$zipPath = Join-Path $root "dist\An-Nur-$Version.zip"

if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Path $staging -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $staging "data") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $root "dist") -Force | Out-Null

$copyItems = @(
  ".next",
  "public",
  "package.json",
  "package-lock.json",
  "next.config.ts"
)

foreach ($item in $copyItems) {
  $src = Join-Path $root $item
  if (-not (Test-Path $src)) { throw "Topilmadi: $item" }
  Copy-Item $src (Join-Path $staging $item) -Recurse -Force
}

New-Item -ItemType Directory -Path (Join-Path $staging "scripts") -Force | Out-Null
Copy-Item (Join-Path $root "scripts\start-an-nur.cmd") (Join-Path $staging "scripts\") -Force
Copy-Item (Join-Path $root "scripts\install-an-nur.ps1") (Join-Path $staging "scripts\") -Force
Copy-Item (Join-Path $root "scripts\install-windows-task.ps1") (Join-Path $staging "scripts\") -Force
Copy-Item (Join-Path $root "An-Nur-Ornatish.cmd") $staging -Force
Copy-Item (Join-Path $root "An-Nur-Ishga-Tushirish.cmd") $staging -Force
Copy-Item (Join-Path $root "release\OQISH.txt") $staging -Force

Write-Host "node_modules nusxalanmoqda..." -ForegroundColor Yellow
robocopy (Join-Path $root "node_modules") (Join-Path $staging "node_modules") /E /NFL /NDL /NJH /NJS /NP | Out-Null

if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path $staging -DestinationPath $zipPath -CompressionLevel Optimal

Write-Host ""
Write-Host "ZIP tayyor:" -ForegroundColor Green
Write-Host "  $zipPath" -ForegroundColor White
$zipSize = [math]::Round((Get-Item $zipPath).Length / 1MB, 1)
Write-Host "  Hajm: $zipSize MB" -ForegroundColor Gray

$iscc = @(
  "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
  "${env:ProgramFiles}\Inno Setup 6\ISCC.exe",
  "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($iscc) {
  Write-Host ""
  Write-Host "EXE yaratilmoqda (Inno Setup)..." -ForegroundColor Yellow
  & $iscc (Join-Path $root "scripts\installer.iss") "/DAppVersion=$Version" "/DStageDir=$staging"
  $exePath = Join-Path $root "dist\An-Nur-$Version-Setup.exe"
  if (Test-Path $exePath) {
    Write-Host "EXE tayyor:" -ForegroundColor Green
    Write-Host "  $exePath" -ForegroundColor White
  }
} else {
  Write-Host ""
  Write-Host "EXE uchun Inno Setup 6 kerak: https://jrsoftware.org/isdl.php" -ForegroundColor Yellow
  Write-Host "Ornatgach qayta ishga tushiring." -ForegroundColor Gray
}

Write-Host ""
Write-Host "Mijozga yuborish:" -ForegroundColor Cyan
Write-Host "  1. ZIP yoki EXE - USB / Telegram / Drive" -ForegroundColor White
Write-Host "  2. Mijoz An-Nur-Ornatish.cmd ni bosadi" -ForegroundColor White
Write-Host "  3. http://localhost:3000 ochiladi" -ForegroundColor White
