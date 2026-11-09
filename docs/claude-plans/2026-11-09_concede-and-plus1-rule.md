# Concede option + Plus 1 rule correction (design, 2026-11-09)

Status: implemented on the VM clone and pushed to main on 2026-11-09 (sections 1 and 2 as written, decisions below). Pending request is carried in the `room` payload (`concede: {team, by}`, filtered to that team) rather than separate events; a decline reaches the proposer as a toast.

## 1. Plus 1 rule correction (user, 2026-11-09)

Plus 1 on a Jack means a **singleton Jack**, with one exception: the **same player** already
called the first Jack in that suit (Jack-signal bid such as "30 Diamonds", or an earlier Plus that
claimed a Jack) and now holds the second Jack. A **partner's** Jack no longer counts (the
2026-11-06 rule allowed it).

Changes:
- `src/engine.js` `teamShowedJack(actions, suit, seat)` -> check `a.seat === seat` only
  (rename `selfShowedJack`). Both callers (partner-suit Plus line ~227, named-suit Plus line ~256)
  pick the change up. Comments lines 196-197.
- `src/bot.js` `inferFacts` line ~345: `lone` only skipped when **that seat** already has `J<suit>` in
  `must`; comment lines 326-327.
- `test/sim.js` ~229-237: the "after a partner's Jack signal, Plus 1 = the other Jack" case flips
  to "not offered"; keep the same-player case (214-224) and opponent case (238).
- Rules text: `public/index.html` line 52, `README.md` line 60: "unless you yourself already
  showed the first Jack in that suit".
- Same-player Plus 1 for the second Jack still lets the 9 stay hidden (Plus 2 remains offered).

## 2. Concede (user request)

"If one team feels they want to quit a hand": any seated human on a team presses **Concede**; the
other members of **that same team** see a pop-up; as soon as **one** of them agrees the hand ends,
the conceding team pays the chips the hand was worth, and play moves to the next hand.

### Rules (assumptions to confirm)
- Available during **playing** only (after the auction closed, before the last trick). Not during
  bidding (pass instead) and not on a void hand.
- Payment = exactly what the normal result would be if the conceding team lost this hand:
  - declaring team concedes -> `bidBaseTables(value).lose * mult`, same as going down;
  - defending team concedes -> `bidBaseTables(value).win * mult`, same as the contract being made.
  Chips flow through the existing settlement (payer / receiver, match-over check), so a concede can
  end the match.
- Needs agreement from a **second** member of the team (6p: 1 of the other 2; 8p: 1 of the other 3).
  If every other teammate is a bot or is disconnected, the single human's concede is enough.
  **Bot teammates auto-agree** (simplest; alternative: a bot agrees only when its own estimate says
  the hand is lost. Not proposed, bots rarely matter here because humans decide).
- Proposer can **withdraw**; any teammate can **decline**, which cancels the request (one decline
  is enough, same as one agree). Request also lapses if the hand ends naturally first.
- Opponents never see the pending request; they see only the final result with a "conceded" tag.
- Hand logging to Supabase unchanged, with `result.conceded: true` so the tuner can skip or weight
  those hands.

### Engine (`src/engine.js`)
- `concedeHand(state, teamIdx)`: requires `phase === 'playing'`; sets `made = (teamIdx !== c.team)`,
  calls the settlement part of `scoreHand` with that `made` (factor `settle(state, made)` out of
  `scoreHand`), adds `conceded: teamIdx` to `state.result`, log line
  `Team A concedes the hand - pays N chip(s).`
- `getView` unchanged (`result` already goes to clients).

### Server (`src/server.js`)
- `room.concede = null | { team, by: seat, agreed: Set<seat> }`.
- `socket.on('concede', { action: 'propose' | 'agree' | 'decline' | 'withdraw' })`:
  - propose: seated human, `phase === 'playing'`, no pending request -> create; if no other
    connected human teammate -> settle at once; else `sysChat` to the team and emit `concedeAsk`
    **to the teammates' sockets only** (`io.to(socketId)`), not to the room.
  - agree (teammate of the request's team): `E.concedeHand(g, team)`, `room.concede = null`,
    `broadcast(room)`, `sysChat("Team A conceded the hand")`, hand logs as usual via the existing
    handover path.
  - decline / withdraw: clear, `sysChat`, emit `concedeCancel` to the team.
- Clear `room.concede` in `schedule()` when the phase leaves `playing`, and on `nextHand` / `start`.
- `publicSeats` / `room` payload: add `concede: { team, by } | null` filtered to the receiving
  socket's team, so a reconnecting teammate still gets the pop-up.

### Client (`public/app.js`, `public/index.html`, `public/styles.css`)
- Button `#concedeBtn` ("Concede") in the player's own action area, visible only when seated,
  `game.phase === 'playing'`, and no request is pending for my team. Click -> confirm modal
  ("Concede this hand? Team A pays N chip(s)." with the amount from `bidBaseTables`, exported by the
  engine already) -> `socket.emit('concede', { action: 'propose' })`.
- Proposer sees a non-closable modal "Waiting for a teammate to agree" with **Withdraw**.
- Teammates get a modal (same `openModal`, `kind: 'concede'`): "<name> wants to concede this hand.
  Team A would pay N chip(s)." buttons **Agree** / **Decline**. Replaces nothing else on screen;
  cards stay visible underneath (modal is already body-level).
- Result modal and the centre `big` line: prefix "Conceded:" when `result.conceded != null`; the
  trophy `celebrate()` still fires for the receiver.
- History row (`g.history`) shows a "c" marker for conceded hands.

### Bots
- No bot ever proposes a concede. Bot teammates agree automatically (server side, no bot.js change).

### Tests
- `test/sim.js`: concede by declaring team pays `lose*mult`; by defenders pays `win*mult`; refused
  outside `playing`; match-over when chips run out; `result.conceded` set.
- Socket test (pattern from the team-picker test): propose -> teammate receives `concedeAsk`,
  opponents do not; agree -> `handover` with the right `tables`; decline -> `concedeCancel`.

### Decisions (user, 2026-11-09)
1. No concede during the auction. Playing phase only.
2. Bots never concede and take no part in the decision: only humans propose and agree. A human
   whose other teammates are all bots (or disconnected) concedes alone. (If the user meant bots must
   also refuse to agree to a human's request, the single-human rule still gives the same result.)
3. A concede is a loss for the conceding team: they pay the chips the bid is worth, as if the hand
   had gone against them (declarers: the "down" amount; defenders: the "made" amount), times the
   double multiplier, level bonus included.
