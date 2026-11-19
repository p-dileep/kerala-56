# Hand #920 (2026-11-19, private table, first hand after a338b15)

Pulled 920 hands (was 798). This table has one logged hand.
Seats: 0 Dileep (human), 2 Jalaja, 4 Ponnappan (team A, both neural card play);
1 Ammini, 3 Chinnu, 5 Kunjamma (team B). Dealer 5, opener 0.

## Auction
28S (J) Dileep · pass · 29D Jalaja · 30D (J) Chinnu · 31S (J) Ponnappan · pass ·
32H (J) Dileep · all pass. Dileep holds J A 10 10 S, J 9 H: 32H is a probe on a
2-card suit after the team settled spades.

## Result
32H made, 36-13, stopped after trick 7; +1 chip (12/12 -> 13/11).

## Findings
- Par is spades. Team A in spades, bots playing all 8 tricks: 42 (40S = 2 chips).
  Hearts: 29 (down at 32). Team B's best: 38 in D or NT. Teamwork value
  (opponents reshuffled 200x): S at 28-39 EV +0.98, H -0.35.
- Ponnappan should have gone back to 33S (`backTeam` convention). From that seat it
  happens in 6 of 20 Monte Carlo runs: the `simPoints` check (from simMinValue 32) rates
  33S below simNeed because he cannot see Dileep's A 10 10 S. Jalaja holds only 9S, so passing was right.
- The live card play saved the contract: Dileep led JH then 9H, which pulled all six
  enemy hearts by trick 2 (gave Ammini's JH 8 points), and the spades and clubs ran after that.
  Rule bots instead lead JS at trick 2, Chinnu ruffs clubs with AH, and they get 29.
- Chinnu (Bold) did not compete with 33D over 32H; Team B could make 38 there. One hand, not a pattern.

Scripts: scratchpad `h920.js` (strains, teamValue, bid replay), `h920b.js` (trick-by-trick).

## Fix (2026-11-19)
`backJacks` 1 in src/bot.js: going back to the team suit skips the Monte Carlo check when the team holds both Jacks there. #920: Ponnappan 33S in 20/20 runs (was 6/20). Self-play: -0.000 +/- 0.001 chips/hand (2000 same deals), -0.12 tables/match (300 matches, within noise). Logged hands: 11 of 7588 bot calls change (helps #920, #399, #415; would go down in #546, #760).
