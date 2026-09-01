# An-Nur - doimiy Cloudflare Tunnel
# Oldin: cloudflared tunnel login
# Keyin: cloudflared tunnel create an-nur-dokon
# DNS: cloudflared tunnel route dns an-nur-dokon kassa.SIZNING-DOMEN.uz

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$config = Join-Path $root "cloudflared\config.yml"
if (-not (Test-Path $config)) {
  Write-Host "config.yml topilmadi: $config" -ForegroundColor Red
  Write-Host "cloudflared\config.example.yml dan nusxa oling va sozlang." -ForegroundColor Yellow
  exit 1
}

if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  Write-Host "cloudflared o'rnating: scripts\install-cloudflared.ps1" -ForegroundColor Red
  exit 1
}

$listening = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if (-not $listening) {
  Write-Host "An-Nur server ishga tushirilmoqda..." -ForegroundColor Yellow
  Start-Process -FilePath "cmd.exe" -ArgumentList "/k", "set NODE_ENV=production&& npm run start -- --hostname 127.0.0.1 --port 3000" -WorkingDirectory $root -WindowStyle Normal
  Start-Sleep -Seconds 6
}

Write-Host "Tunnel ishga tushmoqda..." -ForegroundColor Green
cloudflared tunnel --config $config run
