# Daily coach notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every day at 15:45 the laptop works out each registered player's bidding and card-play mistakes in their last 20 hands, Claude writes a coaching note (EN + ML), and the note is stored in Supabase for the player's account page.
**Architecture:** Node scripts in `test/` compute a facts file per player (card review per card from `src/review.js`, call judging with the bot's Monte Carlo from `src/bot.js`, all-cards-visible per-suit values as background), cached per hand. A scheduled Claude task writes the notes from the facts and an upload script upserts them into `coach_notes`. The server only reads one row on request.
**Tech Stack:** Node 18+, plain `assert` tests, Supabase REST, Claude scheduled task.
**Spec:** `docs/claude-plans/2026-11-22_daily-coach-notes.md`

## Global Constraints
- Nothing in this plan runs analysis on the VM; the server change is a single-row read.
- Notes and facts never enter git: `data/` is git-ignored; the prompt file holds no player names.
- Test seats get no note: names matching `/^tester ?2?$/i` (Tester, TEster, tester2, Tester 2).
- Last 20 hands = the player's 20 highest hand ids whose `seats[i].pid` is the player's id.
- A call is the player's mistake only when their own view supported a better call by at least `MISTAKE_CHIPS = 0.5` expected chips. All-cards-visible values are background, never blame.
- Bidding cost is in chips (`E.bidBaseTables`: under 40 win 1 / lose 2, 40: 2/3, 48: 3/4, 56: 4/5; times `mult`).
- Ask before committing or pushing. `npm test` passes before any commit.

## Review Focus
- A player with fewer than 20 logged hands: the note covers what exists (test in Task 3).
- A hand that no longer replays under today's rules (older logs): its calls are `judged: false`, the hand still counts (test in Task 2).
- Solver out of budget (8-player hands, long hands): card facts `null` with `reason`, never a crash (test in Task 2).
- Hands where the player's seat was played by a takeover bot (`played[k].auto`): those cards are not the player's (test in Task 2).
- A signed-out socket asking for a note gets "Sign in first." and a signed-in player with no note gets `null` (test in Task 5).

---

### Task 1: Solver and estimator hooks
**Files:** Modify `src/review.js`, `src/bot.js` (exports only), `test/imitate.js` (exports only); Test `test/review.js`.
**Produces:**
- `bestCards(hand, k, opts = { maxNodes }) -> { value: number, cards: string[] } | null` in `src/review.js`: at position k (k cards of `hand.played` played), solve the position after each legal card of the seat to move; return the bidding team's best total (equals `values(hand)[k]`) and the card ids that reach it; `null` when out of budget. Equivalent copies (`JS1`/`JS2`) count once (return one id).
- `src/bot.js` exports `simRun` and `evAt` (no behaviour change).
- `test/imitate.js` exports `rigHand`, `toAction`.

- [ ] Test in `test/review.js`: on the existing brute-force test deals, for every k, `bestCards(h, k).value === values(h)[k]`, and the logged card at k is in `cards` exactly when `cost(k) === 0`.
- [ ] Run `node test/review.js`: fails (`bestCards` missing).
- [ ] Implement; add the exports.
- [ ] `npm test` passes. Commit "Review: bestCards; export simRun, evAt, rigHand, toAction".

### Task 2: Facts for one hand and one seat
**Files:** Create `test/coach_lib.js`; Test `test/coach.js` (added to `npm test`).
**Consumes:** Task 1.
**Produces (all in `test/coach_lib.js`):**
- `cardFacts(hand, seat, { maxNodes }) -> { best, playedOut, given, tableAvg, cards: [{ k, trick, card, cost, best: string[]|null, flipped }] } | { reason: 'players'|'budget'|'empty' }`. `cards` lists the seat's own non-`auto` cards with `cost >= 1`; `best` only for `cost >= 2` (else null); `flipped` = the card moved the bidding team's value across `contract.value`.
- `allCardsBySuit(hand, team, { maxNodes }) -> { S, H, D, C, NT }` (team's best points with that trump, first leader as in the hand; a value is `null` when out of budget). NT only where the engine allows an NT contract.
- `judgeCalls(hand, seat, { deals = 200, seed }) -> [{ n, call, judged, ev, alt, loss }]` for every call the seat made in the bidding phase. Judged calls: pass and bid (any value, including 40/48/56 jumps). Not judged (`judged: false`): plus, ns, double, redouble, self-raise window, and any call after the replay breaks.
  - `ev(bid v in suit s) = evAt(simRun(view, s, P, rng), v)` with `P = { ...DEFAULT_PARAMS, simDeals: deals }`.
  - `ev(pass)` = 0 with no high bid; `-evAt(simRun(view, high.suit, P, rng, high.seat).map(x => 56 - x), high.value)` when an opponent holds it; `evAt(simRun(view, high.suit, P, rng, high.seat), high.value)` when a partner holds it.
  - `alt` = the best of pass and, for each suit legal to bid, the lowest legal value and each legal 40/48/56 level; `loss = alt.ev - ev` (>= 0); a mistake is `loss >= MISTAKE_CHIPS`.
  - Seed `Math.random`/rng from `hand.id * 131 + n` (as `botCall` in `test/imitate.js`) so runs repeat.
- `MISTAKE_CHIPS = 0.5`.

- [ ] Tests in `test/coach.js` on rigged logged-hand objects (`{ id, players: 6, dealer, dealt, auction, contract, played, result, seats }`):
  - opener holding both Jacks, both 9s and an Ace of Spades who passed: one judged call, `loss >= 0.5`, `alt.call` is a Spade bid.
  - a pointless hand (no J, 9, A) that passed: `loss < 0.5`.
  - the same pointless hand bidding 40 Hearts: `loss >= 0.5`, `alt.call.type === 'pass'`.
  - a Plus call is listed with `judged: false`.
  - a hand whose second logged call is illegal today: calls after it `judged: false`, no throw.
  - `cardFacts` on an 8-player hand returns `{ reason: 'players' }`; with `maxNodes: 1000` on a 6-player hand `{ reason: 'budget' }`.
  - a card the seat played with `auto: true` is not in `cards`.
- [ ] Run `node test/coach.js`: fails. Implement. Passes in under 60 s (use `deals: 60` in tests).
- [ ] Add `node test/coach.js` to the `test` script in `package.json`; `npm test` passes. Commit "Coach: facts for one hand".

### Task 3: Daily facts script
**Files:** Create `test/coach_facts.js`.
**Consumes:** Task 2; `.env` loading as in `test/fetch_hands.js`.
**Produces:** `data/coach/<player id>.json` = `{ v: 1, player: { id, name }, generated, hands: [ { id, date, players, seat, team, contract, result, myChips, cards: <cardFacts>, calls: <judgeCalls>, allCards: <allCardsBySuit for the seat's team> } ], totals: { hands, given, avgGiven, tableAvgGiven, calls, callsJudged, callMistakes, chipsLostInCalls } }` and `data/coach/todo.json` = `[player id, ...]` needing a new note. Cache per hand in `data/coach/cache/<hand id>.json` (card facts per seat, allCards per team, calls per seat) so a hand is solved once.
- Usage: `node test/coach_facts.js [--all] [--player <id>]` reads `data/hands.jsonl` (the scheduled task pulls it first), `players` and `coach_notes` from Supabase. A player needs a note when their newest hand id is above the max of their stored `hand_ids` (or `--all`). Up to 8 hands solved in parallel with `worker_threads` (laptop has 16 threads).
- [ ] Dry run on the real log: `node test/coach_facts.js --all`; check one facts file by hand (a hand's `myChips` matches its result; a player with under 20 hands lists all of them; test seats absent). Commit "Coach: daily facts script".

### Task 4: Note prompt, upload and table
**Files:** Create `test/coach_prompt.md`, `test/coach_upload.js`; add the SQL to the spec doc.
**SQL (user runs once in Supabase):**
```sql
create table coach_notes (
  player_id  bigint primary key references players(id),
  updated_at timestamptz not null default now(),
  hand_ids   int[] not null,
  note_en    text not null,
  note_ml    text not null,
  facts_version int not null default 1
);
alter table coach_notes enable row level security;
```
- `test/coach_prompt.md`: how Claude turns one facts file into `data/coach/<id>.note.json` = `{ hand_ids, note_en, note_ml }`. Rules: under 250 words; sections "Going well", "Costliest habits" (2-3, each with chips or points and a hand id), "Worst hands" (3, with trick and card or the call and the better call); only facts from the file; card-play claims labelled "with all cards visible"; bidding blame only from `judged` calls with `loss >= 0.5`; `allCards` only as background ("your side could have made ..."); plain text with `- ` bullets, no HTML; Malayalam in the game's wording (മേശ for chip, വിളി for bid, തുറുപ്പ് for trump).
- `test/coach_upload.js`: upserts every `data/coach/*.note.json` written today into `coach_notes` (`POST` with `Prefer: resolution=merge-duplicates`), prints one line per player, exits non-zero on any failure; rejects a note missing `note_en`, `note_ml` or `hand_ids`.
- [ ] Write one note by hand from a real facts file following the prompt; `node test/coach_upload.js` against the table after the user has created it (ask first). Commit "Coach: prompt and upload".

### Task 5: Account page "What went wrong"
**Files:** Modify `src/server.js` (socket `coachNote`, next to `myHands`), `public/app.js` (button beside "Replay my last 5 hands", modal), `public/lang.js` (ML strings), `test/socket.js`.
- Server: `socket.on('coachNote')` -> no `socket.data.pid`: fail "Sign in first."; no Supabase: emit `null`; else GET `coach_notes?player_id=eq.<pid>&select=updated_at,hand_ids,note_en,note_ml` (5 s timeout, as `recentHands`), emit the row or `null`.
- Client: "What went wrong" button; modal shows the note (`note_ml` when the page is in Malayalam), its date and "Hands #first-#last"; text escaped, `- ` lines as a list. `null`: "Your notes appear the day after you play (updated every afternoon)."
- [ ] Tests in `test/socket.js`: signed-out `coachNote` -> "Sign in first."; signed-in without Supabase -> `null`.
- [ ] Headless-Chrome check of the modal with a stubbed note (EN + ML, 390 and 1280 px). `npm test` passes. Commit "Account page: What went wrong".

### Task 6: Schedule and first run
- [ ] User allows `mcp__scheduled-tasks__create_scheduled_task` once and has created `coach_notes` (Task 4 SQL).
- [ ] Create task `play56-coach-notes`, cron `45 15 * * *`: in this repo run `node test/fetch_hands.js > data/hands.new.jsonl` (keep the old file if it fails), `node test/coach_facts.js`, write a note for each id in `data/coach/todo.json` per `test/coach_prompt.md`, `node test/coach_upload.js`; report players updated and any failure. No commits, no pushes.
- [ ] First run by hand with the user watching; README (one line on coach notes) and CLAUDE.md Recent entry. Ask before committing/pushing.
