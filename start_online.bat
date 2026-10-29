@echo off
setlocal
cd /d "%~dp0"
title Kerala 56 - online

echo ==========================================================
echo  Kerala 56 - start the game and make it reachable online
echo ==========================================================
echo.

rem ---- 1. Node.js ------------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 goto installnode
goto deps

:installnode
echo Node.js is not installed. Installing it with winget...
winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
if errorlevel 1 goto nodefail
echo.
echo Node.js installed. Close this window and run start_online.bat again.
pause
exit /b 0

:nodefail
echo.
echo Could not install Node.js automatically.
echo Please install it from https://nodejs.org and run this file again.
pause
exit /b 1

rem ---- 2. Dependencies -------------------------------------------------------
:deps
if exist node_modules goto cloudflared
echo Installing game dependencies - first time only...
call npm install
if errorlevel 1 goto depsfail
goto cloudflared

:depsfail
echo npm install failed. Check your internet connection and try again.
pause
exit /b 1

rem ---- 3. cloudflared, portable, no account needed ---------------------------
:cloudflared
if not exist tools mkdir tools
if exist tools\cloudflared.exe goto server
echo Downloading cloudflared - first time only, about 55 MB...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile 'tools\cloudflared.exe'"
if exist tools\cloudflared.exe goto server
echo Download failed. Check your internet connection and try again.
pause
exit /b 1

rem ---- 4. Game server --------------------------------------------------------
:server
echo Starting the game server...
start "Kerala 56 server" /min cmd /c "node src\server.js"
powershell -NoProfile -ExecutionPolicy Bypass -File wait_server.ps1
if errorlevel 1 goto serverfail
goto tunnel

:serverfail
echo The game server did not start. Is something else using port 3056?
pause
exit /b 1

rem ---- 5. Tunnel -------------------------------------------------------------
:tunnel
echo Opening the internet tunnel...
if exist tools\tunnel.log del tools\tunnel.log
start "Kerala 56 tunnel" /min tools\cloudflared.exe tunnel --url http://localhost:3056 --logfile tools\tunnel.log
set "URL="
for /f "usebackq delims=" %%u in (`powershell -NoProfile -ExecutionPolicy Bypass -File tunnel_url.ps1`) do set "URL=%%u"
if defined URL goto ready
echo Could not get a public address from the tunnel. See tools\tunnel.log.
pause
exit /b 1

:ready
echo.
echo ==========================================================
echo  Your game is online at:
echo.
echo    %URL%
echo.
echo  1. The browser will open at this address. Type your name
echo     and click "Start a new table".
echo  2. Click the table code at the top of the table screen to
echo     copy the invite link, and send it to your friends.
echo.
echo  Keep the two minimised windows - server and tunnel - open
echo  while you play. Close them to stop the game.
echo ==========================================================
echo.
start "" "%URL%"
echo %URL%| clip
echo The address has also been copied to your clipboard.
pause
