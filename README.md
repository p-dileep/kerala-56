# 56 (Ambathiyaaru): a Kerala card table

A real-time web version of 56 for 6 players (3 vs 3, 8 cards each) or 8 players (4 vs 4, 6 cards each). A host starts a table and shares the 5-letter code
or link. Friends join from phone or desktop, and bots fill any empty seats. The server enforces every rule.

## Play online
The game is hosted on Render at **https://kerala-56.onrender.com** (free plan: it sleeps after 15 idle minutes, so the first visit can take about a minute to wake). Open the link, type your name (required) and walk into the permanent **6-player table** or **8-player table**; everyone who opens the link sees the same two tables. The first person seated is the host (deals, picks bot style); when they leave the next player becomes host. In the lobby each table shows a LIVE badge with the number seated; an empty table still holding an old game shows a "Reset table" button, and it also resets itself after a few hours empty. You can still **Start a new table** (6 or 8 players) for a private game and share its code. Source: https://github.com/p-dileep/kerala-56. Every push to `main` redeploys automatically; a redeploy ends tables in progress.

## Run locally
```bash
npm install
npm start            # http://localhost:3056
npm test             # rules sim (200 bot matches) + socket end-to-end test
```

Or on Windows just double-click `start_game.bat`: it installs Node.js (via winget) if missing, runs `npm install` on first use, starts the server and opens the browser.

To play with friends over the internet without any hosting, double-click `start_online.bat` instead. It does everything `start_game.bat` does, downloads the portable `cloudflared.exe` into `tools/` on first use (no Cloudflare account needed), opens a quick tunnel, prints and copies the public `https://....trycloudflare.com` address, and opens the browser there. Create the table at that address and click the table code to copy the invite link. The address changes every time the tunnel is restarted.

## Variants
`players` in the table settings is 6 or 8. Both use the same 48-card pack, so 8 players get 6 cards and play 6 tricks; bids, levels and chips are unchanged. Bots scale their hand estimates to the hand size.

## Deploy on Render (how the public link is set up)
New Web Service from the GitHub repo, language Docker (the `Dockerfile` is used, no build or start command needed), branch `main`, Free instance. Render sets `PORT` itself.

## Deploy on a VPS
```bash
# on the server (Node 18+)
git clone <your repo> kerala-56 && cd kerala-56
npm ci --omit=dev
npm i -g pm2 && pm2 start deploy/ecosystem.config.js && pm2 save && pm2 startup
sudo cp deploy/nginx.conf /etc/nginx/sites-available/56   # edit the domain
sudo ln -s /etc/nginx/sites-available/56 /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d 56.example.com
```
Or with Docker: `docker build -t kerala-56 . && docker run -d --restart=always -p 3056:3056 kerala-56`

Run a **single** process. Rooms are held in memory. A restart ends the tables in progress, but players can open a new one immediately.

### Environment variables
| Var | Default | Meaning |
|---|---|---|
| `PORT` | 3056 | HTTP port |
| `BOT_DELAY_MS` | 900 | Bot thinking time |
| `BOT_BID_DELAY_MS` | 1900 | Bot thinking time during bidding (calls are shown a second slower than card plays) |
| `TRICK_PAUSE_MS` | 2200 | How long a finished trick stays on the mat |
| `AWAY_TAKEOVER_MS` | 20000 | A bot plays for a disconnected player after this long |

## Rules implemented (`src/engine.js`)
- 48 cards (J 9 A 10 K Q ×2 packs). Points: J 3, 9 2, A 1, 10 1 = 56. Teams sit alternately.
- Deal and play go round from the dealer's right, and the deal rotates each hand.
- Bids are 28–56 with a suit or NT. The opener must bid at least 28. You cannot name a suit you are void in.
  Raising **your own** standing bid must jump to the next level (40/48/56).
- Jack signal: a bid is shown as "30 ♥" when the caller holds the Jack of that suit and "♥ 30" when they do not. The engine derives this from the hand.
- Seats can change at any time, even mid-hand: anyone can take a bot's seat ("Take seat" / "Move here"), and any seated player can remove another player (before the deal) or replace them with a bot (during a hand), for example a stale session of your own. A player who leaves is replaced by a bot.
- After a hand, "Show the initial hands" (in the result window, the table centre, or the top bar) reveals every player's cards as dealt. Hands stay private until then.
- The host can reset both teams to 12 chips at any time ("Reset chips" in the top bar).
- After a hand the table waits: the host clicks "Next hand" (in the result window or the centre of the table) when everyone has reviewed the result.
- A hand stops as soon as the result is decided: the bidding team reaches the target, or the points still unplayed cannot get them there. The remaining cards are not played.
- Plus convention: the opener may open with "Plus N" in a suit (= 28+N in that suit, fresh-ladder meaning); otherwise only a partner of the high bidder may say "Plus N", raising by N in the same suit. Meanings are relative to the power ladder J J 9 9 A A 10 10 K K Q Q minus cards already shown by earlier calls in that suit (a Jack-signal call shows one Jack; each Plus shows what it claimed). Plus 1 = the top remaining card of the ladder; while that is a Jack it must be the only card held in the suit. Plus may also be said over an opponent's bid, in the last suit a partner called (Plus N = current bid + N in that suit). Plus 2 = the top two remaining cards (fresh: both Jacks; after a Plus 1: the other Jack and a Nine; after all Jacks and Nines: both Aces). Plus 3 = the top three remaining cards (fresh: both Jacks and a Nine). The engine offers each only when the hand qualifies; `legalBidActions().plusMeaning` gives the current meaning.
- Bot styles: the host picks Mixed / Defensive / Medium / Aggressive before dealing (and between matches). Mixed (default) gives each named bot its own temperament (`BOT_PERSONALITY` in `src/bot.js`: Kuttan, Chinnu and Appu are aggressive; Ammini, Kunjamma and Mathai defensive; the rest medium). Presets live in `STYLES`; Aggressive bids up and goes for levels on thinner evidence, Defensive wants near-certainty.
- Team bidding: before a level bid (40 / 48 / 56) or a contested bid at 36+, a bot lays the unseen cards out a couple of dozen times consistent with everything the auction revealed (Jacks shown by the "30 Hearts" form, cards claimed by Plus, voids from NS), plays each layout through with its own play logic, and bids only the level its team reaches in most layouts (`simDeals`, `simConf`, `simMargin`). Holding one suit against a cheap opponent bid, a two-suited bot probes by naming its second suit; a partner answers by going back to the first suit, calling no-trump, or passing to keep the second. Self-play: this makes 40+ contracts about 75% of the time instead of 50%, worth about half a chip per match over the previous bot.
- Bot bidding: a bot holding the Jack of its partner's suit shows it by raising one step (the "30 Hearts" form). When partner's bid plus the bot's extra strength reaches 40, 48 or 56 (`levelMargin`), it bids that level directly, since levels pay more chips.
- Bot bidding: when its partner, holding the bid, has switched from an earlier suit to a second one (a probe for information), the bot answers once: it goes back to the first suit when it can support it, or calls no-trump when strong all round, so a weak probe suit is not left as the contract.
- NS convention: "value NS" is a no-trump bid that says you hold no cards of a called suit. One step above the current bid points at the most recently called suit, two steps at the suit called before that, and so on. Offered only when you are actually void in that suit; it plays as NT if it wins the auction.
- Opponents may double, then the bidders may redouble. A redouble ends the auction, and so do 5 passes after the last bid or double.
- Trump is the suit named in the winning bid and is open to everyone. Follow suit if able; trumping is optional.
  Identical cards: the first one played wins.
- Chips (tables / kuttu): each team starts with 12. Bids of 28–39 win 1 or lose 2, 40–47 win 2 or lose 3, 48–55 win 3 or lose 4, 56 wins 4 or loses 5.
  Doubling ×2, redoubling ×4. A team that runs out of chips loses.

House-rule knobs are in `DEFAULT_SETTINGS` (`startingTables`, `redoubleMultiplier`, `selfRaiseNextLevel`).

## Layout
```
src/engine.js   pure rules engine (no I/O), with masked per-seat views
src/bot.js      heuristic bot (uses only public info + own hand); tracks voids and remaining trumps; numbers tuned by self-play
src/server.js   Express + Socket.IO rooms, reconnects, bot scheduling
public/         vanilla HTML/CSS/JS client (no build step)
test/           simulation + socket e2e tests; tune.js = self-play parameter tuner (node test/tune.js [rounds] [matches])
```

Players are identified by a random token in localStorage, so refreshing the page or switching networks puts you back in your seat.

## Not yet included
Thani (playing alone), Kodi/Cot bonuses, the 4- and 8-player versions,
accounts and persistent stats, and a turn timer for connected players.
