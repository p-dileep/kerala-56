# Prints the public trycloudflare address from the tunnel log, waiting up to 40 s.
param([string]$Log = "tools\tunnel.log")
for ($i = 0; $i -lt 80; $i++) {
  if (Test-Path $Log) {
    $m = Select-String -Path $Log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1
    if ($m) { Write-Output $m.Matches[0].Value; exit 0 }
  }
  Start-Sleep -Milliseconds 500
}
exit 1
