@echo off
rem Get the latest YMT CRM and start it. Double-click this file; close the window (or Ctrl+C) to stop the CRM.
cd /d "%~dp0"

echo Getting the latest version...
git pull origin claude/ymt-group-pwa-mvp-45memd
if errorlevel 1 (
  echo.
  echo The update failed - see the message above. Nothing was started.
  pause
  exit /b 1
)

echo Installing packages...
call npm install
if errorlevel 1 (
  echo.
  echo npm install failed - see the message above.
  pause
  exit /b 1
)

echo Starting the CRM - open http://localhost:5173
call npm run dev
pause
