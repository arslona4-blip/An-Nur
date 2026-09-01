@echo off
cd /d "%~dp0.."
set NODE_ENV=production
if not exist ".next\BUILD_ID" (
  echo An-Nur: birinchi marta build qilinmoqda...
  call npm run build
)
start "" /B npm run start -- --hostname 0.0.0.0 --port 3000
echo An-Nur ishga tushdi: http://localhost:3000
