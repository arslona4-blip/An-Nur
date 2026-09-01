@echo off
chcp 65001 >nul
cd /d "%~dp0.."
set NODE_ENV=production

if not exist "package.json" (
  echo XATO: An-Nur papkasi topilmadi.
  echo Joriy papka: %CD%
  pause
  exit /b 1
)

if not exist "node_modules\next\package.json" (
  echo An-Nur: kutubxonalar o'rnatilmoqda...
  call npm ci
  if errorlevel 1 (
    echo npm ci xatolik
    pause
    exit /b 1
  )
)

if not exist ".next\BUILD_ID" (
  echo An-Nur: birinchi marta build qilinmoqda...
  call npm run build
  if errorlevel 1 (
    echo build xatolik
    pause
    exit /b 1
  )
)

echo An-Nur ishga tushmoqda...
start "An-Nur Server" /D "%CD%" cmd /c "npm run start -- --hostname 0.0.0.0 --port 3000 & pause"
timeout /t 4 /nobreak >nul
start "" "http://localhost:3000/login"
echo.
echo An-Nur: http://localhost:3000
echo Server oynasini yopmang.
pause
