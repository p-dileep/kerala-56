# Daily coach notes: "what went wrong" in your last 20 hands (design, 2026-11-22)

## Intent
Each registered player gets a short written analysis of their last 20 hands on their account page: where their
bidding and their card play cost points, and the habits behind it. The why (user): players learn from their own
mistakes, and the work must not load the game server, which has to stay lightly loaded during the day (details in
docs/private/).

## Goals
- A note per registered player covering their last 20 logged hands: card-play mistakes (points given away against
  best play, with the exact trick and card) and bidding mistakes (the contract they bid or let go against what
  their side could make).
- Written by Claude as a short coaching note: what went well, the 2-3 costliest habits, the worst hands with the
  exact card or call. English and Malayalam.
- All analysis and writing on the owner's laptop. The VM only serves a stored note when its player opens it.

## Non-goals
- No leaderboard, no comparison with other named players, no team notes.
- No change to the live per-hand card review (user, 2026-11-22: leave it as it is for now).
- No note for 8-player hands' card play (the solver is too slow at 8 players); 8-player bidding facts may be
  included if the bidding review handles 8 players, otherwise those hands are listed as not reviewed.
- No rating change from the analysis (the personal rating move is a separate step of the friend's plan).

## Anti-goals (a failure even if it works)
- Any analysis work on the VM, or a VM restart/deploy needed to publish notes.
- One player's note readable by anyone else (the repo is public; notes never go into git).
- A note that names a mistake the engine did not find, or invents numbers: every claim must come from the facts
  file.

## Constraints
- Schedule: every day at 15:45 IST (user). Hands played after 15:45 appear in the next day's note.
- Runs while the laptop and the Claude app are open; a missed day is caught up on the next run.
- The scheduled task needs the user to allow `mcp__scheduled-tasks__create_scheduled_task` once.
- Store: a new Supabase table (not git, not the deploy). The VM reads one row by player id.
- Test seats (Tester, TEster, tester2, Tester 2) get no note. Only players with a new hand since their last note
  get a new note (keeps Claude usage down).
- "Last 20 games" = the player's last 20 logged hands, any table size.

## Approaches considered
1. Code writes a fixed list (free, deterministic) - not chosen.
2. Claude writes a coaching note from facts computed by code (chosen by the user): reads better, spots patterns;
   needs the app open and costs usage.
Where it runs: on the laptop with notes uploaded to Supabase (chosen) vs in the daily deploy (rejected: the repo is
public) vs on the VM (rejected: VM load).

## How it works (decided)
1. 15:45 scheduled Claude task on the laptop, in this repo:
   a. `node test/fetch_hands.js > data/hands.jsonl` (fresh pull).
   b. `node test/coach_facts.js`: for every registered player (Supabase `players`, test seats skipped) with a hand
      newer than their last note, take their last 20 hands and write `data/coach/<player id>.json` (git-ignored):
      per hand the deal, auction, contract, result, their seat; card review per card (`values()` from
      src/review.js: cost of each of their cards, best card instead); bidding review; table averages.
   c. Claude reads each facts file and writes the note (EN + ML) to `data/coach/<player id>.note.json`.
   d. `node test/coach_upload.js` upserts the notes into Supabase.
2. Account page: a "What went wrong" button next to "Replay my last 5 hands"; the server fetches the signed-in
   player's row by id on request (socket event, like `myHands`) and shows it with its date and the hand ids it
   covers. Signed-out players and players with no note see a line saying notes appear the day after play.

## Bidding review (new, laptop only)
With all cards visible: for the contract's trump and each other suit the bidding team could have named, the most
points the bidding team takes with perfect play (same first leader as the real hand). Gives "your side could make
N in Spades; you bid M in Hearts" and "the defence could have made more by bidding X". Uses the same solver as the
card review. Per hand this is about five solves; budget per solve as in the live review, "not reviewed" when out.

Whose mistake (user, 2026-11-22: only if they could see it): a call is the player's mistake only when their own
view supported a better one. For each call the player made, the laptop runs the bot's estimator (`src/bot.js`
Monte Carlo over the hidden cards, consistent with the auction so far) from that player's 8 cards and the auction
up to that call, and compares the expected chips of their call with the best alternative call they had. Only a gap
there is quoted as their bidding mistake. The all-cards-visible result is shown as background ("your side could
have made 40 in Spades"), never as blame. Passing counts as a call.

Bidding cost is measured in chips, not card points (my call, from the user's aim of playing for the most chips):
a side that bid 30 and made 38 when 40 in Spades was there missed a stake level, and the worst hands are ranked by
chips lost or missed.

## Which machine
"The laptop" is the owner's own machine holding a clone of this repo, not the game server (checked 2026-11-22: the
live server's checkout and service are not on it). The 15:45 run happens there, so the server is untouched.

## Supabase table (new)
`coach_notes`: player_id (int, primary key, references players.id), updated_at, hand_ids int[], note_en text,
note_ml text, facts_version int. RLS on; only the service key reads/writes (same as `players`). Run once in the
Supabase SQL editor:
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

## Left to the builder
- Exact facts-file shape and the Claude prompt (kept in the repo, no player names).
- How many worst hands to quote (suggest 3) and the note length (suggest under 250 words).
- Whether the facts step runs hands in parallel on the laptop (16 threads) - yes if simple.
