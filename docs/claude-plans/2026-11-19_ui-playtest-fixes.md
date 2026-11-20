# UI play-test fixes (animations, screens, flow) — 2026-11-19

## Current Task
Fix what a scripted play-test of the local server found: one scoring-display bug, one phone layout bug,
flow problems at the end of a hand, and a list of overlaps and wrapping on desktop and phones.

## Status (2026-11-19, implemented, uncommitted)
- Done: P1-1, P1-2, P2-1, P2-2, P2-3, P2-4 (Skip button, bottom centre), P2-5 (bid panel keeps its room through my
  auction, one panel height, top bar one row on desktop, Start / Next ignore taps in the first 0.5 s), P3-1 (bid panel
  docked right in landscape), P3-2, P3-3, P3-4 (call bubble above kunukku and chip pile, my kunukku beside my seat,
  "deals"/"opens" only in the auction / first lead, card count only in play, chips never wrap), P4 (trump/lead label
  moved to the middle of the mat while a trick is on it, modal buttons wrap as whole buttons, level buttons nowrap,
  "1 chip", themed dropdowns, lobby button heights).
- Also done (second pass): right-hand seats carry the chip pile on the right and the kunukku on the left (call
  bubble is on their left); `keepSeatsOnScreen` measures pile + kunukku on both sides; phone piles sit 22px out so
  their count clears the ★ / card count; before the first deal the empty hand row collapses (`#table.nogame`), 8p
  phone mat 420 -> 551px. Checked: no pile/bubble/badge overlap at 1280, 390, 360 (6p and 8p), page width = screen.
- Not done: P2-6 deal animation (user: skip); open decision 1 (kunukku follows the seat).
- Malayalam added: "Kunukku oori!" = കുണുക്ക് ഊരി!, "{0} takes off the kunukku." = {0} കുണുക്ക് ഊരി.,
  and the phone review line. Built from words already in lang.js; the user should check them.
- Verified: `npm test` (new shortfall test). Playwright: 6p 1280 (shortfall modal "pays 1 chip", log "pays 1 chip(s)",
  mat/log/chat quiet while the screens play, Skip shown, reload opens the box with no replay, removal caption + modal
  line); 8p phone emulation 390/360/844x390 (innerWidth stays 390 through a full match end and a full hand, kunukku
  right edge 386, landscape bid panel docked, pre-deal Bots + Deal clear of the seats).

## How it was tested
- Local server with hand logging off (`HAND_LOG=off`, Supabase vars empty), driven by Playwright MCP.
- 6-player at 1280x800 and 390x844; 8-player in real phone emulation (`isMobile`, `hasTouch`, Android UA)
  at 390x844, 360x780 and 844x390 landscape.
- Kunukku cases were forced with a scratch rig (not in the repo): a wrapper that patches `E.newMatch` /
  `E.nextHand` before requiring `src/server.js`, then calls `server.listen` (server.js only listens when it is
  the main module). Each deal pops an item from a JSON queue: `{ "tables": [1, 1], "strong": 0|1 }` sets the
  chip counts and gives one team every J, 9 and A (rebuild `state.hands` and `state.dealt`, sorted with `E.sortHand`).
- Desktop-at-390 is NOT enough for phones: the layout-viewport bug (P1-2) only shows with `isMobile: true`.

## Kunukku: logic verified, all correct
| Case | 6p | 8p phone |
|---|---|---|
| Team loses match -> "Kunukku kayari!", one flies to each seat | ok | ok (4 seats) |
| Wearing team bids and makes first hand of next match -> whole team off (smash) | ok | ok (4 seats) |
| Other team takes that first hand -> team-wide chance gone | ok | - |
| A wearer bids and makes -> only that seat sheds | ok | - |
| Wearing team wins the match -> rest off, losers get it | ok | - |

## P1 — wrong or cut-off information

### P1-1 Chip shortfall on the match-ending hand
- Seen: Team A on 1 chip loses a 2-chip contract. Two "−1" chips fly from a pile of 1, Team B's counter goes
  1 -> 0 -> 2, the modal says "Team A pays 2 chips", the log says "receives 2 chip(s)". Only 1 chip moved.
- Cause: `src/engine.js:541-548` moves `paid = min(amount, tables[payer])` but stores only `amount` in
  `state.result`; the log line (`:551-555`) uses `amount`. Client: `public/app.js:992` (`chipsText(r.amount)`),
  `:1017` (`chipsFly(..., r.amount, ...)`), and `chipsFly` (`:375`) rebuilds the "before" counts as `tables ± amount`.
- Fix: add `paid` to `state.result` (keep `amount` as the stake; hand logs and `test/par.js` use it as the nominal
  stake). Log text and client text/animation use `paid`. When `paid < amount`, say so: "Team A pays its last chip"
  / "pays 1 of 2 chips". Add Malayalam strings in `public/lang.js`.
- Test: `test/sim.js` case with tables [1, 12], bid team loses a 2-chip contract -> `result.paid === 1`, `tables` 0 / 13,
  log says 1.

### P1-2 Phone page grows wider than the screen after the kunukku lands
- Seen (8p, 390 phone emulation): `innerWidth` stays 390 through sweep, chips, Champions and kayari, then jumps to
  432 the moment the match-over modal opens and never shrinks. The modal's numbers and Close button are cut off on
  the right until a reload.
- Cause: when the flyers land, `#seats.kun-landed .seat .kunukku` runs `kunland` (`public/style.css:186-187`,
  `from { transform: scale(2.6) rotate(-28deg) }`). On right-hand seats the scaled kunukku pokes past the edge;
  phone Chrome widens the layout viewport to fit and keeps it. The 6p right seat (Ammini) is exposed too.
- Also: during play the width flickers 390 -> 392/393 once per trick (likely `.seat.won.collect` scale 1.12 or the
  trick sweep on a right seat): sideways wobble on a real phone.
- Fix: clip the table: `#table { overflow: clip; }` (or `.arena`), and keep `body { overflow: hidden }`. Make
  `kunland` grow toward the table (transform-origin on the inner side, smaller start scale on narrow screens).
  `keepSeatsOnScreen()` (`public/app.js:657`) measures the seat box only; include the hanging kunukku so right seats
  nudge in.
- Verify: phone emulation (isMobile true), play a forced match loss (rig), poll `innerWidth` every 200 ms through
  the whole end sequence and a few tricks: must stay 390. Repeat 6p and 8p.

## P2 — flow

### P2-1 The result shows before the animations
- The mat (`renderCenter`, `public/app.js:778-798`: "Team B wins" / "went down on 31" + Next hand), the rail log
  ("Team B wins the match!") and chat ("Team A wears the kunukku!", sent by the server at once) update immediately,
  while the sweep / chip flight / trophy / kayari still play on top.
- Fix: an `endSeq` flag set when `renderPhaseModal` (`:970`) starts the chain and cleared in `show()`. While set:
  the mat shows nothing (or the last trick), the rail log and chat render from the snapshot taken at hand end, new
  system chat lines are queued. On `show()`, render normally.

### P2-2 Kunukku removal has no caption
- Putting it on has a full screen ("Kunukku kayari! Team A wears the kunukku"); taking it off is only the smash,
  and neither the result modal nor the mat mentions it.
- Fix: in `kunukkuSmash` (`public/app.js:296`) add a short caption over the burst: whole team ("Team A takes off
  the kunukku!") or seats ("Kuttan takes off the kunukku"; names from `shedding`). Add one line to the result modal.
  Malayalam wording: ask the user (do not invent).

### P2-3 Refresh replays the whole end sequence
- Reloading during handover/matchover replays sweep, chips, trophy, kayari (~15 s). `lastPhaseKey` (`:971`) is in
  memory only.
- Fix: remember `${room.code}:${handNo}:${phase}` in `sessionStorage`; on a repeat, open the result modal directly
  (seats already show the kunukku state).

### P2-4 Match end is long, a tap skips only one overlay
- Sweep 3.2 s + chips ~2-3 s + Champions 6 s + smash ~2.5 s + kayari ~3.3 s = 15-18 s before the result box.
- Fix: a second tap (or a small "Skip" chip) finishes the rest of the chain at once (kunukku state still lands).

### P2-5 Table jumps between phases (desktop and phone)
- The arena is the `1fr` row of `#table` (`public/style.css:71-76`); the bid panel row takes height, so the oval
  squashes to about half when the bid panel opens, changes again for keep-or-raise, and the top bar wraps to two rows
  in play when the contract chip appears (team chips drop to a second line). Every seat moves each time.
- Fix: float the bid panel over the lower part of the arena on all sizes (the landscape rule at `:456-459` already
  does this), and keep the top bar on one row (contract chip shrinks/ellipsis; hide `.stake` below ~1400px).
- Related: in hand 1 a "Next hand" was sent without a press. Most likely a card tap landing on the button as the
  layout jumped. Also arm `#nextBtn` / `[data-next]` only ~600 ms after they appear.

### P2-6 No deal animation (optional, new feature)
- Cards just appear. A short deal (cards from the dealer to each seat, ~1 s, skipped on reconnect) would mark the
  start of a hand. Lowest priority.

## P3 — phone layout

### P3-1 Landscape: bid panel covers the lower half of the table
- 844x390: the fixed bid panel (`public/style.css:456-459`) hides your seat, both neighbours and the "to call" line.
- Fix: in landscape dock the panel to one side (grid column next to the arena, ~300px) or make it a compact strip
  (one row of suit buttons; "Bid higher" and levels behind a toggle) placed above the hand without covering seats.

### P3-2 8p portrait before the deal: seat boxes cover the mat text and the Bots dropdown
- The two middle open seats (with Sit here / Add bot) sit over "1 of 8 seated..." and `#botStyle`.
- Fix: on narrow screens shorten the pre-deal text, move Bots + Deal into one row lower on the mat, and/or make open
  seats compact (one "+" that opens Sit / Add bot).

### P3-3 Wrong pointer on phones
- `public/app.js:791` (and `public/lang.js:193`): "...and the log on the right..." — on phones the log, Last trick
  and Show the hands are behind the Chat button. Use a phone wording ("open Chat for Last trick and the hand log")
  when the rail is a drawer.

### P3-4 Overlaps on phones
- Top seat's kunukku covers its call bubble ("Spade ♠ 29" reads "Spade ♠ 2"). Give `.seat .said` a higher z-index
  than `.seat .kunukku`, or hang the top seat's kunukku on the left.
- Landscape: your own kunukku sits on your cards. Raise it / move it to the left of your seat.
- "opens" / "deals" tokens cover the card count and part of the name; "opens" stays on your seat during play
  (`public/app.js:632` keeps it until handover). Show "opens" only while bidding; move `.cnt` clear of `.toks`.
- 360px: team names become "Team..." and "12 chips" wraps to two lines (`.team-score .tname`, `:419`). Below ~380px
  show the number with a chip mark instead of the word.
- Portrait: 100-150px of empty space between your seat and the hand (pre-deal and in play); the mat could be taller.

## P4 — polish (desktop and phone)
- Trump/lead label on the mat (`.mat-info`, `public/style.css:125`, top 13%) is covered by the top seat's played
  card. Move it to ~4-5% like the phone rule (`:425`) and check it against `trickPos()` for 6p and 8p.
- Chip stacks overlap seat boxes and call bubbles (6p: Team B captain stack over the open seat box; Ammini's "Pass"
  under her stack). `.seat .stack` is always on the left (`:487`); mirror it for right-hand seats.
- Your kunukku overlaps the top edge of the bid panel (desktop).
- Result modal buttons wrap to 2-3 lines at 1280 and 390: `.modal-card .row` (`:319`) add `flex-wrap: wrap` and
  `white-space: nowrap` on its buttons.
- Keep-or-raise: "♣ 40" wraps, 48 and 56 do not (`#raiseBtns`, `public/app.js:935`): `white-space: nowrap`.
- "1 chips": `public/app.js:380` and `:560` use `T('{0} chips', n)`; use `chipsText(n)` (`:704`).
- Native white dropdowns on the dark theme: `#newPlayers` (lobby) and `#botStyle` (mat). Style `select`.
- Lobby on phones: "Join table" wraps to two lines (nowrap); the 8-player public button is taller than the 6-player
  one (equal heights).
- Mobile "Team A made 40 ♥": the suit sign wraps onto its own line (keep value + suit together with a no-break span).

## Decisions needed (user)
1. Kunukku follows the SEAT (`room.kunukku[i]`, cleared only in `resetFixed`, `src/server.js:100`): a player who
   takes over a seat inherits it, a player who moves seats leaves it behind. Keep, or tie it to the player
   (name/token) and clear it when the occupant changes?
2. Malayalam wording for the removal caption (P2-2) and the phone pointer (P3-3).
3. P2-6 deal animation: wanted or not.

## Order of work
1. P1-1 (engine + client + test), P1-2 (CSS clip + kunland + keepSeatsOnScreen) -> verify in phone emulation.
2. P2-1, P2-2, P2-3, P2-4 (end-of-hand chain in `app.js`), then P2-5 layout.
3. P3 phone items, then P4 polish. P2-6 last if wanted.
4. `npm test` after engine changes; headless check at 1280, 390 (isMobile), 360, 844x390, English and Malayalam.

## Verification checklist
- [ ] Match-ending hand with a shortfall: modal, log and chip flight all show the chips actually paid.
- [ ] `innerWidth` stays at the device width through a full match end (kayari) and through play, 6p and 8p.
- [ ] Nothing on the mat, log or chat gives the result away before the animation chain ends.
- [ ] Kunukku removal has a caption (team and single seat) and a line in the result modal.
- [ ] Refresh during handover/matchover opens the result box without replaying the chain.
- [ ] Bid panel open/close and play start do not resize the oval or move the seats.
- [ ] Landscape bidding: your seat, neighbours and "to call" stay visible.
- [ ] 8p portrait pre-deal: Bots dropdown and Deal button fully visible and tappable.
- [ ] No overlaps: kunukku vs call bubble / bid panel / cards; tokens vs card count; chip stacks vs seats.

## Notes
- Screenshots of the run are in the session scratchpad (not kept in the repo).
- Not covered by this test: void hand, concede, double/redouble, All 56 sweep screen, Malayalam layout, iPhone Safari.
