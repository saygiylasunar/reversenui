@echo off
setlocal
cd /d "%~dp0"
title ReversenUI Clean Reset

 echo.
 echo ========================================
 echo   ReversenUI - CLEAN RESET
 echo ========================================
 echo.
 echo This removes only generated/local dependencies:
 echo   backend\.venv
 echo   frontend\node_modules
 echo   frontend\dist
 echo   desktop\node_modules
 echo   desktop\build
 echo   desktop\dist
 echo.
 echo Source files are NOT deleted.
 echo.
set /p "CONFIRM=Type RESET to continue: "
if /I not "%CONFIRM%"=="RESET" (
  echo Cancelled.
  exit /b 0
)

for %%D in (
  "backend\.venv"
  "frontend\node_modules"
  "frontend\dist"
  "desktop\node_modules"
  "desktop\build"
  "desktop\dist"
) do (
  if exist %%D (
    echo [CLEAN] Removing %%~D...
    rmdir /s /q %%D
  )
)

echo.
echo [CLEAN] Reset complete. Starting fresh setup...
echo.
call "%~dp0ReversenUI.bat"
exit /b %ERRORLEVEL%
