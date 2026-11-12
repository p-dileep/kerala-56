# Same-deal replay experiment for bot bidding (2026-11-12)

Question (user): deal a hand to six bots, let them bid and play, replay the same hand to see what more
could have been bid, repeat over many hands: can this improve the bots' bidding?

Tool: `test/par.js` (new). Changes to the bot: one new knob `leadW` in `src/bot.js`, default 0; switched on at 2 for the self-play half (see Conclusions).

## What the tool does

| Mode | What it measures |
|---|---|
| `node test/par.js [deals]` | Each deal is bid and played, then replayed with every suit and no-trump forced for each team. Reports the gap to hindsight par and to "perfect teamwork". |
| `node test/par.js show [n]` | The worst deals with hands, auction and what each team makes in each suit. |
| `node test/par.js screen [deals]` | Every bidding knob one step up and down against the default bot. |
| `node test/par.js ab [deals] [json] [matches]` | A parameter set against the default bot. |
| `node test/par.js tune` | Coordinate ascent using the same scoring. Not run today (screening in parallel was faster). |

Scoring for screen / ab / tune is duplicate play: each deal is played twice, the candidate on team A and
then on team B, same cards and same Monte Carlo layouts; result in chips per hand with a standard error.

Two ceilings:
- **Hindsight par**: best contract on the actual layout. Every style is about 2 chips per hand away from it
  (medium 2.00, aggressive 1.95, defensive 2.04, mixed 1.97; 1000 deals). It is mostly card luck and does
  not separate good bidding from bad. Not used for tuning.
- **Perfect teamwork**: a team sees its own three hands, not the opponents', and bids the level with the
  best expected chips over 24 reshuffles of the opponents' cards. This is the limit of what information
  exchange in the auction can reach.

## Results (medium bots, 6 players)

Teamwork ceiling, 1000 deals: the stronger team would earn 1.04 chips per hand; the bots' auction earns it
0.49. Headroom 0.55 chips per hand.

Where it goes (600 deals):

| Leak | Hands | Detail |
|---|---|---|
| Stronger team did not declare | 189 (32%) | never called in 84, called once in 87; the other side made its contract in 126; final bid averaged 30.3 |
| Declared at 28-39 and made, 40 or more was right | 98 (16%) | 70 would have made 40 in the suit they were already in |
| Declared and went down | 58 (10%) | 44 in a different suit from the teamwork suit |

The stronger team ends in its teamwork suit in 224 of 411 hands it declares. Auctions average 3.0 calls
that are not passes (all-human tables: 8.3).

Knob screening (800 duplicate deals each, 38 knobs): nothing moves much. Best single steps: estBase 24 -> 25
+0.041 +/- 0.018, bidContestMargin 2 -> 1 +0.031 +/- 0.015, estNineW 0.5 -> 1 +0.019 +/- 0.010. Every
step towards bidding less loses. Most convention knobs change no result at all.

Combinations against the default bot:

| Parameters | Chips per hand (deals) | Tables per match (200) |
|---|---|---|
| estBase 25, bidContestMargin 1 | +0.035 +/- 0.013 (3000) | +3.30 |
| plus estNineW 1, estJackW 2, showJackMargin -1 | +0.053 +/- 0.015 (3000) | +2.76 |
| the HUMAN_TUNED numbers | +0.075 +/- 0.016 (3000) | +3.78 |
| leadW 2 | +0.030 +/- 0.009 (4000) | +1.92 |
| leadW 2, bidContestMargin 1 | +0.044 +/- 0.011 (4000) | +2.28 |
| leadW 2, estBase 25, bidContestMargin 1 | +0.034 +/- 0.013 (4000) | +2.70 |

The human-fitted numbers are the best set found, on a measure they were not fitted to.

## Opening lead (user's idea)

The seat right of the dealer leads the first trick whoever wins the bid. Forced replays, 1500 deals: the
bidding side takes 28.8 points when its own team has the lead and 26.9 when the other team has it
(two Jacks of trump in the team: 35.7 against 33.3). The bots' estimate ignored this.

`leadW` adds to every estimate when my team has the lead. Bonus when leading: +0.015 +/- 0.007 at 1,
+0.029 +/- 0.010 at 2, +0.027 +/- 0.010 at 3. Subtracting when the other team leads loses
(-0.025 +/- 0.008), so the knob only adds. Default left at 0.

## Conclusions

1. The method works as a measuring tool and as a tuner, but the knobs are close to their best: about
   0.03-0.08 chips per hand is available from numbers, against 0.55 from better information exchange.
2. The gain has to come from new bidding rules, aimed at the two large leaks: the stronger team staying
   silent over a cheap contract, and stopping below 40 in the right suit.
3. Applied (user decision, same day): the self-play half (Pappan, Chinnu, Kunjamma, Appu, Mathai) carries
   `leadW: 2` through `SELF_PLAY_TUNED` in `src/bot.js`. The human-tuned half and `DEFAULT_PARAMS` are unchanged.
   Moving the self-play half towards the human-tuned numbers was not done (it narrows the comparison).

## Follow-up: rules for the two leaks (same day)

**Leak 1, stronger team silent: compete rule (`competeEv`, `competeSlack` 4, `competeMaxValue` 36).** When
opponents hold a bid below 36, the estimate says pass and my best other suit is within 4 of the next bid,
the bot lays the hand out twice (their contract, my suit one step up) and bids when its own contract is
worth more expected chips than defending.

| Test (duplicate play) | Chips per hand |
|---|---|
| competeEv 0.05 against default, 3000 deals | +0.092 +/- 0.013 (+4.86 tables per match, 200 matches) |
| with leadW 2, 3000 deals | +0.094 +/- 0.014 (+5.28 tables per match) |
| margin 0.3 / 0.01 / -0.2, 1000-1500 deals | +0.070 / +0.123 / +0.120 |
| slack 2 / 8 / no limit with max 40, 1500 deals | +0.066 / +0.081 / +0.094 |
| on top of each style (leadW 2 both sides), 1200 deals | defensive +0.108 +/- 0.018, medium +0.061 +/- 0.020, aggressive -0.007 +/- 0.014 |
| on top of the HUMAN_TUNED numbers, 1200 deals | +0.022 +/- 0.016 |
| 8 players, medium, 800 deals | +0.052 +/- 0.023 |

Applied to the self-play half through `SELF_PLAY_TUNED`; default 0 (off); human-tuned half unchanged.

**Leak 2, stopping below 40: no rule; the leak is mostly not real.** In the 50 hands (of 500) where the
teamwork ceiling said 40 in the suit actually played, the declarer took 35.1 points on average and reached
40 in 18%. The declarer's own layouts gave 33 at 75% confidence, the best partner's 32. Two attempts, both
removed: choosing 40 / 48 / 56 by expected chips instead of the 75% cut-off (-0.001 and -0.009 +/- 0.007),
and partners always checking the layouts for a level raise (0.000 +/- 0.007).

## Limits

- "Makes" means against bot defence with bot card play.
- All figures are bot against bot; nothing here was checked on the logged human hands.
- Tables-per-match figures are from 200 matches without a standard error; read them as direction only.
- `test/socket.js` fails intermittently on untouched code too (known concede race); `test/sim.js` passes.
