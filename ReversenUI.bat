@echo off
setlocal
cd /d "%~dp0"
title ReversenUI

 echo.
 echo ========================================
 echo   ReversenUI - source launcher
 echo ========================================
 echo.

where powershell.exe >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Windows PowerShell was not found.
  pause
  exit /b 1
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-desktop.ps1"
set "EXITCODE=%ERRORLEVEL%"

if not "%EXITCODE%"=="0" (
  echo.
  echo [ERROR] ReversenUI could not start. Exit code: %EXITCODE%
  echo Read the error above, then press any key.
  pause >nul
)

exit /b %EXITCODE%
