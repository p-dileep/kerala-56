# kerala-56 (56 / Ambathiyaaru card game) — VM clone

Live at https://kerala-56.onrender.com (Render, auto-deploy from GitHub `main`).
Source: https://github.com/p-dileep/kerala-56. Develop locally; this VM clone is read-only (git pull only).

## Current Task
Log finished hands to Supabase so human play can later tune the bots (`src/bot.js` DEFAULT_PARAMS).

## Done
- [x] 2026-11-01 Design decided: Supabase free tier as the hand store (not the dhiedge VM backend).
- [x] 2026-11-01 Plan with SQL, server snippet, fetch script: `docs/claude-plans/2026-11-01_supabase-hand-logging.md`

- [x] 2026-11-01 Supabase project created, SUPABASE_URL + SUPABASE_SERVICE_KEY set on Render
- [x] 2026-11-01 `hands` table created with RLS enabled (SQL from plan section 1)
- [x] 2026-11-01 Hand logging added to `src/server.js`, pushed as a81340e (Render auto-deploys)
- [x] 2026-11-01 Verified: first live hand (TABLE6, hand 1) landed in Supabase `hands`

- [x] 2026-11-01 Team names editable (✎ in top bar, any seated player; `teamName` socket event, room.teamNames) + trophy celebration overlay after every hand (winner of the chips) and a bigger "Champions" one on match win (`celebrate()` in app.js). Pushed as e039d87 (Render auto-deploys).

- [x] 2026-11-01 `test/fetch_hands.js` + lobby private-table hint pushed as 44575d7; `.env` + `data/` git-ignored. First pull: 9 hands, all TABLE6, 3 humans (bgk, Dileep, IAK), 4 human-declared contracts.

- [x] 2026-11-01 Rule change: opening Plus N = 27+N (Plus 1 -> 28, Plus 2 -> 29). Lobby reordered (private table, code, fixed tables, rules). Pushed to main.

- [x] 2026-11-01 Spectators: server tracks socket.data.name, broadcasts `watchers` (names of connected non-seated sockets); top-bar eye chip, lobby "N watching", chat lines on arrive/leave. Hands already hidden for non-seated views. Also "Public tables" label in lobby. Pushed to main.

- [x] 2026-11-01 Bug: partner Plus button dead when a Plus in another suit also showed (innerHTML += dropped handlers). Found via hand 20 (ASM, Plus 2 H + Plus 1 C). Fixed in renderBidPanel, verified by headless-Chrome click test, pushed to main.

- [x] 2026-11-01 Mobile: chat panel gets a Close button + tap-outside close, solid background on phones; full-screen toggle (⛶) in top bar on touch devices with the Fullscreen API (not iPhone Safari). Pushed to main.

- [x] 2026-11-01 8-player table now uses 64 cards (8s and 7s added, rank below Q, 0 points), 8 cards each. Engine `makeDeck(players)`, `ranksFor()`, RANK_POWER rescaled; bot averages adjusted; rules text + README updated; sim test covers 60 8p matches. Uncommitted.

## In Progress
- [ ] Collect hands; nothing to do until a few hundred human hands exist

## Next Steps
1. Pull the latest main on the local machine before editing there (this change was committed from the VM clone).
2. After a few hundred human hands: extend `test/tune.js` to replay logged deals / bidding imitation.

## Notes
- Seat clipping on phones fixed (keepSeatsOnScreen nudges seats via --nudge; slimmer seat buttons <=700px). Pushed to main. Still crowded: 8-player table at 360px before the deal (top/corner seats touch, left seat covers mat text).
- No DOM test harness in the repo (no jsdom). Client click checks were done once with headless Chrome over CDP from a scratch script.
- Pull hands: `node test/fetch_hands.js > data/hands.jsonl` (Supabase creds in `.env`, not committed). The service key was pasted in chat on 2026-11-01 and should be rotated (update `.env` here + Render env).
- Local test: `node src/server.js` -> http://localhost:3056 ; on localhost `window.demoWin(0)` in the console previews the trophy animation.
- Bots are rule-based (about 45 numeric knobs + 3 style presets + Monte Carlo check); `test/tune.js` is a self-play tuner.
- Rooms are in memory on Render; nothing is persisted today. Redeploy ends tables in progress.
- Supabase free project pauses after 7 idle days; weekly activity keeps it alive.
