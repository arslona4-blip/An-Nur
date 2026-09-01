@echo off
chcp 65001 >nul
cd /d "%~dp0"
set NODE_ENV=production

if not exist "package.json" (
  echo XATO: package.json topilmadi. Papka: %CD%
  pause
  exit /b 1
)

if not exist "node_modules\next\package.json" (
  echo Kutubxonalar o'rnatilmoqda...
  call npm ci
  if errorlevel 1 goto :err
)

if not exist ".next\BUILD_ID" (
  echo Dastur yig'ilmoqda...
  call npm run build
  if errorlevel 1 goto :err
)

netstat -ano | findstr ":3000.*LISTENING" >nul
if not errorlevel 1 (
  echo Server allaqachon ishlayapti.
  start "" "http://localhost:3000/login"
  pause
  exit /b 0
)

echo An-Nur server ishga tushmoqda...
start "An-Nur Server" /D "%CD%" cmd /k "set NODE_ENV=production&& npm run start -- --hostname 0.0.0.0 --port 3000"

echo Kutilyapti...
set /a n=0
:wait
timeout /t 2 /nobreak >nul
set /a n+=1
powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri 'http://localhost:3000/login' -TimeoutSec 3 -UseBasicParsing).StatusCode | Out-Null; exit 0 } catch { exit 1 }"
if not errorlevel 1 goto :open
if %n% lss 15 goto :wait
echo Server ochilmadi. An-Nur Server oynasidagi xatoni ko'ring.
pause
exit /b 1

:open
start "" "http://localhost:3000/login"
echo Tayyor: http://localhost:3000
echo MUHIM: An-Nur Server oynasini yopmang.
pause
exit /b 0

:err
echo Xatolik yuz berdi.
pause
exit /b 1
