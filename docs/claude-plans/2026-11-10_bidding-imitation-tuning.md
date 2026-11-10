# Bidding imitation tuning from logged human hands

Date: 2026-11-10. Data: 261 hands pulled from Supabase (`data/hands.jsonl`), all with at least one human.
Script: `test/imitate.js` (report / tune / ab). Earlier scratch replay scripts from 2026-11-04 were not in the repo.

## Method
- Rig the engine with the logged deal and dealer, replay the logged auction, and at every human decision in
  the bidding phase ask `chooseBid` (view snapshot, seeded Monte Carlo) what it would call.
- 1294 human decisions (670 passes, 511 bids, 61 Plus, 18 NS, 33 doubles, 1 redouble). Self-raise window
  and hands that no longer replay under today's rules are skipped.
- Score = mean of (human passes the bot also passes) and (human calls the bot matches exactly: type, value,
  suit). Balanced so the tuner cannot win by always passing or always calling.
- Coordinate ascent over 39 bidding knobs, trained on even hand ids, checked on odd ids.

## Baseline (DEFAULT_PARAMS = medium)
pass 95.4%, call exact 20.7%, score 58.0. Aggressive style 87.5 / 31.7 / 59.6; defensive 97.9 / 12.3 / 55.1.
Main disagreement: bot passes where a human bid (334 of 511 human bids). Humans bid a median 3 points
above the bot's raw estimate (p25 0, p75 +6). Humans double 33 times, bot never (doubleMinValue 44).

## Tuned (HUMAN_TUNED in src/bot.js)
estBase 24->25, estLenW 2->2.25, estJackW 1.5->2, plusMaxValue 40->38, nsMargin 0->-2,
bidContestMargin 2->1, readJackW 2->2.5, readLenW 1->1.5, simMinValue 32->34.
- train: 57.0 -> 63.4; test: 59.1 -> 59.8 (pass 95.8 -> 88.5%, call exact 22.4 -> 31.1%); all: 61.6.
- Self-play A/B vs default, 150 matches side-swapped, seeded (control 0.000): **+3.92 tables/match**.
  No standard error computed; earlier A/Bs of this size had +-0.4..0.8.

## Deployment rule (user, 2026-11-10)
Half of the named bots always carry the human-tuned numbers, as shifts on top of their style preset:
**Kuttan, Ammini, Unni, Sarojini, Leela** (`HUMAN_TUNED_BOTS`). Pappan, Chinnu, Kunjamma, Appu, Mathai
keep the self-play numbers. Keep the membership fixed so the logged hands compare the two halves; retune
only the numbers (`node test/imitate.js tune`, then paste `changes:` into `HUMAN_TUNED`).

## Caveats
- Three players (IAK, Dileep, Vijith) supply two thirds of the human decisions.
- Generalisation is modest (+0.7 on held-out); the self-play gain is the stronger evidence.
- Passes matched fell to 88.5%: the tuned bot now bids on some hands humans passed.
- Doubles and NS are still almost never matched; they need rule changes, not knob changes.

## Next
- Re-pull and retune at ~500 and ~1000 hands; compare made% of the two bot halves from the log.
- Consider a double rule fitted to the 33 human doubles (only 2 of the early 11 were set, so humans may be wrong here).
