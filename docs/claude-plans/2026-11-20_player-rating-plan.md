# Player rating (plan step 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (native: the user said "build as per his plan").

**Goal:** Replace the 1500 / 16-per-chip Elo with the friend's plan step 5: start 1000, step 24 then 12, stake weight 1 / 2, bots and guests fixed at 1000.
**Architecture:** A pure `handDelta` in `src/accounts.js` holds the rule; `recordHand` and a one-off rebuild script both use it.
**Tech Stack:** Node 18, plain `assert` tests (`npm test`).
**Spec:** `docs/claude-plans/2026-11-20_player-rating-redesign.md`

## Global Constraints
- BASE 1000; step 24 while the player has fewer than 30 rated hands, then 12; weight 1 if contract value < 40, else 2; doubles add nothing.
- Won = `result.receiver === team`; void / no receiver = not rated. Bots and guests = 1000 in the averages.
- No leaderboard. No hosting details, keys or player names in tracked files.

## Review Focus
- A redoubled hand moves the rating no more than an undoubled one at the same value (test in Task 1).
- Hand 30 vs 31: the step drops exactly when 30 rated hands are done (test in Task 1).
- A conceded hand: receiver is the other side, so the conceding side loses (covered by receiver rule; test in Task 1).
- A missing `result.contract` (older callers): weight 1, no crash (test in Task 1).
- The rebuild never writes without `--write` (Task 2, dry run first).

---

### Task 1: The rule
**Files:** Modify `src/accounts.js`, `test/socket.js` (records block + `account.rating !== 1500` check -> 1000).
**Produces:** `handDelta(hands: number, own: number, opp: number, won: boolean, value: number) -> number`, exported with `BASE`.

- [ ] Tests: `handDelta(0,1000,1000,true,28) === 12`; `handDelta(0,1000,1000,true,40) === 24`; `handDelta(29,1000,1000,false,40) === -24`; `handDelta(30,1000,1000,true,28) === 6`; `handDelta(30,1000,1000,true,undefined) === 6`. recordHand: fresh player wins a 28 -> 1012; a 28 with amount 20 (redoubled) moves the same as amount 1; conceded hand (receiver = other team) lowers the rating; void changes nothing.
- [ ] Run `node test/socket.js`: fails.
- [ ] Implement; `recordHand` uses `handDelta(rec.hands, avg[t], avg[1-t], won, result.contract && result.contract.value)` before `rec.hands++`.
- [ ] `npm test` passes.

### Task 2: Rebuild existing ratings
**Files:** Create `test/rebuild_ratings.js` (loads `.env` like `test/fetch_hands.js`).
- [ ] Reads `data/hands.jsonl` (fresh pull first) in id order, replays every hand that has a seat with `pid` through `handDelta` (other seats 1000), prints `id name old new hands` per player. With `--write` it PATCHes `rating` only in Supabase `players`.
- [ ] Dry run, show the user, `--write` only after their yes.

### Task 3: Docs
- [ ] README rating line; `docs/claude-plans/2026-11-20_site-logins.md` SQL default 1500 -> note 1000 (the server always sets it); CLAUDE.md Recent entry.
