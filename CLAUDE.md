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

- [x] 2026-11-04 Pulled 120 hands; human-vs-bot bidding analysis in `docs/claude-plans/2026-11-04_human-vs-bot-bidding.md` (humans call ~2-3x as often, bid ~3 above bot estimate, yet make 78% vs bots 56%; bots make 69% in self-play). Uncommitted.
- [x] 2026-11-04 Bot-contract loss analysis `docs/claude-plans/2026-11-04_bot-contract-losses.md`: human defenders are NOT the cause (all-bot replay of the same deals gives the same 58%); losses come from bot bidding (one-step bot-vs-bot contests, unconditional Plus 1, partner-raise double counting; bot own-bid estimate ignores the auction below 36). Also found: choosePlay hardcodes seats 0..5 (8-player bug). Fixes listed. Uncommitted.
- [x] 2026-11-04 Bots read the auction: `auctionRead()` in `src/bot.js` (partners' shown Jacks/Nines/repeated calls add, opponents' subtract, a partner who only passed counts as weak) feeds own bids + partner-raise teamEst; Plus 1 gated by `plusSlack`; Monte Carlo check on contested bids from `simMinValue` 32 (was 36). New knobs set to 0 / 99 / 36 reproduce the old bot exactly (1499/1499 logged decisions). Self-play A/B, 600 matches each side-swapped: new vs old +1.52 ± 0.54 tables/match (control old vs old -0.06 ± 0.35); new bot declares fewer contracts but makes 78% vs 74%. On logged hands it would pass 13 of the 21 bot contracts that lose even in all-bot play, and 6 of 34 made ones. npm test passes. Uncommitted.
- [x] 2026-11-04 Play: `track()` now places the cards the auction showed (Jacks, Plus cards) with their seat until played, and a Plus 1 on the Jack becomes a void once the Jack is out (`trackBids`); used for follow-suit safety and cut threats, NOT for leads (team-sure leads made partners overtake with their master: -0.86 tables/match). Bidding side draws trumps when holding >= `drawMinTrumps` (3) and at least as many as opponents can still have. 8-player fix: choosePlay used seats 0..5 only. Self-play (seeded deals + seeded Monte Carlo, control = 0.00 exactly): tracking 0.00 ± 0.25, draw -0.06..+0.06, 8p fix +0.08 ± 0.79, all neutral; the rules fire rarely (23 / 13 of 3303 logged card choices). `test/tune.js`: new knobs in STEPS, optional keys arg, Math.random seeded per match. Uncommitted.
- [x] 2026-11-04 Committed + pushed the above as ce4df91. Tuner (6 new knobs, 4 rounds) suggested readJackW 4, readNineW 1.5, readLenW 1.5, readPassW 0.5 (+0.67 on fresh deals); NOT applied, 600-match validation was killed (VM low memory).
- [x] 2026-11-04 Aggressive level jumps: first two live hands on ce4df91 (#121 Pappan 33->40, #122 Chinnu 40 then self-raise 48) failed badly. Cause: aggressive style used simConf 0.6, simMargin 0 on 24 noisy layouts (same position's estimate ranged 31-49 across runs) while a 40 pays 2 / costs 3. Fix: aggressive simConf 0.75, simMargin 1, simDeals 48. All-aggressive self-play, 250 matches: +5.09 ± 0.84 tables/match vs old aggressive, 40+ contracts made 80% vs 63% (plateau: 0.75-0.85 conf all +4.9..+5.4). Mixed-table check was killed (low memory), not run. npm test passes. Uncommitted.
- [x] 2026-11-04 NS answer (user's convention: NS = "I will cut this suit, change the trump", never meant to be played): a bot whose partner holds the bid with NS names its own leading suit (>= 3 cards with J/9, estimate covers the bid), else the NS caller's earlier suit, else its own earlier suit, else passes (`nsAnswer`, capped by `backMaxValue`). `auctionRead` credits an NS void in another suit (`readCutW` 2; opponents' NS subtracts). Logged hands: matches the human partners' answers in 3 of 4 cases. Self-play neutral (+0.04 ± 0.46; bots seldom say NS). README updated. Uncommitted.

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
