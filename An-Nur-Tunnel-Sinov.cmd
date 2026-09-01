@echo off
chcp 65001 >nul
title An-Nur - Cloudflare tez link
cd /d "%~dp0"

echo ========================================
echo   An-Nur - Cloudflare Tunnel (sinov)
echo ========================================
echo.

where cloudflared >nul 2>&1
if errorlevel 1 (
  echo cloudflared topilmadi. Avval o'rnating:
  echo   scripts\install-cloudflared.ps1
  pause
  exit /b 1
)

netstat -ano | findstr ":3000.*LISTENING" >nul
if errorlevel 1 (
  echo An-Nur server ishga tushirilmoqda...
  start "An-Nur Server" /D "%CD%" cmd /k "set NODE_ENV=production&& npm run start -- --hostname 127.0.0.1 --port 3000"
  echo Kutilyapti...
  timeout /t 6 /nobreak >nul
)

echo.
echo Cloudflare link yaratilmoqda...
echo Quyidagi https://....trycloudflare.com linkini nusxalang.
echo.
cloudflared tunnel --url http://127.0.0.1:3000
pause
