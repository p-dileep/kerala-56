# Are the bots playing worse recently? (2026-11-06)

Question (user): "why recently the bots are playing bad". Data: 206 logged hands (pull of 2026-11-06).
"Old" = hands on versions before ce4df91 (120 hands); "new" = ce4df91 onward (86 hands).

## Verdict
No measurable regression. Bot contracts are made more often on the new versions, and card-play
mistake rates are unchanged. One real, long-standing play weakness found (below).

## Numbers
- Bot-declared contracts made: d575127 28/53 (53%); 0f172df 13/17; f2fec51 9/11; cb916cf 6/9; acc42ee 3/4.
- Dileep's team on 11-06: 31 hands, bot partners declared 11 and made 8, team net +3 chips.
- Obvious card mistakes per bot card (old / new): trumping a partner's winning trick not last 25/3651 vs 14/2557;
  missed adding points to partner's trick last 34/376 vs 27/274; giving points to opponents when last 1 vs 2.
- Replay: current bot reproduces 4246/4274 logged bot cards (differences = older versions).

## Weakness found (old and new alike)
`choosePlay` following (`src/bot.js` ~571-578): when a partner holds the trick but an opponent still to play
can beat it (`partnerWinning && !partnerSafe`), the bot always plays `lowest(legal)`. It never covers with a
sure winner. Hindsight count: 25 tricks in 120 old hands (153 pts), 21 in 86 new hands (101 pts).
Example #206 (40D by Chinnu): Chinnu leads QD (low to partner's shown Jack), Dileep KD, Ammini plays KD
holding JD, Pappan behind wins with 9D. The lead-low-to-partner's-Jack rule (9df5337) relies on the
partner playing the Jack, but the follow code ducks.

Possible fix (not done): in the follow branch, if partner is winning but not safe and a `safeWin` card
exists, play the cheapest one (or the Jack when the partner led low into a shown Jack). A/B with test/tune.js.

Scripts (scratch, not in repo): play_analysis.js (patched for new auction rules), blunders.js, cover.js.

## Fix applied (2026-11-06, same day)
- `answerJackLead: 1` (src/bot.js follow branch): partner led trump, I showed the Jack of trump in the auction,
  partner's card is not safe -> play my Jack when no opponent still to play can beat it.
- `coverMinPts: 99` (off): generic "cover an unsafe partner with the cheapest sure winner". On the 206 logged
  deals (all-bot replay) it lost contracts: threshold 0 -> 135 made vs 141, 3 -> 139, 5+ -> same as Jack-only.
  It spends Jacks/9s on tricks worth nothing.
- Jack rule A/B (scratch ab.js, seeded, side-swapped): 6p 500 matches +1.01 ± 0.21 tables/match, made 75.3% vs 74.5%;
  8p 150 matches -0.08 ± 0.29. Logged deals: 10 hands change, 141/206 made either way, #206 45 -> 56.
