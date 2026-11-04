# Why bot-declared contracts fail (2026-11-04)

Data: 120 hands, 71 bot-declared, 49 human-declared.
Method: each hand replayed (auction + every card). Replay check: the current bot reproduces 2503/2503 of the logged bot cards; bot play has no randomness.
Counterfactuals:
- **All-bot:** the same deal and contract, bots play every seat from trick 1.
- **Per human card:** bots finish the hand after the human's card and after the bot's card. The point difference is the "swing".

Scripts (scratch): `play_analysis.js`, `contracts.js`.

## 1. Human defenders are not the reason

| Group | n | made live | made all-bot |
|---|---|---|---|
| bot declarer, humans only defending | 40 | 58% | 58% |
| bot declarer, humans only on its side | 31 | 55% | 65% |
| human declarer | 49 | 78% | 78% |

- Human defenders differ from the bot on 38% of cards. The net swing is -43 points (slightly worse than the bot), mostly from leads.
- Human partners of bot declarers cost -81 points, -64 of it on leads. That turns 5 contracts that all-bot play makes into losses (hands 66, 72, 83, 88, 118).
- Of the 31 bot contracts lost live, all-bot play also loses 23, falling short by 5 points on average. Those contracts were not makeable by bots.

## 2. The losing contracts come from bot bidding
- 21 of those 23 were won by outbidding another bot by one step (33->34, 34->35, ...). Most are contested one-step bids or a raise of the partner's own suit.
- Bot contracts won with a Plus call: 7/16 made. Example: hand 90, Ammini with an estimate of 23 wins 35 S on Plus 1.
- Bot contracts that raised the partner's suit: 11/20 made. Average value 38.4 against a team estimate of 35.4.
- Bots making 69% in bot-only self-play means little: there contracts mostly stay at 28-32. Live auctions run higher.

## 3. Do bots read team-mates' and opponents' bids? Mostly no.
- **Contesting an opponent** (`chooseBid`, bot.js:205): `best.est >= minBid + bidContestMargin`. `est` is `estimateFor` on the bot's own 8 cards only. It gives no credit for a partner's bids or Plus calls, no discount for opponents' Jacks or Plus in that suit, and no reading of a partner's pass.
- **Partner holds the bid** (bot.js:141): `teamEst = partner's bid value + (my support - estBase)`. This treats the partner's last bid as their full hand estimate, but a competitive minimum bid, a show-Jack step or a Plus is not strength. A chain of raises counts the same strength twice.
- **Monte Carlo** (`simPoints` + `inferFacts`, bot.js:235-327): the one place that uses everyone's calls (shown Jacks, Plus cards, NS voids). It runs only for 40/48/56 level jumps, contested bids at 36 or more, and the self-raise. Most live contracts are at 33-35, where it never runs. `inferFacts` keeps hard facts only (suit length, passes and opponent suit calls are ignored).
- **Plus 1 is unconditional** (bot.js:119 partner holds; bot.js:166 opponents hold): no strength check up to `plusMaxValue` (40). It raises the contract, and the bot becomes declarer when everyone passes.

## Possible fixes (not done; develop locally)
1. Run the Monte Carlo check on every contested bid from about 32 (not 36). It already uses the auction facts.
2. Team-aware estimate for own bids: add credit for a partner's shown Jack, Plus cards and repeated calls in a suit; subtract opponents' shown cards in our trump; read a partner's pass as weak.
3. Plus 1 only when the bot could stand the resulting contract (support >= value - k). Otherwise pass.
4. Partner-holds `teamEst`: discount partner calls that were signals or forced steps, not strength.
5. Separate bug: `choosePlay` hardcodes seats `[0..5]` for opps/partners (bot.js:410-411). At the 8-player table, seats 6 and 7 are ignored.

Re-test with `test/tune.js` self-play, and on these 120 deals with the all-bot replay.

## Update: fixes 1-3 implemented (2026-11-04, uncommitted)
- `auctionRead(view, suit, P)` in `src/bot.js`:
  - Partners' shown Jack (`readJackW` 2) and Nine (`readNineW` 1) of the suit add to the estimate, as do their calls in it (`readLenW` 1 each, up to 2).
  - The same from opponents subtracts.
  - A partner who has only passed takes off `readPassW` 1.
  - Used for every own-bid option, for the Plus 1 gate, and to subtract opponents' signals from the partner-holds `teamEst`.
- Plus 1 (both spots) only when the team estimate is at least value + 1 - `plusSlack` (2).
- Monte Carlo check on contested bids from `simMinValue` 32 (was 36).
- Off switch: `readJackW: 0, readNineW: 0, readLenW: 0, readPassW: 0, plusSlack: 99, simMinValue: 36` reproduces the old bot on 1499/1499 logged bot decisions (Monte Carlo disabled for the comparison).

Self-play A/B, side-swapped, 600 matches (scratch `ab.js`):

| | tables/match for candidate | candidate made | baseline made |
|---|---|---|---|
| new vs old | +1.52 ± 0.54 | 78% | 74% |
| old vs old (control) | -0.06 ± 0.35 | 75% | 75% |

The new bot declares about 30% fewer contracts.

200-match split by component (noisier): Plus gate alone +0.66, sim from 32 alone +0.36, reading alone +0.06, all together +1.08. Only the combination is clearly positive.

On the logged hands, at the call that won each bot contract, the new bot:
- passes on 13 of the 21 bot contracts that also lose in all-bot play (plus one changes suit);
- passes on 6 of the 34 made ones (two more change suit).

Not yet done: fix 4 (discount partner signal bids in `teamEst`), the 8-player seat bug, weight tuning with `test/tune.js` (new knobs are not in its STEPS), and checking against humans with the next batch of logged hands.

## Update: play changes (2026-11-04, uncommitted)
- **`track(view, P)`:**
  - `trackBids` places the cards the auction showed (Jack-signal bids, Plus cards) with their seat until played.
  - A Plus 1 on the Jack (engine enforces a lone Jack) becomes a void once the Jack is played.
  - `canBeat` / cut threats ignore higher cards known to be with a partner (`oppOutside`, `oppTrumps`).
- **First try also used this for leads:** lead a card when every higher one is with a partner. It cost -0.86 ± 0.38 tables/match, because the partner cannot tell the lead is safe (or holds a lone Jack) and overtakes with its master. Leads went back to true masters.
- **Draw trumps:** the bidding side, holding >= `drawMinTrumps` (3) trumps and at least as many as the opponents can still have, leads its lowest trump.
- **8-player:** `choosePlay` built partners/opponents from seats 0..5; now from `view.players`.
- **Self-play** (scratch `ab2.js`, seeded deals and Monte Carlo; control old vs old = 0.00 exactly):

  | change | tables/match |
  |---|---|
  | tracking | 0.00 ± 0.25 (400 matches) |
  | draw min 2 | -0.06 ± 0.31 |
  | draw min 3 | +0.06 ± 0.28 |
  | draw min 4 | 0.00 ± 0.14 |
  | 8p seat fix vs bug copy | +0.08 ± 0.79 (150 matches) |

  All neutral. The rules seldom change a card (23 and 13 of 3303 logged choices). The existing heuristics already counted masters and trumps.
