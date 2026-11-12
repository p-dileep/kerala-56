# Human bidding on all-human tables (2026-11-11)

Source: `data/hands.jsonl`, 361 hands. All six seats human in 32 hands: HK92K (1 Nov, ids 27-36),
GYRSP (4 Nov, 146-157), Z96A8 (7 Nov, 217-221 and 224-228). Nine players. Small sample: read the
percentages as indications only. Script: scratch `hum.js` (not in the repo).

## Contracts

| Group | Contracts | Made | Average final bid | 40 or more | Declarer's own hand vs bid (bot estimate) |
|---|---|---|---|---|---|
| All-human tables | 32 | 69% (22) | 37.5 | 41% (13) | 8.8 below |
| Humans on bot tables | 111 | 65% | 35.2 | 31% (34) | 4.5 below |
| Bots on bot tables | 218 | 67% | 34.3 | 21% (46) | 3.6 below |

Declaring team's card points at the deal average 28.9 in all three groups: the all-human tables bid
about 2-3 higher on the same cards and make it as often.

By level (all-human): 28-33 5 of 8 made, 34-39 7 of 11, 40-47 10 of 12, 56 0 of 1.
Most common final bid: 40 (8 of 32). No-trump contracts 3 of 32 (bot tables: 3 of 329).

## Auction shape

| | All-human | Bot tables |
|---|---|---|
| Calls per hand (not passes) | 8.3 | 5.8 |
| Players who call at least once | 4.4 of 6 | 4.0 |
| Doubles per hand | 0.44 (14 in 32) | 0.09 (28 in 329) |
| Opening call shows the Jack | 63% | 64% |

Doubled contracts played: 4 (two made, two failed; #36 47 hearts redoubled failed, 12 chips).

## Per player (all-human hands)

| Player | Hands | Turns | Calls | Call rate | Plus | NS | Doubles | Contracts | Made |
|---|---|---|---|---|---|---|---|---|---|
| BK | 32 | 107 | 52 | 49% | 5 | 1 | 8 | 7 | 5 |
| Vijith | 32 | 105 | 35 | 33% | 6 | 1 | 3 | 3 | 3 |
| SAK | 32 | 101 | 48 | 48% | 3 | 1 | 2 | 6 | 4 |
| Sreenath | 29 | 95 | 44 | 46% | 6 | 1 | 0 | 5 | 4 |
| IAK | 28 | 94 | 35 | 37% | 2 | 1 | 1 | 5 | 3 |
| Dileep | 15 | 47 | 19 | 40% | 4 | 2 | 0 | 2 | 1 |
| Sandeep | 10 | 33 | 8 | 24% | 0 | 0 | 0 | 1 | 0 |
| Vivek | 9 | 29 | 13 | 45% | 1 | 1 | 0 | 1 | 0 |
| Inzi | 5 | 17 | 12 | 71% | 2 | 0 | 1 | 2 | 2 |

## Would the bot have called the same? (623 decisions)

| Bot style | Passes matched | Calls matched exactly |
|---|---|---|
| Medium | 346 of 361 (96%) | 59 of 262 (23%) |
| Aggressive | 318 of 361 (88%) | 84 of 262 (32%) |

By type (aggressive): bid 72 of 210, Plus 12 of 29, NS 0 of 8, double 0 of 14 (the bot matched none
of the doubles or NS calls).

## Takeaways for bot tuning

1. Humans among humans bid further on partnership information (declarer's own hand is ~9 below the
   final bid); the bot's auction reading is the lever, not its own-hand estimate.
2. Doubles are five times as frequent as on bot tables and the bot reproduces none of them.
3. 40 is the natural target level and it is made 10 times in 12.

## Team cooperation in the auction (declaring team; scratch `coop.js`)

| Measure | All-human (32) | Human declarer, bot table (111) | Bot declarer (218) |
|---|---|---|---|
| Team calls per hand (declarer's share) | 6.0 (2.5) | 3.8 (2.1) | 3.7 (1.8) |
| All three teammates called | 78% | 44% | 48% |
| All three called the final suit | 47% | 14% | 18% |
| Final suit first named by the declarer | 47% | 65% | 61% |
| Team named two or more suits | 81% | 68% | 67% |
| Both trump Jacks shown by the team | 50% | 28% | 42% |
| Played in the team's longest suit | 72% | 70% | 63% |
| Made in longest suit / not longest | 76% / 50% | 75% / 41% | 78% / 49% |

Answer to a partner who holds the bid: all-human pass 48%, new suit 26%, plain raise 7%, raise
showing the Jack 5%, Plus 8%, no-trump 3%, NS 2%. Bot tables: pass 70%, new suit 13-14%, Plus 7-10%.
Same-suit raises over a partner: always one step on all-human tables (29 of 29); bots jump five or
more in 21 of 72.

Made rate by teammates who called the final suit (all-human): one 3 of 6, two 8 of 11, three 11 of 15.
Team used NS: 6 of 7 made. Team used Plus in the final suit: 5 of 9 made (17 of 23 without); too few to read.

## Update 2026-11-12 (469 hands)

Tonight's session (ids 453-469; BK, Vijith, Dileep, IAK, SAK, Sreenath, Inzi, manava) added 12 hands with
at most one bot: 3 six-player, 9 eight-player (the first eight-player human hands). Three had every seat
human (455, 466, 467). Figures below are from a new scratch script, so the "own hand below bid" column is
not exactly comparable with the table above.

| Group | Hands | Made | Average bid | 40 or more | No-trump | Calls per hand | Doubles per hand | Declarer's own hand below bid | Declaring team's calls | All teammates called |
|---|---|---|---|---|---|---|---|---|---|---|
| Every seat human | 35 | 71% (25) | 37.6 | 43% | 3 | 8.4 | 0.40 | 10.1 | 6.2 | 80% |
| One bot at the table | 13 | 54% (7) | 37.4 | 46% | 2 | 9.8 | 0.46 | 7.7 | 7.5 | 54% |
| Tonight (0-1 bot) | 12 | 67% (8) | 37.4 | 50% | 2 | 9.3 | 0.25 | 8.4 | 7.5 | 67% |
| Human declarer, bot table | 152 | 70% | 35.3 | 32% | 4 | 5.6 | 0.05 | 5.0 | 3.7 | 43% |
| Bot declarer, bot table | 269 | 68% | 34.3 | 23% | 0 | 5.8 | 0.07 | 3.8 | 3.7 | 47% |

By level, 0-1 bot tables (48 hands): 28-33 7 of 11 made, 34-39 10 of 16, 40-47 15 of 20, 56 0 of 1.

Tonight's auctions:
- Two no-trump contracts reached through the same sequence: both partners name several suits and Jacks
  (bids, Plus, NS), then one calls NT and repeats it over the partner's suit (457 IAK 43NT, 461 Vijith 45NT).
  Both made; the defence conceded with 0 points.
- 455: all six players called, 12 calls, Sreenath 42 clubs made.
- Failures: 456 SAK raised himself 39 to 40 diamonds (4 points when it ended), 469 BK jumped 36 to 40 spades
  (18 points), 465 Inzi 36 spades, 454 BK 33 hearts.
- The bot seat joined in: Kuttan called in 4 of his 5 hands, Unni in both of his.

Would the bot have made the same call? 1005 human decisions on 0-1 bot tables:

| Bot numbers | Passes matched | Calls matched exactly | Same kind of call |
|---|---|---|---|
| Medium (default) | 96% | 23% | 30% |
| Self-play half (leadW, competeEv) | 94% | 28% | 38% |
| Aggressive | 90% | 31% | 41% |
| Human-tuned | 92% | 34% | 44% |
| Human-tuned, aggressive style | 80% | 35% | 47% |

No bot setting matches any of the 19 doubles or 15 NS calls; Plus 22 of 49.
