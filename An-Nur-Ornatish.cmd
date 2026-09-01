@echo off
chcp 65001 >nul
title An-Nur o'rnatish
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-an-nur.ps1"
if errorlevel 1 (
  echo.
  echo O'rnatishda xatolik.
  pause
  exit /b 1
)
echo.
echo Tayyor.
pause
