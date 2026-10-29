@echo off
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Installing it with winget...
  winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
  if errorlevel 1 (
    echo.
    echo Could not install Node.js automatically.
    echo Please install it from https://nodejs.org and run this file again.
    pause
    exit /b 1
  )
  echo.
  echo Node.js installed. Close this window and run start_game.bat again so the new PATH is picked up.
  pause
  exit /b 0
)

if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

start "" http://localhost:3056
echo Kerala 56 server running at http://localhost:3056
echo Close this window to stop the game.
node src\server.js
if errorlevel 1 pause
