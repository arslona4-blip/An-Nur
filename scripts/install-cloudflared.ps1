# Cloudflare Tunnel - cloudflared o'rnatish
$ErrorActionPreference = "Stop"

$installed = Get-Command cloudflared -ErrorAction SilentlyContinue
if ($installed) {
  Write-Host "cloudflared allaqachon o'rnatilgan:" -ForegroundColor Green
  cloudflared --version
  exit 0
}

Write-Host "cloudflared o'rnatilmoqda..." -ForegroundColor Yellow
winget install --id Cloudflare.cloudflared -e --accept-package-agreements --accept-source-agreements

$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  Write-Host "O'rnatildi. Terminalni yoping va qayta oching." -ForegroundColor Yellow
  exit 0
}

cloudflared --version
Write-Host "Tayyor." -ForegroundColor Green
