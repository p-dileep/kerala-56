# Waits up to 15 s for the game server to answer on port 3056.
for ($i = 0; $i -lt 30; $i++) {
  try { Invoke-WebRequest -UseBasicParsing http://localhost:3056/ -TimeoutSec 2 | Out-Null; exit 0 } catch { Start-Sleep -Milliseconds 500 }
}
exit 1
