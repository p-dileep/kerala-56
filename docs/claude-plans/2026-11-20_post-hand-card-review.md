# Post-hand card review (step 3 of the rating plan) — design

Status: approved 2026-11-20, built 2026-11-21; kept on branch claude/agitated-villani-720f00 only (user, 2026-11-21: do not merge to main for now). Plan step 3 of the friend's rating plan (`docs/private/`, git-ignored).

## Why

After every hand the players should be able to see, with all cards visible, how well the cards were
played: what the bidding side could have taken, where a hand that stopped early was heading, and how many
points each player's own cards cost. The per-player number is stored with the hand so the personal rating
move (plan step 6, not in this task) can use it later. Graded against the table, not against perfect play:
a player who cannot see the other hands will often "give away" points no one could have saved.

## Goals

1. After each 6-player hand the server works out, with all cards visible and perfect play by everyone:
   - **Best possible**: the most points the bidding team could take from the deal (all 8 tricks).
   - **Played out**: for a hand that stopped early (target reached / out of reach) or was conceded,
     the points the bidding team would have finished with had play gone on, perfectly, from where it stopped.
   - **Points given away**, per seat (bots included): the sum, over that seat's played cards, of how much
     the card lowered the best-play result for the seat's own team.
2. It runs as a background job, off the game loop, with a fixed amount of search work per hand. If the
   work runs out: "No review for this hand".
3. Shown in the result box after the hand, and at the end of each hand in the "Replay my last 5 hands"
   list on the account page. Labelled "with all cards visible".
4. Stored with the hand (Supabase `hands.review`, local log line) for step 6.

## Non-goals

- 8-player tables (decided 2026-11-20): not reviewed. The result box says "Review is not available on
  8-player tables yet". Speed test: 23 of 31 logged 8-player hands did not finish in ~50 s.
- No call-out of the single costliest card (user decided).
- No leaderboard, no rating change from the review (step 6 later).
- No review of the bidding.
- No re-reviewing of the 1059 old hands in this task (a script could do it later; see "Left to the builder").

## Anti-goals

- A game slowed down or a server out of memory because of the review.
- Showing a player anyone else's points given away (user decided: **each player sees only their own**,
  next to the table average). Spectators see only the hand lines (best possible, played out).
- Numbers that are wrong. A review we cannot finish is better shown as "no review" than guessed.

## Decided (with the user)

| Question | Decision |
|---|---|
| Who sees points given away | Only the player themself, with the table average for that hand |
| 8-player tables | Skip for now, with a "not available yet" line |
| How to solve | Exact solver (approach A below), after a speed test |
| Costliest card | Not shown |
| Grade | Against the table average, not against perfect |
| Cards a bot plays for an absent human (20 s takeover) | Count for nobody: not in that player's number, not in the table average. From now on `autoAct` marks them `auto: true` in `played` (old hands cannot be told apart) |
| Review that arrives after the result box closed (host already dealt on) | A private pop-up (toast) to each seated player: "Hand 5 review: you gave away 3 points · table average 2.2"; signed-in players also see it in the replay |

## Approaches considered

- **A. Exact all-cards-visible solver (picked).** Alpha-beta over every legal card with a fixed-size
  transposition table; duplicate copies and equivalent cards collapse; deterministic work budget counted
  in search positions. All three numbers are exact. Risk was speed: measured below.
- **B. Bots play the hand out with the cards shown** (as `test/par.js` does). Cheap, but a bot is not
  perfect play: "best possible" can come out below what happened and players get charged for bot errors.
  Unfair for a rating input. Dropped.
- **C. Exact solver at trick boundaries only.** Cheaper, but charges a whole trick to a team, not a card
  to a player; step 6 needs per-player numbers. Dropped.

## Speed test (throwaway spike, 2026-11-20, this machine)

- Engine check first: replaying the logged cards through `src/engine.js` reproduces the logged points
  of both teams on all 1059 logged hands (415 played all 8 tricks, 626 stopped early, 18 conceded).
- Solver (scratch spike, allocation-free, MTD(f) null-window probes, two-entry 2^21 table, history and
  trick-shape move ordering): ~6 million positions per second of processor time.
- 6-player, first 150 logged hands: median 2.2 s, mean 6.4 s, 80% under 8.1 s, 95% under 29 s;
  8 of 150 over 30 s. With a 30 s budget about 95% get a review (the friend estimated 1 in 20 over 30 s).
- 8-player, all 31: 23 did not finish within ~50 s.
- Cross-checks: identical numbers from a plain alpha-beta with no table on the positions it could
  finish; no card ever got a negative cost.
- Bug found on the way (kept here as a warning for the builder): the trick in progress must not share
  storage with the trick searched below it; the first spike overwrote the outer trick's cards when it
  recursed into the next trick and gave wrong values even without a table.

## How it works

### Definitions

Let V(k) be the bidding team's total points for the whole hand when everyone plays perfectly from
position k on (k = number of cards played so far; points already taken count in). Positions run from
k = 0 (the deal, opening lead as recorded) to k = m (the last card logged).

- Best possible = V(0).
- Played out = V(m), shown only when the hand ended before trick 8 (stopped or conceded). For a hand
  played to the end V(m) is the actual result.
- Card k, played by seat s: cost = V(k) - V(k+1) if s is on the bidding team, V(k+1) - V(k) otherwise.
  Never negative (the mover could have kept V(k)). Forced and equivalent cards cost 0.
- Points given away by seat s = sum of the costs of s's cards, leaving out cards marked `auto`
  (played by the takeover bot for an absent human). Those costs are stored separately per seat
  (`autoGiven`) and count for nobody.
- Table average = mean of the six seats' points given away for that hand (bots included, `auto` cards out).
- Identity used in tests: V(m) = V(0) - (bidders' costs) + (defenders' costs), all cards included.
- Measured in points over the whole hand, not in "made / went down": a card that lowers the result from
  45 to 42 on a 40 bid costs 3, even though the bid is still made. (Points are what the step 6 formula
  uses: 0.5 rating per point.)

### Solver (`src/review.js`, new, no dependencies)

- Pure function `reviewHand({ players, dealt, contract, played }, { maxNodes })` returning
  `{ v: 1, best, playedOut, given: [per seat], nodes }` or `{ v: 1, none: 'budget' | 'players' }`.
  Takes the same fields `logHand` writes. Void hands are never queued.
- Positions are solved from the last (k = m) back to the deal (k = 0), sharing one table, each solve
  seeded with the previous value; later positions are small and fill the table for earlier ones.
- One work budget per hand, counted in positions searched (default 180 million ≈ 30 s here;
  `REVIEW_NODES` overrides). Deterministic: the same hand gets the same answer on a busy or idle machine.
- Card rules must match `engine.js` exactly (follow suit, trump, ties go to the first card played,
  points J3 9 2 A1 10 1). The tests check the solver's playout of recorded hands against the engine.

### Worker (`src/reviewWorker.js` or the same file under `isMainThread`)

- One `worker_threads` worker, started when the first hand needs a review and exited after ~60 s idle,
  so an idle server holds no table memory. One worker = at most one core, whatever the traffic.
- Jobs run one at a time in order. Queue capped at 6 (worst case a few minutes of backlog); a hand
  that does not fit gets "none". (Peak in the log: 57 hands in an hour, about one a minute.)
- Wall-clock guard 120 s per job: if a job hangs, terminate and restart the worker; the hand gets "none".
- `REVIEW=off` turns the whole feature off (nothing queued, no review lines shown). On a machine with a
  single core (`os.availableParallelism() < 2`) it is off unless `REVIEW=on`, so it never competes with
  the game loop for the only core. The old Render service (being retired) should get `REVIEW=off`.
- Speed numbers above are from the development laptop (16 threads); the production VM's speed is not
  recorded here. The budget is in search positions, so a slower machine takes longer for the same
  answer; check one real hand's time in the server log after the first deploy and lower
  `REVIEW_NODES` if needed.
- Memory: table 2^20 entries x 12 bytes = 12 MB (measured on the 27 slowest-but-finishing hands: no
  slower than 2^21, 198 s vs 222 s in total), plus the worker itself (~10 MB). `resourceLimits` on the
  worker as a backstop.

### Server (`src/server.js`)

- `broadcast()` already calls `logHand(room)` once per finished hand. After it, queue the review for
  6-player non-void hands that have at least one card played.
- `autoAct`: when it plays a card for a seat whose kind is `human`, mark that `played` entry
  `auto: true` (logged with the hand).
- `logHand` returns the new row's id: Supabase insert with `Prefer: return=representation` and
  `select=id`; local log uses the id it writes (`Date.now()`).
- When the review is done:
  1. Store it: Supabase `PATCH /hands?id=eq.<id>` with `{ review }`; local log appends a line
     `{ "review_of": <id>, "review": {...} }` that `recentHands` merges into its row.
  2. Keep it on the room (`room.review = { handNo, ...review }`) and send it in the `room` payload,
     personalised per socket: hand lines for everyone; `mine` (own points given away) and `avg` only
     for a seated socket. Re-send the room once when it arrives.
- `myHands`: add `review` to the select and send, per hand, best / playedOut / mine / avg for the
  requesting player's seat only (`h.me`). Other seats' numbers stay on the server.
- One-time database change, run by the user in the Supabase SQL editor **before** deploying (the
  replay query selects the column and would fail without it):
  `alter table hands add column review jsonb;`

### Client (`public/app.js`, `public/lang.js`, `public/style.css`)

Result box, below the tally (6-player hands):

```
Review, with all cards visible
  Best possible for Team A: 44 (bid 40)
  Played out: Team A would have finished with 47        <- only when the hand stopped early
  You gave away 3 points · table average 2.2
```

- While the review is running: "Reviewing the cards…"; it fills in place when the room update arrives
  (the box is only re-rendered on phase change today, so the review block updates itself).
- Arrives after the box closed or the next hand began: a toast to that player only,
  "Hand {n} review: you gave away {x} points · table average {y}" (spectators get none). The server
  sends it with a hand key (match + hand number) so the client knows which hand it belongs to.
- Out of budget / queue full: "No review for this hand". 8-player: "Review is not available on
  8-player tables yet". Void hands: no review block.
- Spectators: no "You gave away" line.
- Replay of the last 5 hands: the same block at the last step of each hand, with the player's own
  number; nothing for hands without a stored review.
- All new texts in English and Malayalam (`lang.js`).

## Builder's calls (marked as mine, the user can overrule)

- A one-word grade next to the number: "better than the table" (more than 0.5 below the average),
  "about the table average" (within 0.5), "more than the table" (more than 0.5 above).
- Team shown by its (editable) team name; "bid 40" after best possible to give the yardstick.
- Worker exits when idle rather than staying resident.
- Queue cap 6, wall-clock guard 120 s, table 12 MB, off by default on a single-core machine.
- Review not run for hands with no card played (conceded before the lead).

## Left to the builder

- Whether solver and worker share a file.
- Tests in `test/review.js`, added to `npm test`, kept fast (a few seconds): brute-force minimax vs
  solver on random small endings (last 2-3 tricks); the identity above and costs >= 0 on a few seeded
  bot-played deals (starting a few tricks in, to stay fast); playout of a recorded line matches the
  engine; budget exhaustion gives `none`. No data from `data/` (git-ignored) in tests.
- Socket test: the room payload carries the review to seated players with only their own number.
- A later script to back-fill reviews of old hands (not in this task).
- Project CLAUDE.md entry; README rules text if it mentions the result screen.

## Done when

- Review shows after hands on a local server (`node src/server.js`, port 3056), in the result box and
  in the replay, in English and Malayalam, on a phone width and a desktop width.
- `npm test` passes, including the new solver tests.
- This doc updated with what was built.

## Built (2026-11-21)

Plan: `docs/claude-plans/2026-11-20_post-hand-card-review-plan.md`.

- `src/review.js`: solver + `reviewHand`, `personal`, `values`. Same answers as the spike on every logged
  hand both finished (26 of the first 30 6-player hands; the other 3 + 1 ran past the budget).
- `src/reviewWorker.js`: `makeReviewQueue` (one worker, cap 6, guard 120 s, idle exit 60 s, logs
  `review <ms> ms <nodes> nodes` per hand) and `reviewEnabled`.
- `src/server.js`: `logHand` returns `{ row, id }` (Supabase insert now asks for the id back);
  `queueReview` after each logged hand; review stored by PATCH on `hands.review` / a `review_of` line in
  the local log; `room.review` sent per socket (`reviewFor`); `myHands` sends `review`; `autoAct` marks
  takeover cards `auto: true`.
- `public/app.js` / `lang.js` / `style.css`: review block in the result box (fills in when ready), toast
  for a review that arrives after the box closed, block at the last step of the replay; English + Malayalam.
- Tests: `test/review.js` (400 random endings vs plain minimax incl. no-trump, tie rule, identity and no
  negative cost on seeded deals, mid-trick concede, auto cards, budget / 8-player / empty, personal; worker:
  same answer, queue cap, guard restart, on/off) and `test/review_e2e.js` (6-player table through the real
  server: pending then review, own number only, watcher without one, stored line, takeover cards marked).
  Both in `npm test`.
- Browser check (headless Chrome, local server): result box at 1200 px (EN) and 390 px (ML), "Reviewing the
  cards…", "No review for this hand", the late toast, the 8-player line, the signed-in replay.

- Final review fix: the personal number goes only to the player who held the seat when the hand ended
  (`room.review.tokens`); someone who sits down later, or the next group at a permanent table, gets none.
- Known limits: a human who takes over a bot seat mid-hand is charged for the bot's earlier cards in it; the
  late toast can repeat after a page reload during the next hand.

### Deploy steps

1. In the Supabase SQL editor, **before** deploying: `alter table hands add column review jsonb;`
   (the replay query selects the column).
2. The old Render service (being retired): set `REVIEW=off`.
3. After the first deploy, read a few `review ... ms` lines in the server log. On this laptop the solver does
   ~6-11 million positions a second; if the VM is much slower, lower `REVIEW_NODES` so a review stays
   well under the 120 s guard.

### Later

- 8-player hands (faster solver needed). Back-fill reviews of older hands with a script. Step 6 (personal
  rating move) reads `hands.review.given` (`autoGiven` excluded).
