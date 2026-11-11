# Archived "Recent" entries from CLAUDE.md

- 2026-11-10 (VM) Moved hosting from Render to the Cyfuture VM at https://play56.in: clone `C:\kerala-56`, NSSM services
  `Play56` (node :3056) + `Play56Tunnel` (own cloudflared tunnel `play56`, independent of dhiedge), machine env vars for
  Supabase + PORT, `deploy_play56.bat`. DNS CNAMEs for play56.in added by hand (origin cert is dhiedge-scoped).
  Runbook: `docs/claude-plans/2026-11-10_play56-vm-deploy.md`. Pushed as 46c7916.
