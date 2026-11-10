@echo off
REM Deploy play56 on the VM: pull main, reinstall prod deps, restart the service.
REM Rooms are in memory -- a restart ends games in progress, run at quiet hours.
REM Needs an elevated prompt (net stop/start).
setlocal
cd /d C:\kerala-56 || exit /b 1
echo [deploy] git pull --ff-only origin main
git pull --ff-only origin main || (echo [deploy] pull failed - not restarting & exit /b 1)
echo [deploy] npm ci --omit=dev
call npm ci --omit=dev || (echo [deploy] npm ci failed - not restarting & exit /b 1)
for /f %%i in ('git rev-parse HEAD') do C:\nssm\nssm.exe set Play56 AppEnvironmentExtra GAME_VERSION=%%i >nul
echo [deploy] restarting service Play56
net stop Play56
net start Play56 || exit /b 1
timeout /t 4 /nobreak >nul
curl -s -o nul -w "[deploy] http://localhost:3056 -> HTTP %%{http_code}\n" http://localhost:3056
git log -1 --format="[deploy] now at %%h %%s"
endlocal
