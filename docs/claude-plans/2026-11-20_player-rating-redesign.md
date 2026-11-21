# Player rating redesign (2026-11-20)

Source: a friend's "Game Review and Player Rating Plan" (2026-11-20), kept locally in
`docs/private/2026-11-20_friends-rating-plan.md` (git-ignored: it names real players). The user said:
stick to that plan. This round is the plan's build step 5 ("Rating, team move only").

## Intent
One rating per player (no fixed teams; a team ladder waits until players can pick named teams).
The rating is a plain Elo on hand results; the card-play ("personal") move comes later, after the
review engine exists.

## Rules (from the plan)
- Start at 1000.
- Unit: one hand. Won = the side that receives the chips (bidders made it, or defenders set it).
  Conceded hand = loss for the conceding side. Void hand = not rated (no chips moved).
- Expected result from each side's average rating (`1 / (1 + 10^((opp - own) / 400))`).
- Step: 24 for a player's first 30 rated hands, then 12.
- Stake weight: 1 for a contract value under 40, 2 for 40 and above. Doubles add no weight.
- Bots: fixed at 1000, never move. Hands against bots count at full weight.
- Only hands played on the site count.

## My calls (plan is silent)
- Guests (humans not signed in) count at 1000 in the averages and get no rating.
- 8-player tables are rated the same way (4 against 4).
- Existing ratings (3 players, 8 hands under the old 1500 / 16-per-chip rule) are rebuilt under the
  new rules from the hands logged with player ids. Writing them to Supabase `players` needs the
  user's go-ahead first.

## Not in this round
- Leaderboard (user, 2026-11-20: not now). The plan's leaderboard rules for later: public, shown
  after 20 hands, "provisional" until 100.
- Per-bot-style fixed ratings (plan's rules table); all bots are 1000 for now (plan step 5).
- Review engine, full auction + card replay, fixed-length sessions, personal move, bidding score,
  stake hints on bid buttons, bots that double: separate projects, in the plan's order.

## Approaches considered
1. Results-only rating now, personal move later (chosen: the plan's step 5; needs no review engine).
2. Review engine first, rating with both moves at once (later start, solver load on the VM, no
   human-partner data to tune the personal move).
3. Results rating plus "points given away" as a separate number (drops the plan's single rating).

## What changes
- `src/accounts.js`: BASE 1000, step 24/12 by the player's rated hands, weight from
  `result.contract.value`, guests/bots 1000. Stats fields unchanged.
- `test/socket.js`: Elo tests rewritten for the new numbers.
- README rating line.
- One-off script to rebuild the ratings from the hand log (dry run first).
