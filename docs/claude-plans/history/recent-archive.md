# Archived "Recent" entries from CLAUDE.md

- 2026-11-10 (VM) Moved hosting from Render to the Cyfuture VM at https://play56.in: clone `C:\kerala-56`, NSSM services
  `Play56` (node :3056) + `Play56Tunnel` (own cloudflared tunnel `play56`, independent of dhiedge), machine env vars for
  Supabase + PORT, `deploy_play56.bat`. DNS CNAMEs for play56.in added by hand (origin cert is dhiedge-scoped).
  Runbook: `docs/claude-plans/2026-11-10_play56-vm-deploy.md`. Pushed as 46c7916.
- 2026-11-10 (VM) Auto deploy: task `Play56_AutoDeploy` runs `auto_deploy.ps1` every 5 min -- static-only pushes go live at once, server changes restart Play56 in the 03:00-06:00 quiet window (waits for empty tables until 05:30). Favicon + manifest added to public/.
- 2026-11-10 (laptop) README + lobby title/hint say play56.in; laptop-side plan `docs/claude-plans/2026-11-10_move-to-play56-in-on-cyfuture-vm.md` (this laptop is NOT the VM).
- 2026-11-10 Bidding imitation tuning: `test/imitate.js` replays the 261 logged hands and scores the bot against 1294 human bidding decisions (baseline score 58.0, tuned 61.6; held-out +0.7). Nine knobs moved -> `HUMAN_TUNED` in bot.js, self-play A/B +3.92 tables/match vs default (150 matches). RULE (user): half of the named bots ALWAYS carry the human-tuned numbers: **Kuttan, Ammini, Unni, Sarojini, Leela** (`HUMAN_TUNED_BOTS`); Pappan, Chinnu, Kunjamma, Appu, Mathai stay self-play; never change the membership, retune only the numbers. Doc `docs/claude-plans/2026-11-10_bidding-imitation-tuning.md`.
