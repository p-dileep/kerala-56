# Post-hand card review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After every 6-player hand, a background worker solves the deal with all cards visible and the result box / replay show best possible, played out, and the player's own points given away against the table average.

**Architecture:** A dependency-free exact solver (`src/review.js`, alpha-beta + MTD(f) + fixed transposition table) runs in one `worker_threads` worker behind a small queue (`src/reviewWorker.js`). The server queues each logged 6-player hand, stores the result on the hand row (Supabase PATCH / local log line) and sends each socket a personalised copy in the `room` payload; the client fills the result box, toasts late reviews and shows the review in the replay.

**Tech Stack:** Node >= 18 (`worker_threads`), express + socket.io (existing), plain JS client.

**Spec:** `docs/claude-plans/2026-11-20_post-hand-card-review.md` (approved 2026-11-20). Throwaway spike with the measured solver: scratchpad `dd2.js` (not in the repo); the solver below is that spike made tidy.

## Global Constraints

- Public repo: no player names, hosting details, table codes or keys in tracked files (tests use names like `Tester`, `Guest`).
- No new npm dependencies.
- 6-player only; 8-player hands get `{ none: 'players' }` and the line "Review is not available on 8-player tables yet".
- Each player sees only their own points given away, plus the table average; spectators see neither.
- Cards with `auto: true` (takeover bot for an absent human) count for nobody.
- Label: "Review, with all cards visible". No costliest-card call-out.
- Defaults: `REVIEW_NODES` 180000000, queue cap 6, wall-clock guard 120000 ms, worker idle exit 60000 ms, table 2^20 entries; `REVIEW=off` disables; single core (`(os.availableParallelism?.() ?? os.cpus().length) < 2`) disables unless `REVIEW=on`.
- All new UI text in English and Malayalam (`public/lang.js`).
- `npm test` must pass; run `npm run lint` only if the repo has it (it does not today).
- Workflow: do not commit or push without the user's OK; no commit steps below. Update the project `CLAUDE.md` "Recent" (max 5 entries, <= 4 lines each) at the end.

## Review Focus

1. A hand conceded mid-trick (played count not a multiple of 6): the last position has a partial trick; review must solve it, not crash. -> Task 1 test `conceded mid-trick`.
2. No-trump contracts (`contract.suit === 'NT'`): no trump suit in the solver. -> Task 1 brute-force test runs NT endings too.
3. Both copies of one card in the same trick: the first played wins the tie (engine rule). -> Task 1 test `tie goes to the first copy`.
4. The worker hangs or dies mid-job: that hand gets "none", the next hand is reviewed normally. -> Task 2 test `guard restarts the worker`.
5. A review arriving after the next hand started, or to a player who reconnects: shown once (toast), never in the wrong hand's box. -> Task 3 e2e asserts `review.key` and hand number; Task 4 manual check.

---

### Task 1: Solver `src/review.js`

**Files:**
- Create: `src/review.js`
- Create: `test/review.js`
- Modify: `package.json` (`test` script: `node test/sim.js && node test/review.js && node test/socket.js`)

**Interfaces:**
- Produces:
  - `reviewHand(hand, { maxNodes = 180e6 } = {})` where `hand = { players, dealt: string[][] /* card ids per seat */, contract: { team, suit /* S H D C NT */ }, played: [{ seat, card: { id }, auto? }] }`. Returns `{ v: 1, best, playedOut, stopped, given: number[], autoGiven: number[], nodes }` or `{ v: 1, none: 'budget' | 'players' | 'empty' }`. `stopped` = fewer cards played than dealt. `given[s]` excludes `auto` cards; `autoGiven[s]` is their cost.
  - `personal(review, seat)` (seat = number or null): `null` for no review; `{ none }` passthrough; else `{ best, playedOut, stopped, avg, mine? }` with `avg` = mean of `given` rounded to 0.1 and `mine` = `given[seat]` only when seat is a number.
  - `values(hand, opts)` (exported for tests): `V[0..m]` array or `null` on budget.

- [ ] **Step 1: Write the failing tests in `test/review.js`** (plain `assert`, prints `review tests passed`)
  - `brute force agrees`: 300 random endings (seeded RNG): deal a 6p deck (`E.makeDeck(6)`, `E.shuffle`), give each seat its last 2 cards (and 100 cases with 3), random trump in S/H/D/C/NT, random bidding team and leader; a plain recursive minimax (no pruning, written in the test, using `E.legalCards`-equivalent follow-suit and `winningIndex` rules) gives the bidder points; `values()` on the same position (built as a `hand` whose `played` is empty and whose `dealt` is the short hands) must equal it.
  - `tie goes to the first copy`: hand-built 1-trick ending where seat 0 leads `AS0` and seat 3 plays `AS1` (spades trump); bidders team 0 must get the trick's points.
  - `identity and no negative cost`: 3 seeded bot-played 6p deals (as `test/par.js` `bidAndPlay` does, seeds 1..3), reviewed from trick 4 on (pass a hand whose `dealt` is each seat's cards left after trick 3 and `played` the rest): every card cost >= 0 and `playedOut === best - sum(bidder given+autoGiven) + sum(defender given+autoGiven)`; for a deal played to the end `playedOut === engine points of the bidding team`.
  - `conceded mid-trick`: same deal, `played` cut after 2 cards of a trick: returns numbers, `stopped === true`.
  - `auto cards count for nobody`: mark one played card of a costly seat `auto: true`: `given` drops by that card's cost, `autoGiven` holds it.
  - `budget`: `maxNodes: 10` gives `{ none: 'budget' }`; an 8-player hand gives `{ none: 'players' }`; `played: []` gives `{ none: 'empty' }`.
  - `personal`: `mine` only for a numeric seat; `avg` rounded to 0.1; `personal(null, 0) === null`.
  - Whole file runs in under ~10 s.

- [ ] **Step 2: Run** `node test/review.js` -> FAIL (`Cannot find module '../src/review'`).

- [ ] **Step 3: Implement `src/review.js`** from the spike `dd2.js` (scratchpad). Keep: card types = suit x rank with counts 0..2 per seat; per-trick-depth storage for trick cards (`tc`/`ts` indexed `trickDepth * P + n` — the spike's bug was sharing one trick buffer across depths); TT at every node keyed by Zobrist of (seat, type, count) ^ leader ^ (trick position, type), two-entry buckets of 2^20 entries (`Int32Array` keys x2, `Int8Array` lo / hi / best move / cards-left), allocated once per module and cleared per hand; equivalence skip (same seat, same suit, same points, no card of a rank between them inclusive held elsewhere or in the current trick); move order = TT best move, then trick-shape heuristic, then history counter; values solved from k = m back to 0, each MTD(f) seeded with the previous value; node counter throws on `maxNodes`. Card rules copied from `src/engine.js` constants (`RANK_POWER`, `POINTS`, `RANKS`) by import, not retyped.

- [ ] **Step 4: Run** `node test/review.js` -> `review tests passed`.

- [ ] **Step 5: Check against the logged hands (not committed)**: a scratch script runs `reviewHand` on the first 30 6p hands of `data/hands.jsonl` and compares `best` / `playedOut` / `given` with the spike's output in scratchpad `v2_6p.jsonl`: identical.

### Task 2: Worker queue `src/reviewWorker.js`

**Files:**
- Create: `src/reviewWorker.js`
- Modify: `test/review.js` (append worker tests)

**Interfaces:**
- Consumes: `reviewHand` from Task 1.
- Produces: `makeReviewQueue({ maxNodes, cap = 6, guardMs = 120000, idleMs = 60000 } = {})` -> `{ enqueue(hand) -> Promise<review>, close() }`. Never rejects: failures resolve to `{ v: 1, none: 'busy' | 'timeout' | 'error' }`. Also `reviewEnabled(env = process.env)` -> boolean (off for `REVIEW=off`; off on one core unless `REVIEW=on`). The file is its own worker script (`isMainThread` branch posts `reviewHand(hand, { maxNodes })` back). Worker created lazily with `resourceLimits: { maxOldGenerationSizeMb: 96 }`; one job at a time; logs `review <ms> ms <nodes> nodes` per job to the console.

- [ ] **Step 1: Write failing tests** (appended to `test/review.js`, async, before the final `review tests passed`)
  - `worker reviews a hand`: enqueue seeded deal 1 from Task 1 (trick-4 cut) -> same object as `reviewHand` in-thread.
  - `queue cap`: `cap: 1`, enqueue 3 jobs at once -> the third resolves `{ none: 'busy' }`.
  - `guard restarts the worker`: `guardMs: 1` on a full seeded 6p deal -> `{ none: 'timeout' }`; then with a normal guard the next enqueue on the same queue returns a review.
  - `reviewEnabled`: `{ REVIEW: 'off' }` -> false; `{ REVIEW: 'on' }` -> true.
  - `close()` lets the process exit (test ends without hanging).

- [ ] **Step 2: Run** `node test/review.js` -> FAIL (missing module).
- [ ] **Step 3: Implement** `src/reviewWorker.js`.
- [ ] **Step 4: Run** `node test/review.js` -> passes, exits on its own.

### Task 3: Server wiring

**Files:**
- Modify: `src/server.js` (`autoAct` ~308, `logHand` 146, `recentHands` 187, `broadcast` 230-270, `myHands` handler ~410)
- Create: `test/review_e2e.js`; Modify: `package.json` test script (append `&& node test/review_e2e.js`)

**Interfaces:**
- Consumes: `makeReviewQueue`, `reviewEnabled` (Task 2), `personal` (Task 1).
- Produces (for Task 4):
  - `room` payload field `review`: `null` or `{ key, handNo, players, pending?: true, ...personal(stored, mySeat) }` for the latest finished hand, `key` = `${room.code}:${room.handSeq}` (`room.handSeq` increments per logged hand). `pending: true` from hand end until the review is stored. 8-player: `{ key, handNo, players: 8, none: 'players' }` at once.
  - `myHands` rows gain `review: personal(row.review, me)` (or `null`).

- [ ] **Step 1: Write `test/review_e2e.js`** (pattern of `test/socket.js`: env set before `require('../src/server')`, `PORT=0`, temp `HAND_LOG`, bot delays 5, `REVIEW=on`, `REVIEW_NODES=20000000`): a guest `Tester` creates a 6-player table, starts, plays first legal card / minimum bid / pass as `test/socket.js` `act` does. Asserts:
  - At hand 1 handover the payload has `review.key` and `review.pending === true` or a finished review.
  - Within 30 s a payload for the same `key` arrives with either numbers (`typeof mine === 'number'`, `typeof avg === 'number'`, `best` and `playedOut` numbers, no `given` / `autoGiven` keys anywhere in the payload) or `none` in `budget | timeout | busy`.
  - The local `HAND_LOG` holds a line `{ review_of: <hand 1 id>, review }` with the full `given` array.
  - A second socket that only watches (joins after the table is full) gets `review` without `mine`.
  - Prints `review e2e passed`, removes the temp log, exits 0.
- [ ] **Step 2: Run** `node test/review_e2e.js` -> FAIL (no `review` in payload).
- [ ] **Step 3: Implement in `src/server.js`:**
  - `autoAct`: after `E.playCard` for `s.kind === 'human'`, set `g.played[g.played.length - 1].auto = true`.
  - `logHand(room)` returns `Promise<id | null>`: Supabase POST to `/rest/v1/hands?select=id` with `Prefer: return=representation`, id from `[0].id`; local log resolves the `Date.now()` id it wrote. Errors still only logged.
  - In `broadcast`, after `logHand`: `room.handSeq++`; set `room.review = { key, handNo, players, pending: true }` (8p: `none: 'players'`, void or no card played: `room.review = null`); for 6p `queue.enqueue(row)` (row = the same object `logHand` builds; refactor `logHand` to take/return it if needed). On resolve: if `room.review.key` still matches, replace with `{ key, handNo, players, stored: review }`, then `broadcast(room)`; independently store: Supabase `PATCH /rest/v1/hands?id=eq.<id>` body `{ review }` (5 s abort, log failures), local log appends `{ review_of: id, review }`.
  - Payload: `review: room.review && { key, handNo, players, pending, none, ...personal(room.review.stored, seat >= 0 ? seat : null) }` (drop undefined keys).
  - `recentHands`: select adds `review`; local branch merges `review_of` lines into their rows and skips them as rows.
  - `myHands`: add `review: personal(h.review, me)`.
  - Queue created once at module load from `reviewEnabled()`; when disabled `room.review` stays `null` (UI shows nothing).
- [ ] **Step 4: Run** `node test/review_e2e.js` -> `review e2e passed`; `npm test` -> all pass (socket.js still passes with 8p `none`).

### Task 4: Client — result box, late toast, replay

**Files:**
- Modify: `public/app.js` (room handler ~85, `renderPhaseModal` ~1170, `showReplay` ~190), `public/lang.js` (ML strings), `public/style.css` (`.review` block)

**Interfaces:**
- Consumes: `room.review`, `myHands[].review` (Task 3).

- [ ] **Step 1: Add `reviewHTML(rv, contract)`** in `app.js` returning the block (exact English copy, `{n}` placeholders through `T`):
  - Heading `Review, with all cards visible`
  - `Best possible for {team}: {best} (bid {value})`
  - when `stopped`: `Played out: {team} would have finished with {playedOut}`
  - when `mine` present: `You gave away {mine} points · table average {avg}` + grade: `better than the table` (mine < avg - 0.5), `about the table average` (within 0.5), `more than the table` (mine > avg + 0.5); 1 point -> `You gave away 1 point`.
  - `pending`: `Reviewing the cards…`; `none` budget/timeout/busy/error: `No review for this hand`; `none: 'players'`: `Review is not available on 8-player tables yet`.
  - Team name = `teamName(c.team)` at the table; in the replay `Team A` / `Team B`.
- [ ] **Step 2: Result box:** add `<div id="reviewBox" class="review">` under the tally (not for void hands); filled from `room.review` when `room.review.handNo === g.handNo` and the box belongs to that hand. In the `room` handler, if `#reviewBox` exists and its `data-key` is the current `room.review.key`, refill it.
- [ ] **Step 3: Late toast:** in the `room` handler, when `room.review` has numbers or `none` (not `pending`), its key was not shown in a box or toasted before (remember keys in a Set), the viewer is seated (`room.mySeat !== null`), and no `#reviewBox` with that key is on screen: `toast(T('Hand {0} review: you gave away {1} points · table average {2}', ...))`; skip the toast for `none` and for spectators. Toast stays 6 s for this message (`toast(msg, ms)` optional second arg, default 2600).
- [ ] **Step 4: Replay:** at the last step of `showReplay`, append `reviewHTML(h.review, h.contract)` when `h.review`.
- [ ] **Step 5: Malayalam** for every new string in `lang.js` (same keys as the English); CSS for `.review` (muted heading, numbers bold, fits 360 px).
- [ ] **Step 6: Check in a browser** (local server `node src/server.js`, port 3056, Playwright MCP or headless Chrome): play a 6p hand as a guest; screenshot result box with "Reviewing…" then filled; a hand where Next hand is clicked at once shows the toast; spectator view has no "You gave away"; 8-player table shows the not-available line; replay as a signed-in player shows the block at the last step; EN + ML, widths 1200 and 390. `npm test` passes.

### Task 5: Docs and wrap-up

**Files:**
- Modify: `docs/claude-plans/2026-11-20_post-hand-card-review.md` (what was built, final numbers, deploy steps), `CLAUDE.md` (one "Recent" entry, move the oldest to `docs/claude-plans/history/` if over 5), `README.md` only if it describes the result screen.

- [ ] **Step 1:** Design doc gets a "Built" section: files, defaults, the Supabase SQL `alter table hands add column review jsonb;` (run before deploying), `REVIEW=off` for the old Render service, "check one review's time in the server log after deploy".
- [ ] **Step 2:** `npm test` -> all pass (output quoted in the report).
- [ ] **Step 3:** Ask the user before committing; commit on a branch, do not push without OK.
