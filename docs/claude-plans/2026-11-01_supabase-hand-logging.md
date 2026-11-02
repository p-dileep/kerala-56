# Supabase hand logging for kerala-56 (training data for the bots)

Decision (2026-11-01): log every finished hand from the Render server to a free Supabase project.
The game stays on Render; the dhiedge.com VM is not involved (no Cloudflare Access bypass, no shared
process with the trading backend). Data is later pulled down to extend `test/tune.js`.

Code changes below go into the local clone of https://github.com/p-dileep/kerala-56 and ship via push
to `main` (Render auto-deploys). Do not edit on the VM.

## 1. Supabase: create project + table

Dashboard -> New project (free). Then SQL editor:

```sql
create table public.hands (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  room          text not null,            -- TABLE6 / TABLE8 / private code
  players       smallint not null,        -- 6 or 8
  hand_no       smallint not null,
  dealer        smallint not null,
  bot_style     text not null,            -- mixed / medium / aggressive / defensive
  seats         jsonb not null,           -- [{kind:'human'|'bot', name}]
  dealt         jsonb not null,           -- [[cardId,...] per seat] as dealt
  auction       jsonb not null,           -- bidding.actions
  contract      jsonb,                    -- null if all passed
  played        jsonb not null,           -- [{seat, card:{id,rank,suit}, trick}]
  result        jsonb,                    -- {made, points, amount, payer, receiver}
  tables_after  jsonb not null,           -- chips [teamA, teamB] after the hand
  game_version  text                      -- git sha / package version
);

create index hands_created_at on public.hands (created_at);

-- Lock the table down: no anon/authenticated access. The server uses the service role key, which bypasses RLS.
alter table public.hands enable row level security;
```

Settings -> API: copy `Project URL` and the `service_role` key (never the anon key, never into the browser bundle).

## 2. Render: environment variables

| Var | Value |
|---|---|
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_KEY` | service_role key |
| `GAME_VERSION` | optional, e.g. the commit sha (Render exposes `RENDER_GIT_COMMIT` automatically; the snippet falls back to it) |

If the vars are missing the server runs exactly as before (logging is a no-op).

## 3. `src/server.js` changes

Add near the other env constants:

```js
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const GAME_VERSION = process.env.GAME_VERSION || process.env.RENDER_GIT_COMMIT || null;
```

Add this function (anywhere above `broadcast`):

```js
// Fire-and-forget: one row per finished hand. Never blocks or throws into the game loop.
function logHand(room) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  const g = room.game;
  const row = {
    room: room.code,
    players: room.players,
    hand_no: g.handNo,
    dealer: g.dealer,
    bot_style: room.botStyle,
    seats: room.seats.map((s) => ({ kind: s.kind, name: s.name })),
    dealt: g.dealt.map((h) => h.map((c) => c.id)),
    auction: g.bidding.actions,
    contract: g.contract,
    played: g.played,
    result: g.result,
    tables_after: g.tables,
    game_version: GAME_VERSION
  };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  fetch(`${SUPABASE_URL}/rest/v1/hands`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(row),
    signal: ctrl.signal
  }).then((r) => { if (!r.ok) console.error('hand log failed', r.status); })
    .catch((err) => console.error('hand log error', err.message))
    .finally(() => clearTimeout(t));
}
```

Hook it into `broadcast(room)` right after `room.version++;`:

```js
  const g = room.game;
  if (g && (g.phase === 'handover' || g.phase === 'matchover') && room.loggedHand !== g.handNo) {
    room.loggedHand = g.handNo;
    logHand(room);
  }
```

In `startMatch(room)` add `room.loggedHand = 0;` next to `room.game = E.newMatch(...)`, and add
`loggedHand: 0` to the object in `createRoom`. (`resetChips` can move matchover -> handover with the same
handNo; the guard means that does not double-log.)

Notes
- `g.dealt` only exists once a hand has started; `handover`/`matchover` guarantee it.
- An all-pass hand (if the engine ever produces one) has `contract: null`; the row still records the deal.
- Render's free instance sleeps; the hand finishing is always driven by a connected client so the POST
  happens while the process is awake.

## 4. Pull the data for the tuner: `test/fetch_hands.js`

```js
'use strict';
// node test/fetch_hands.js > data/hands.jsonl    (needs SUPABASE_URL + SUPABASE_SERVICE_KEY in env)
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
async function main() {
  let from = 0; const page = 1000;
  for (;;) {
    const r = await fetch(`${url}/rest/v1/hands?select=*&order=id.asc`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + page - 1}` }
    });
    const rows = await r.json();
    for (const row of rows) process.stdout.write(JSON.stringify(row) + '\n');
    if (rows.length < page) break;
    from += page;
  }
}
main();
```

## 5. Using the hands (next phase, after a few hundred human hands exist)

1. `test/tune.js`: add a mode that replays logged `dealt` arrays instead of random deals (needs a small
   engine helper to start a hand from a given deal: set `state.hands`/`state.dealt` after `startHand`).
2. Bidding imitation: for each human action in `auction`, rebuild the bot view at that point and compare
   `Bot.chooseBid` with the human call. Tune `DEFAULT_PARAMS` for agreement with winning players.
3. Estimate calibration: regress `estimateFor(hand, suit)` against points actually made by that team.

## Free-tier caveats
- Project pauses after 7 days without API activity; inserts then fail until resumed in the dashboard.
  Weekly games are enough; otherwise a weekly cron `select` keeps it awake.
- 500 MB storage: ~3 KB per hand, not a concern.
