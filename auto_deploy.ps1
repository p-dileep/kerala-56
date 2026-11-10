# auto_deploy.ps1 -- play56.in quiet-window auto deploy (runs every 5 min as SYSTEM, task Play56_AutoDeploy).
#  - fetch origin/main; nothing new -> exit
#  - only public/, docs/ or *.md changed      -> git pull now (static files are read per request, no restart)
#  - anything else (src/, package*.json ...)  -> wait for 03:00-06:00 IST, then pull, npm ci if the lockfile
#    changed, stamp GAME_VERSION, restart service Play56. Inside the window it still waits while players are
#    connected on :3056, until 05:30 when it restarts regardless.
#  - dirty working tree -> never pulls; fix by hand.  Log: C:\kerala-56\logs\auto_deploy.log
$ErrorActionPreference = 'Stop'
$repo = 'C:\kerala-56'; $log = "$repo\logs\auto_deploy.log"
$git = 'C:\Program Files\Git\cmd\git.exe'; $npm = 'C:\Program Files\nodejs\npm.cmd'; $nssm = 'C:\nssm\nssm.exe'
function Log($m) { Add-Content $log ("{0} {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m) }
Set-Location $repo
& $git fetch -q origin main 2>&1 | Out-Null
$head = (& $git rev-parse HEAD).Trim(); $remote = (& $git rev-parse origin/main).Trim()
if ($head -eq $remote) { exit 0 }
if (& $git status --porcelain --untracked-files=no) { Log "origin/main at $($remote.Substring(0,7)) but the working tree is dirty -- not pulling"; exit 0 }
$files = @(& $git diff --name-only "$head" "$remote")
$restart = @($files | Where-Object { $_ -notmatch '^(public/|docs/)' -and $_ -notmatch '\.md$' })
if ($restart.Count -eq 0) {
    & $git pull -q --ff-only origin main 2>&1 | Out-Null
    Log "static-only update $($head.Substring(0,7)) -> $($remote.Substring(0,7)) pulled, no restart ($($files -join ', '))"
    exit 0
}
$now = Get-Date
if ($now.Hour -lt 3 -or $now.Hour -ge 6) { exit 0 }        # outside the quiet window: wait
$players = @(Get-NetTCPConnection -LocalPort 3056 -State Established -ErrorAction SilentlyContinue).Count
if ($players -gt 0 -and ($now.Hour -lt 5 -or ($now.Hour -eq 5 -and $now.Minute -lt 30))) {
    Log "server update $($remote.Substring(0,7)) waiting: $players connection(s) on :3056"; exit 0
}
Log "server update $($head.Substring(0,7)) -> $($remote.Substring(0,7)) deploying ($($restart -join ', '))"
& $git pull -q --ff-only origin main 2>&1 | Out-Null
if ($files -contains 'package-lock.json' -or $files -contains 'package.json') {
    $out = & $npm ci --omit=dev 2>&1; Log "npm ci: $(($out | Select-Object -Last 1))"
}
& $nssm set Play56 AppEnvironmentExtra "GAME_VERSION=$remote" | Out-Null
Restart-Service Play56
Start-Sleep 5
$code = try { (Invoke-WebRequest http://localhost:3056 -UseBasicParsing -TimeoutSec 10).StatusCode } catch { "ERR $($_.Exception.Message)" }
Log "Play56 restarted at $($remote.Substring(0,7)); http://localhost:3056 -> $code"