# Site logins for play56.in (design, 2026-11-20)

## Decided (user, 2026-11-20) — supersedes sections 3-4 where they differ
Logins are not meant to be strict: they exist so players keep a game record (rating, games played, games won).
- **Sign-in = player name + PIN (4-8 digits)**, no Google, no email, no Supabase Auth. Type both on any device.
  A forgotten PIN is reset by the owner in the Supabase table editor (clear the row, or set a new hash).
- **Guest play stays** (login optional); **anyone can host**; **names are held by accounts** (a guest cannot sit
  under a registered name; bot names, "Guest" and "Player N" cannot be registered).
- **Records built now**: hands played / won (your team took the chips), contracts bid / made, matches played / won
  (seated when the match ended), and an Elo rating. Elo is per hand, not per match: only 15 of 920 logged hands
  ended a match, so a per-match rating would hardly move. K = 16, team rating = average of its seats, guests and
  bots count as a fixed 1500. Void hands count for nothing. Shown on a card in the lobby.
- Storage: one Supabase table `players` (SQL below), RLS on with no policies, written only by the server's service key.
  Without Supabase (local server) the accounts live in git-ignored `data/local_players.json`.
- Session: after sign-in the browser keeps a signed token (`id.hmac`, key = `LOGIN_SECRET`, else derived from the
  service key); changing the PIN hash invalidates it. 5 wrong PINs lock that name for 15 minutes.
- Hand log: `seats[]` gets `pid` (players.id) for signed-in humans.
- **Replays (user, same day): last 5 hands**, not matches (a match can run dozens of hands). "Replay my last 5
  hands" on the record card -> socket `myHands` -> server reads the player's 5 newest rows from `hands`
  (`seats=cs.[{"pid":N}]`, or the local hand log file) and sends them without any player ids -> the viewer steps
  from the deal through every call and every card (remaining hands of all seats, the current trick, result at the
  end). Only hands logged after this change carry `pid`, so replays start empty. If the `hands` table grows large:
  `create index on hands using gin (seats jsonb_path_ops);`

### Two servers on one table (2026-11-20)
play56.in and the Render copy share the Supabase `players` table; each server keeps only a cache. A name the
cache lacks is looked up at sign-in (and after a 409 on register), a signed-in player's record is re-read on every
reconnect (`refresh`, server `hello`), and the list of registered names is re-read every 5 minutes for the guest
name check. Left open: one player playing on both sites at the same moment can still overwrite one site's update.

### Built (2026-11-20)
- `src/accounts.js` (new): store (Supabase / file / memory), scrypt PIN, signed session, PIN lock, `recordHand` (Elo).
- `src/server.js`: `hello {login}`, `register`, `login`, `logout`, `myHands`; seats carry `pid`, `publicSeats.verified`;
  guests cannot use a registered name (`nameFor`); records updated where the hand is logged.
- `public/app.js`, `index.html`, `style.css`, `lang.js`: a "Sign in" / "✓ name · rating" chip at the top of the lobby
  (above the language button) opens a separate account page (`#account`, browser Back returns to the lobby): sign-in
  form for guests, record tiles + replays + sign out when signed in; tick at the seat,
  replay list and viewer; Malayalam for every new string.
- `test/socket.js`: records unit test, sign-in / held name / second device / forged session, a registered player's
  record and replays in a real 3-hand game.
- **Before it works on play56.in**: run the `players` SQL above in the Supabase SQL editor. Until then the server
  logs "accounts unavailable" and the sign-in dialog answers "Sign-in is not available right now"; guests unaffected.
  Optional: set `LOGIN_SECRET` (any long random string) on the server; without it the key is derived from the
  service key.

```sql
create table public.players (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  name        text not null,
  name_key    text not null unique,      -- lower-case name, used for "held name" checks
  pin_hash    text not null,             -- scrypt
  rating      real not null default 1000,  -- was 1500 before 2026-11-20; the server always sets it on register
  hands       int not null default 0,
  hands_won   int not null default 0,
  bids        int not null default 0,
  bids_made   int not null default 0,
  matches     int not null default 0,
  matches_won int not null default 0,
  last_seen   timestamptz
);
alter table public.players enable row level security;
```

---
Original design (before the choices) follows.

## 1. Today

- Identity = a random token the server hands out on `hello` and the browser keeps in `localStorage` (`g56token`).
  The seat, the host role, reconnects and kicks all key on that token (`seatOfToken`, `room.hostToken`).
- The name is free text from the lobby field (`g56name`), sent with `createRoom` / `joinRoom` / `sit`. Anyone can type
  any name, so "Dileep" at one table and "Dileep" at another may be two different people.
- A new phone, a cleared browser or a private window is a new person: the seat cannot be reclaimed from another device.
- The hand log (`hands.seats`) stores `{kind, name}` only, so per-player stats rest on names, which are not unique.

## 2. What a login gives

1. **Stable identity across devices**: the seat follows the account, so a player who drops on the phone can sit back
   down from the laptop (same account = same seat), and a cleared browser no longer loses the seat.
2. **Names that cannot be impersonated**: a signed-in player's name is held by the account. Their name shows a small
   tick at the table and in chat; a guest cannot sit under a name an account holds.
3. **A base for stats**: each logged hand records the account id of every signed-in seat, so later we can show games,
   contracts made, chips won per player, and the bot tuner can tell individual humans apart (today it guesses by name;
   "Tester" / "TEster" are filtered by hand).

## 3. Options

### A. Supabase Auth (recommended)
The project already has a free Supabase project for `hands`. Supabase Auth adds users to it at no cost
(50k monthly active users on the free tier).

- **Google sign-in**: one tap for most players (Android phones are already signed in to Google). Setup the user does once:
  a Google Cloud OAuth client (consent screen name "play56"), paste its id/secret into Supabase > Authentication >
  Providers > Google, add `https://play56.in` and `http://localhost:3056` to Supabase's redirect URLs.
  Caveat: on the free plan Google's consent screen names the Supabase project address, not play56.in (a custom auth
  domain is a paid add-on).
- **Email code** (6-digit code typed into the page, no password): for players without Google. Caveat: Supabase's
  built-in mailer only sends to the project's own team members and a few per hour, so real players need a custom SMTP
  sender (e.g. a free Resend or Brevo account and a DNS record on play56.in). The email template must show
  `{{ .Token }}` so the mail carries a code rather than only a link (a code also works inside the installed app
  where a link would open a different browser).
- Browser side needs **no new package**: Supabase Auth is plain HTTPS (`/auth/v1/authorize` with PKCE for Google,
  `/auth/v1/otp` + `/auth/v1/verify` for email codes, `/auth/v1/token?grant_type=refresh_token` to refresh).
  About 60 lines in a new `public/auth.js`. The Supabase project URL and the anon (publishable) key reach the browser
  from server environment variables via a small `/config.js` route, so nothing is written into the public repo.

### B. Our own login (Google Identity Services + our own email sender)
Same user experience, but we would verify Google ID tokens, send mail and store sessions ourselves. More code and more
secrets on the VM for no gain while Supabase is already there. Not recommended.

### C. Login required vs optional
- **Optional (recommended)**: guest play stays exactly as today; "Sign in" sits next to the name field. Families
  and first-time players are not turned away by a sign-in step, and bots need nothing.
- **Required**: every human must sign in. Clean stats, but it blocks quick "send the link to Amma" games and a
  Google outage or mail delay locks people out.
- Middle ground: required only to *host* a private table (guests can still join any table and play the public ones).

## 4. How the server checks a login on the socket

1. Browser holds the Supabase session (access token, 1 hour, plus refresh token) in `localStorage`; it refreshes
   before expiry and on page load.
2. `hello` gains `{ token, auth: <access token> }`. The server asks Supabase who it is
   (`GET /auth/v1/user` with the service key as `apikey`, 5 s timeout). On success: `socket.data.uid = user.id`,
   `socket.data.token = 'u:' + user.id` (so the seat, host role and reconnect follow the account on any device),
   and the account's name is loaded. On failure (expired, revoked, Supabase down) the socket simply stays a guest
   with its random token and the browser is told `authState: guest` so it can refresh or show "Sign in" again.
   The game never waits on Supabase beyond that one call at connect.
3. A socket stays signed in until it disconnects; a reconnect sends a fresh token. No per-event checks.
4. Names: a new table `players (id uuid primary key = auth user id, name text, name_key text unique, created_at)`,
   RLS on with no policies (only the server's service key touches it, like `hands`). On first sign-in the account
   takes the name in the lobby field (or its Google first name) if no other account holds it; it can be changed
   from the lobby. The server keeps the set of held `name_key`s in memory (loaded at start, tiny) so a guest joining
   as a held name gets "That name belongs to a signed-in player" without a network call.
5. Seats carry `uid` (null for guests and bots); `publicSeats` sends `verified: true` for the tick, never the uid.

## 5. What stays the same for guests and bots

- Guests: random token, any free name, every table, every button (unless the user picks "login to host").
- Bots: untouched (no token, no uid); kick / take-over / away-takeover work on seats as today.
- A guest who signs in mid-table keeps the seat: on `hello` with a login the server moves the seat from the old guest
  token to the account (`seat.token` swap) when the same socket held it.

## 6. Hand log

- `hands.seats` rows become `{kind, name, uid}`; `uid` is the Supabase user id for signed-in humans, `null` otherwise.
  `seats` is `jsonb`, so no table change. Old rows simply lack `uid`.
- `test/fetch_hands.js` and `test/imitate.js` keep working (they read `kind` and `name`); `imitate.js` can later
  group by `uid` instead of skipping test names.
- No email or Google profile data goes into `hands`; the uid links to `players` for the name, inside Supabase only.

## 7. Choices for the user

1. Providers: Google only / Google + email code / email code only.
2. Guest play: stays (login optional) / login required.
3. Hosting a private table: anyone / signed-in only.
4. Names: held by accounts (guests cannot use them) / tick only (guests may still type the same name).

After the choices: build in `src/server.js`, `public/auth.js` (new), `public/app.js`, `public/index.html`,
`public/lang.js` (Malayalam strings), `test/socket.js` (verifier stubbed, no network), README env table
(`SUPABASE_ANON_KEY`). Supabase dashboard steps (providers, redirect URLs, `players` table SQL, SMTP if email) are
the user's; they go in `docs/private/` if they name addresses.

## 8. Testing plan

- `npm test`: socket test with a stub verifier (a signed-in socket gets the account seat on a second "device",
  a guest cannot take a held name, guests play as before, hand log rows carry `uid`).
- Local end to end on http://localhost:3056 against the real Supabase project once the provider is configured:
  sign in, sit, reload on another browser profile with the same account and get the same seat.
