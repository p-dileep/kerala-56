# Coach note: how to write one (read by the daily scheduled Claude task)

Input: one facts file, `data/coach/<player id>.json`, made by `test/coach_facts.js`.
Output: `data/coach/<player id>.note.json` = `{ "hand_ids": [...], "note_en": "...", "note_ml": "..." }`, where
`hand_ids` = the `id` of every hand in the facts file.

## The game, briefly
56 (Ambathiyaaru): 6 players in two teams of 3 (8 players: 4 against 4). Seats alternate teams: even seats are
Team A, odd seats Team B. Cards rank J, 9, A, 10, K, Q (8 and 7 below at 8 players); points J 3, 9 2, A 1, 10 1,
56 in all. The auction names a trump suit (or NT) and a target of 28 to 56 points. Chips: a contract under 40 wins
1 chip or loses 2; 40 wins 2 / loses 3; 48 wins 3 / loses 4; 56 wins 4 / loses 5; doubled x2, redoubled x4.

## What the facts mean
- `myChips`: chips this player's team won (+) or paid (-) on the hand.
- `cards`: card play, worked out with all cards visible. `given` = points this player's own cards gave away against
  best play; `tableAvg` = the six players' average for that hand. Each entry in `cards.cards` is one costly card:
  `trick` (1-8), `card` (e.g. `9S1` = 9 of Spades, the last digit is only the copy), `cost` in points, `best` =
  cards that would have lost nothing (only for costs of 2+), `flipped` = that card alone turned the contract from
  made to down or the other way. `best: null` with `bestReason: "budget"` means the better card was not worked out:
  never say there was no better card. `cards.reason` instead means the hand was not reviewed (`players` = 8-player
  hand, `budget` = too long to solve).
- `calls`: each call this player made in the auction. `judged: true` calls were checked from what the player could
  see (their own 8 cards and the auction so far, the hidden cards dealt many ways): `ev` = expected chips of their
  call, `alt` = the best call they had and its `ev`, `loss` = how many expected chips the call gave up.
  `judged: false` calls (Plus, NS, double, redouble, calls in the raise window, or hands from older rules) are not
  assessed at all. `auto: true` calls were made by the bot for the player while they were away: never the player's.
- `allCards`: background only, with all cards visible: the most points this player's team could take with each
  trump. `null` = not worked out.
- `totals`: sums over the hands in the file.

## Rules for the note
1. Use only facts from the file. Never guess a card, a call or a number that is not in it.
2. Bidding: call something a bidding mistake only when it is a `judged` call with `loss >= 0.5`. Quote the call
   and the better one ("you passed; bidding 29 in Spades was worth about 1.4 chips more"). `allCards` may be
   mentioned only as background ("with all cards visible, your side could have made 40 in Spades"), never as blame.
3. Card play: say "with all cards visible" once. Quote trick, card and the better card from `best`. Compare the
   player's points given away with `tableAvg`, not with zero: nobody plays perfectly.
4. Shape, under 250 words, plain text, `- ` bullets, no HTML, no markdown headings:
   - "Going well": 1-2 bullets.
   - "Costliest habits": 2-3 bullets, each a pattern seen in more than one hand where possible, with the chips or
     points it cost and hand ids (`#1357`).
   - "Worst hands": the 3 hands where the player's OWN calls and cards cost most, one bullet each. Rank by the
     chips given up in judged calls with `loss >= 0.5` (summed per hand), then by `cards.given`; a hand with a
     `flipped` card counts as costlier than one without. Never pick a hand only because the team lost chips: a hand
     where the player's calls and cards cost nothing is not a worst hand. If fewer than 3 hands cost anything,
     list fewer.
   Section titles are plain lines ending with a colon.
5. Tone: a friendly coach talking to the player directly ("you"). No player names, no other players' mistakes.
6. `note_ml`: the same note in Malayalam, in the game's words: മേശ for chip, വിളി for bid/call, തുറുപ്പ് for trump,
   ചീട്ട് for card, പാസ് for pass, കൈ for trick. Keep hand ids, card names (9♠ style) and numbers as in English.
7. Card names in the text: rank and suit sign, e.g. `9♠`, `J♥`, `10♦`, `A♣`; drop the copy digit.
8. If the file has fewer than 20 hands, say how many hands the note covers.
