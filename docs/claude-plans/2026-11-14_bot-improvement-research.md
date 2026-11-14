# Bot improvement research: bidding and play (2026-11-14)

Goal (owner): improve the bots in bidding and play; the human-tuned half (Kuttan, Ammini, Unni, Sarojini, Leela)
should bid more like the humans do, the self-play half (Pappan, Chinnu, Kunjamma, Appu, Mathai) should be more robust.

Data: `data/hands.jsonl`, 548 hands (ids 1-548), 530 six-player and 18 eight-player. No void hands, 10 conceded.
No self-play or duplicate matches were run for this document: every number is from the logged hands or from
replaying them through `src/bot.js` as of 2026-11-14. Every proposal still needs its own test before it is switched on.

Labels: **[LOG]** counted from the hands as played; **[REPLAY]** the logged position put through today's bot;
**[REASONING]** inference, not measured; **[WEB]** short literature search.

Limits that apply throughout:
- 21 of 548 hands do not replay under today's auction rules (all id <= 360) and are skipped in every replay figure.
- Seat kinds are logged at the end of the hand; a seat that changed hands mid-hand is attributed to its last occupant.
- "Tester", "TEster", "Tester2", "Tester 2" are excluded from human figures (25 contracts, 302 card choices).
- Dileep, IAK and Vijith supply 1,107 of the 2,088 human bidding decisions.
- Rollouts are one deal each with bots finishing the hand. They measure "is this call or card better in bot company"; cells under about 30 cases are not conclusive.
- Eight-player data is 18 hands: nothing can be concluded for that table.
- The `saveDiscardCut` figures below were measured on an earlier form of the rule (value 1, before the "keeps a higher trump" condition that was shipped in 6c5a5c1 at value 2).

## Main findings

1. **One play change is supported by both humans and bot replays: `coverMinPts` 99 -> 0.** When a partner holds the trick but an opponent behind can beat it, humans overtake with their own sure winner, nearly always the suit's Jack (31 cases, +3.8 points each). The bot ducks: 65 logged tricks lost that way, 334 trick points. On the 527 replayable deals the rule gains +0.41 +/- 0.13 points per hand for declarers and +0.47 +/- 0.12 for the defence. The 2026-11-06 test rejected it because it counted contracts made with every seat changed; the defence gains more, so fewer contracts are made while both sides play better.
2. **Otherwise the bot's cards are as good as the humans' or slightly better.** Humans differ on 1,061 of 3,371 choices, worth -91 points in total. Their other habits cost points. So there is no case for a separate "human" card-play style.
3. **Bot bidding losses come from the opening lead and the trump fit, not the level.**
   - Other side on lead: 61% made against 74%, and 7.3 points lost before the first trick won against 1.7.
   - Bot declarers with no side-suit Jack and 2+ exposed points, other side on lead: 41% made (29 hands) against 73%.
   - Team with no more trumps than the opponents: bots 45 of 88 made, -42 chips.
   - A Plus that becomes the contract: 25 of 44 with the other side on lead (-9 chips), 29 of 35 with own lead (+20).
4. **Two suspects from the CDKS6 game.**
   - Hand 547 (Kunjamma 37D over 36S, down): outbidding at 36+ with fewer trumps happened twice in 548 hands. In a seeded replay today's Kunjamma bids 37 diamonds in 5 of 30 seeds; with 300 layouts the answer is a clear pass. Monte Carlo noise, not a rule gap.
   - Hand 548 (Kuttan stopped at 40C, play-out 56): layouts give 48+ in 64% and 56 in 44%; 48 over a safe 40 needs 86%. Stopping at 40 was right by the chip odds. Agrees with the 2026-11-12 par document: no level rule.
5. **Human-like bidding.** Today's human-tuned bot matches 81.4% of human passes and 36.3% of human calls exactly. The gap is talking to a partner who holds the bid (humans call 48% of the time, the bot 31%). Knobs move the score under one point. Fixed rules trade calls for passes, because humans do each thing in only 25-45% of the spots.
6. **`SELF_PLAY_TUNED` is not in the log yet.** No play56.in hand runs a commit later than 077b6ac; `leadW` and `competeEv` appear only in 19 Render hands.
7. **`test/imitate.js` bug:** `TEST_NAMES = /^tester$/i` misses "Tester2" and "Tester 2".

## 1. Contracts by declarer [LOG]

Chips are from the declaring team's side, doubles included.

| Declarer | Contracts | Made | Chips | Per contract | Average bid |
|---|---|---|---|---|---|
| Human | 209 | 141 (67%) | -13 | -0.06 | 35.6 |
| Human-tuned names | 181 | 130 (72%) | +51 | +0.28 | 34.3 |
| Self-play names | 133 | 91 (68%) | +23 | +0.17 | 34.6 |
| Tester seats | 25 | 16 (64%) | -6 | -0.24 | 36.4 |

The halves differ only from id 266 (commit 516810b); before that the split is a placebo.

| From id 266 | Contracts | Made | Per contract | Share of seat-hands that declare |
|---|---|---|---|---|
| Human | 104 | 70 (67%) | +0.02 | 32.1% |
| Human-tuned bot | 97 | 74 (76%) | +0.48 | 16.2% |
| Self-play bot | 67 | 51 (76%) | +0.48 | 8.9% |

The halves earn the same per contract; the human-tuned half declares almost twice as often. A team with a human gets exactly one human-tuned bot, so the seat mix differs: indicative only.

By band, whole log (made, chips):

| Band | Human | Human-tuned names | Self-play names |
|---|---|---|---|
| 28-35 | 86/124 (69%), +10 | 96/136 (71%), +17 | 63/93 (68%), 0 |
| 36-39 | 7/14, -7 | 5/7, +2 | 5/9, -3 |
| 40-47 | 48/66 (73%), +37 | 26/34 (76%), +30 | 22/29 (76%), +27 |
| 48+ | 0/5, -53 | 3/4, +2 | 1/2, -1 |

By era, all declarers: ids 1-120 65% made, -5 chips; 121-265 67%, -7; 266-363 69%, +12; 364-548 73%, +55. Bot declarers went from 57% / 56% (ids 1-120) to 77% / 77% (from 364).

Where each group loses:
- **Humans**: 48 and above (0 of 5, -53 chips; ids 52, 147, 418, 422 among them), 36-39 (7 of 14), and the self-raise window (section 2.1).
- **Bots**: nothing at 40+ (40-47: 48 of 63, +57). The losses are the 28-35 contracts that fail: 70 failures, -144 chips, against +161 for the 159 made. Sections 3 and 4 say which ones.
- Doubled contracts are too few to read (bots 9, humans 9).

## 2. Humans against today's human-tuned bot in the auction [REPLAY]

Method: each replayable human decision (2,088) was given to `chooseBid` with `paramsFor(table style, 'Unni')`, seeded as in `test/imitate.js`.

- Passes matched 913 of 1,122 (81.4%); calls exact 351 of 966 (36.3%); same kind of call 48.9%; balanced score 58.85.
- Mixed tables: humans call on 50% of turns, bot 35%. Aggressive tables: 43% and 41%, but on different hands (passes matched 489 of 634).

| Situation | Decisions | Humans call | Bot calls |
|---|---|---|---|
| Partner holds the bid | 824 | 48% | 31% |
| Opponents hold, my team has called | 778 | 40% | 34% |
| Opponents hold, my team silent | 364 | 36% | 40% |

The gap is in talking to a partner who holds the bid, as the 2026-11-11 document found. New: with the team silent the bot now calls more than humans do.

### 2.1 Disagreements, classified

"Rollout" = human's call minus bot's call in chips for that team, bots finishing auction and play on the same deal. "Live" = what actually happened.

| Disagreement (human -> bot) | Cases | Rollout per case | Live result of the habit |
|---|---|---|---|
| Partner holds: raises partner's suit one step -> pass | 63 | +0.08 +/- 0.17 | all 125 human raises: team declared 114, made 89 (78%), +55 chips |
| Partner holds: new suit -> pass | 54 | -0.70 +/- 0.25 | team declared 51, made 39 (76%), +27 |
| Opponents hold, team silent: pass -> bot bids new suit | 45 | +0.22 +/- 0.16 (pass better) | - |
| Opponents hold: rebids own suit -> pass | 46 | -0.20 | became contract 17, made 9; team -40 |
| Opponents hold: bids partner's suit -> pass | 39 | +0.03 | became contract 10, made 7; team -25 |
| Opponents hold: new suit -> pass | 52 | -0.13 | team 0 |
| Partner holds: rebids own suit over partner -> pass | 36 | +0.36 | became contract 15, made 8; team -12 |
| Pass -> bot says Plus | 46 | -0.43 +/- 0.19 (Plus better) | - |
| Double -> pass | 35 doubles | +0.14 +/- 0.29 | 6 of 29 doubled contracts failed; doublers -17 chips |
| NS -> pass (19 of 31 human NS are over a partner's bid) | 17 | +1.00 +/- 0.48 | team declared 27, made 20; -6 |
| No-trump bid -> pass | 11 | -2.09 +/- 0.74 | 12 NT contracts, 9 made |

- **Make money**: one-step raise of partner's suit (33 of 40 made as contracts); a jump to exactly 40 in the auction (30 contracts, 25 made, +39 chips; the bot makes the same call in 3 of the 30).
- **Lose money**: doubles; the self-raise window (26 used, 16 made, -11 chips; keeping the old bid would have earned +4 on the same hands); 48 and 56 (0 of 5 contracts); rebidding the same suit over an opponent beyond what the bot would.
- **Pay only with a partner who reads them**: a new suit over partner's bid. 46 of 56 hold that suit's Jack and 45 of 54 hold two cards or fewer in partner's suit: a "my Jack is here" message. With bot partners it loses 0.70 chips per call, because nothing in `chooseBid` moves the contract out of the three-card suit afterwards.
- Bids 9+ above the bot's own-hand estimate where the bot passes: 45 cases, rollout -1.00 +/- 0.34.

### 2.2 How often humans do each thing in a given spot

Partner holds suit X below 36, I have not called X. Share who raise X one step:

| My holding in X | Humans | Bot |
|---|---|---|
| Jack, 2 cards | 15/31 | 15/31 |
| Jack, 3 cards | 16/21 | 17/21 |
| No Jack or Nine, 3 cards | 11/24 (46%) | 0/24 |
| No Jack or Nine, 2 cards | 10/67 (15%) | 0/67 |
| Nine, 2-3 cards | 11/48 (23%) | 1/48 |
| Lone Jack: says Plus 1 | 9/17 | 17/17 |

Partner holds X below 36, share who name a new suit:

| Cards in X, best other suit | Humans | Bot |
|---|---|---|
| 2 in X, Jack + 3 elsewhere | 18/40 (45%) | 0/40 |
| 2 in X, Jack + 4 or more | 8/13 | 0/13 |
| 3+ in X, Jack + 3 elsewhere | 9/32 (28%) | 0/32 |
| 1 in X, Jack + 3 elsewhere | 17/49 (35%) | 24/49 (49%) |
| 0 in X, Jack + 3 elsewhere | 1/16 | 6/16 |

Opponents hold, my team silent, share who bid:

| | Humans | Bot |
|---|---|---|
| Next bid is 29 | 74/124 (60%) | 92/124 (74%) |
| Next bid is 30-31 | 26/88 (30%) | 38/88 (43%) |
| Best suit Jack + 2 | 18/82 (22%) | 26/82 (32%) |
| Best suit Jack + 3 | 33/101 (33%) | 47/101 (47%) |
| Best suit Nine + 3, no Jack | 1/34 | 5/34 |
| Hand of 0-6 points | 9/87 (10%) | 18/87 (21%) |
| Best suit Jack + 4 or more | 38/59 | 37/59 |

Opponents hold, partner named X: humans keep supporting higher (34-35: 30% against the bot's 17%; 36-39: 27% against 10%). This is the habit that loses 25 chips.

### 2.3 What closes the gap, tested

Knobs alone: `showJackMargin -3` 58.94; `raiseMargin -3` no change; `altGap 1, altMinLen 2` 59.02; `simConf 0.6` 58.07; `plusSlack 0` 59.20; `estBase -1` 59.70 (passes 85.7%, exact calls 33.7%). Nothing moves more than one point.

Rules prototyped as a wrapper on today's human-tuned bot, every changed decision rolled out:

| Rule | Passes matched | Calls exact | Score | Changed | Rollout per changed decision |
|---|---|---|---|---|---|
| Today | 81.4% | 36.3% | 58.85 | - | - |
| H6: no first call over an opponent on a 2-card suit, or a 3-card suit without the Jack or under 10 points, when the team is silent (two Jacks exempt) | 84.0% | 35.0% | 59.47 | 48 | +0.23 +/- 0.18 |
| H1: raise partner's suit one step with 3+ cards, once, below 36 | 79.1% | 38.0% | 58.57 | 48 | -0.10 +/- 0.25 |
| H2: 2 or fewer in partner's suit, Jack + 3 elsewhere: name it, below 36 | 79.1% | 38.4% | 58.73 | 66 | -0.47 +/- 0.21 |
| H3: NS over a partner's bid when void in an opponent's suit, below 34 | 81.2% | 36.4% | 58.82 | 14 | +0.50 +/- 0.56 |
| H1 + H3 + H6 | 81.6% | 36.7% | 59.15 | 112 | +0.08 +/- 0.16 |
| H1 + H2 + H6 | 79.4% | 38.7% | 59.06 | 162 | -0.15 +/- 0.12 |

Each rule buys exact calls at the price of passes, because humans do the thing in under half the spots. H6 is the only one both more human and not worse in chips. H1 is free. H2 costs chips unless the partner side learns to answer it.

Also: `test/imitate.js` has `TEST_NAMES = /^tester$/i`, which does not match "Tester2" or "Tester 2" (32 seat-hands); their calls are in the current fit.

## 3. Recurring losing bot bids

### 3.1 The trump fit decides [LOG]

| Team trumps against opponents' | All declarers | Bot declarers | Human declarers |
|---|---|---|---|
| Fewer | 16/44 (36%), -44 | 10/24 (42%), -19 | 6/18 (33%), -20 |
| Equal | 54/104 (52%), -63 | 35/64 (55%), -23 | 18/38 (47%), -40 |
| More | 300/388 (77%), +161 | 176/226 (78%), +116 | 110/142 (77%), +48 |

28% of bot contracts are played with no more trumps than the opponents and lose 42 chips. Team Jacks of trump: both 153/198 (77%), one 66/109 (61%), none 2/7.

### 3.2 Outbidding at 36 or more [LOG + REPLAY]

Bots outbid an opponent at 36+ in a suit 29 times: 18 made, +4 chips.

| Split | Made | Chips |
|---|---|---|
| Fewer combined trumps | 1 of 2 (ids 89, 547) | 0 |
| Equal | 1 of 3 (76, 103, 198) | -3 |
| More | 16 of 24 | +7 |
| Team holds 0-1 Nines of trump | 7 of 15 | -8 |
| Team holds 2+ Nines | 11 of 14 | +12 |
| Today's bot makes the same call | 13 of 16 | +16 |
| Today's bot would not | 5 of 13 | -12 |

"Outbid at 36+ with fewer trumps" happened twice in 548 hands. It is not a recurring leak, and today's code already declines most of the old losers.

Hand 547: in a seeded replay today's Kunjamma bids 37 diamonds in 5 of 30 seeds and passes in 25. With 300 layouts the 25th percentile is 36 against 38 needed, so pass is the stable answer and the bid is sampling noise on 48 layouts. Hand 444 (Kunjamma 40 spades over 36 clubs, down) is similar: pass 6, 37 spades 22, 40 spades 2 over 30 seeds.

The call that won each bot contract, by whether today's bot repeats it:

| Winning call | Today the same | Today different |
|---|---|---|
| Bid over an opponent, 32-35 | 24/36 (67%), 0 chips | 10/23 (43%), -16 |
| Bid over an opponent, 40+ | 10/11, +17 | 4/10, -10 |
| Bid over partner, any level | 55/66 (83%), +47 | 25/35, +10 |
| Plus over partner, 32-35 | 24/37 (65%), -2 | - |
| Plus over an opponent, 32+ | 8/14, -4 | 0/2, -6 |

Today's bot would not make 80 of the 296 logged winning calls; those made 55% and lost 26 chips. What remains weak in calls it still makes is the **Plus that becomes the contract**:

| Bot contract won by a Plus | Made | Chips |
|---|---|---|
| Own team has the opening lead | 29/35 (83%) | +20 |
| Other team has the lead | 25/44 (57%) | -9 |
| Other team has the lead, value 32+ | 22/40 (55%) | -10 |

Failed examples: 545, 397, 507, 434, 431, 395, 332, 327, 313, 264. The Plus gate uses the estimate only (`plusSlack`), never the layouts. In 545 and 397 the layouts give a 25th percentile of 31 for a 33 and a 34.

### 3.3 Missed levels [LOG + REPLAY]

"Full" = the logged cards, then bots play out the eight tricks.

| Bot contracts made | Count | Reached the next level | Two levels up |
|---|---|---|---|
| At 28-39 | 159 | 40+: 91 (57%); 44+: 45 | 48+: 24 |
| At 40-47 | 43 | 48+: 25 (58%) | 56: 12 |

Humans: 55 of 92 at 28-39 reached 40; 22 of 48 at 40-47 reached 48.

This is hindsight on contracts that made. Was it knowable?
- Break-even odds [REASONING, from the chip table]: 40 over a safe lower contract needs 80% (gain 1, lose 4); 48 over a safe 40 needs 86%; 56 over a safe 48 needs 89%.
- Hindsight, all suit contracts: both trump Jacks and exactly 8 trumps reach 40 in 56 of 78; 9+ trumps 52 of 63 (83%). Only the last clears 80%, and a bidder does not see partners' trump count.
- Layout check at the end of each auction (declarer's seat, 24 layouts): actual 40+ in 251 of 515. Today's gate (25th percentile >= 41) fires in 66 and is right in 60 (91%). Loosening to "60% of layouts reach 40" fires in 141, right in 108: the extra 75 calls are right 64% of the time.
- Hand 548: 300 layouts give 40+ in 93%, 48+ in 64%, 56 in 44%. Stopping at 40 was right by the odds; the same call comes out in 30 of 30 seeds.
- Bots that did self-raise: 18, 12 made, +6 chips; keeping would have earned +11.

Conclusion: agrees with the 2026-11-12 document. No rule for levels.

### 3.4 The layout sampler is biased, but fixing it does not sharpen it [REPLAY]

What a call shows (random expectation 2.0 cards of a suit, 9.3 points):
- First call in a suit: bots 3.4 cards, humans 3.1-3.2; bots hold 3+ in 87%.
- Bid without the Jack signal: no Jack, and a Nine in 73-78%.
- Raise of partner's suit: 2.6-3.0 cards. Never called: 7.9 points and 0.9 Jacks (callers 9.6-10.0 and 1.5).

`dealUnseen` uses only shown Jacks, Plus cards and NS voids, deals the rest evenly, and can give a Jack to a seat whose bid said "no Jack". Prediction of the declaring side's points at the end of 515 suit auctions:

| Sampler | Seat | Bias (layouts - actual) | Brier, contract made | 40-gate fires / right |
|---|---|---|---|---|
| Today | Declarer | -1.2 | 0.201 | 66 / 60 |
| Today | Declarer's partner | -4.4 | 0.250 | 22 / 18 |
| Today | Opponent | -3.0 | 0.230 | 28 / 22 |
| Callers get their suit at twice the weight | Declarer | +0.4 | 0.189 | 99 / 81 |
| same | Partner | -0.6 | 0.204 | 58 / 45 |
| same | Opponent | +0.9 | 0.202 | 106 / 72 |

- A partner underestimates the bidder's side by 4.4 points and a defender by 3.0. This feeds `competeEv` (their contract looks weaker than it is) and partners' level raises.
- Weight 2 removes the bias and improves probability quality by 6-18%. It does not raise the correlation with the real result (0.51 -> 0.49), and the 40-gate gets less precise (91% -> 82%), so `simConf` would need retuning. Weights of 3+ overshoot.
- Excluding Jacks for "no Jack" bidders alone showed no measurable gain at 24 layouts.

## 4. Opening lead and the first tricks [LOG, 515 suit contracts]

| | Hands | Made | Chips per contract | Points lost before the bidding side wins a trick | Full points |
|---|---|---|---|---|---|
| Bidding side has the lead | 290 | 74% | +0.28 | 1.7 | 39.7 |
| Other side has the lead | 225 | 61% | -0.16 | 7.3 | 36.1 |

The gap is 3.6 points in the log; the par document measured 1.9 in self-play.

Failed contracts with the other side on lead (87): 12.0 points gone before the bidding side wins a trick. Defenders' side-suit Jack leads that win in tricks 1-3, other side on lead:

| Such tricks | Hands | Made |
|---|---|---|
| 0 | 100 | 81% |
| 1 | 95 | 52% |
| 2 | 28 | 29% |
| 3 | 2 | 0 of 2 |

In the 90 failed hands with at least one such trick, the bidding side's own cards gave 2.8 points per hand to those tricks, all forced (only point cards held in the suit led).

Predictable from the declarer's hand at bidding time? Partly:

| Declarer's hand, other side on lead | Hands | Made | Chips per contract |
|---|---|---|---|
| No side-suit Jack | 73 | 51% | -0.67 |
| One side-suit Jack | 94 | 70% | +0.28 |
| Exposed points 0 | 70 | 73% | -0.03 |
| Exposed points 3+ | 59 | 51% | -0.47 |
| Bot declarer: no side Jack and 2+ exposed points | 29 | 41% | -0.76 |
| Bot declarer: everything else (either lead) | 267 | 73% | +0.30 |

"Exposed points" = Nines, Aces, Tens in side suits of one or two cards where the hand has no Jack. With the bidding side on lead they do not matter (exposed 3+: 79% made).

`estimateFor` counts those cards as +0.6 each. Hand 545: Pappan's two singleton Nines were worth +2.4 in his estimate and fell under the first two Jack leads (17 points in two tricks). A regression of the all-bot result on the declarer's hand gives +2.7 for the lead, +1.2 per side Jack, -0.6 per exposed point; it explains little of the spread (residual 9.6 -> 9.3), so this moves averages, not single hands.

Examples: 545, 397, 488, 274, 509, 529, 270, 233, 309, 167.

## 5. Card play: humans against today's bot [REPLAY]

Replay check: today's `choosePlay` reproduces 4,054 of 4,054 logged bot cards from id 364, 99.2-99.6% overall.

Humans had a choice on 3,371 cards and played the bot's card on 2,310 (68.5%). On the 1,061 that differ the human card is worth -91 points in total with bots finishing (-0.09 per card). Contract flips: 52 for the humans, 51 against.

| Where they differ | Cases | Human minus bot, points | Better |
|---|---|---|---|
| Following, partner winning but not safe: human plays higher | 49 | +2.35 +/- 0.93; flips 6 for, 1 against | **Human** |
| - overtakes with a winner | 31 | +3.77 (18 better, 7 worse) | **Human** |
| - only adds points | 19 | -0.11 | level |
| Bidding side on lead: human side suit, bot trump | 81 | -1.54 +/- 0.68; flips 3 for, 9 against | Bot |
| Bidding side on lead: human trump, bot side suit | 50 | +1.18 +/- 0.87 | unclear |
| Void, partner safely winning: human throws fewer points | 49 | -0.59 +/- 0.32 | Bot |
| Second hand, opponent winning: human takes it high | 26 | -0.85 +/- 0.45 | Bot |
| Void, opponent winning: both cut, human with a higher trump | 85 | -0.08 +/- 0.28 | level |
| Void, opponent winning: human discards, bot cuts | 45 | -0.18 +/- 0.81 | level |
| Void, partner safely winning: human cuts anyway | 25 | -1.12 +/- 0.80 | Bot (weak) |
| Defence leads | 71 | -0.37 +/- 0.72 | level |
| No-trump: human leads low where the bot leads the Jack | 4 | +9 to +20 each | too few |

Cut or discard when void with a trump: humans cut 442 of 683, bot 459. Trump or side suit when the bidding side leads holding trumps: humans lead trump 223 of 541, bot 254.

**The one human habit worth copying.** A partner plays a low card in a side suit, an opponent behind can still win it, and I hold the suit's Jack: humans play the Jack, the bot plays its lowest card (`choosePlay` following branch falls to `lowest(legal)` because `coverMinPts` is 99). Human gains: 33 (t1, +23, flip), 154 (t1, +18, flip), 142 (t3, +15), 355 (t2, +10), 148 (t5, +9), 200 (t1, +8, flip), 241 (t2, +6, flip), 405, 146, 28. Bots ducked like this and lost the trick 65 times while holding a card nobody behind could beat (334 trick points); 28 of them from id 364: 402 t7, 366 t6, 371 t5, 480 t3, 508 t4, 513 t1, 396 t3, 426 t5.

### 5.1 Play rules tried on the 527 logged deals [REPLAY]

Actual contract, bots play every card. Each rule given to the declaring team only, then to the defence only, against today's bot. Points per hand for the side using it.

| Rule | Declarers | Defence | Verdict |
|---|---|---|---|
| `coverMinPts` 0 | +0.41 +/- 0.13 (51 hands change; 8 contracts won, 5 lost) | +0.47 +/- 0.12 (52 hands; 13 beaten, 5 given) | **Adopt after test** |
| Same, side-suit Jack only | +0.35 +/- 0.12 | +0.47 +/- 0.12 | nearly all covers are Jacks |
| Same, only when the trick holds 3+ points | +0.08 | +0.06 | too narrow |
| `saveDiscardCut` 1 (early form) | +0.11 +/- 0.07 (27 hands) | -0.03 +/- 0.03 | small plus |
| Both together | +0.51 +/- 0.15 | +0.44 +/- 0.13 | |
| Cut with a trump nobody behind can beat whenever the cheap cut could be overcut | -1.08 +/- 0.19 | -0.12 | **Do not** |
| Same, only when an opponent behind is known void | -0.10 +/- 0.07 | +0.04 | no gain |
| Never discard points on an opponent's trick | -0.04 | -0.01 | no gain |
| Do not lead a side-suit point master when 3 / 4 / 5 or fewer of the suit are unseen | -0.03 / -0.26 / -0.29 | -0.08 / -0.10 / -0.14 | **Do not** |
| Do not feed points to a partner's winning card when few of the suit are unseen | 0.00 to -0.09 | 0.00 to -0.12 | no gain |
| Bidding side cashes a side Jack in an unled suit before drawing trumps | -0.02 +/- 0.10 | - | no gain |

Why 2026-11-06 said the cover rule "lost contracts": with every seat covering, declarers gain 3 contracts and defenders take 8, so about 5 fewer are made (141 -> 135 then). Both sides were playing better.

## 6. Points given away [LOG + REPLAY]

A card with points, played to a trick the other side won, when a zero-point legal card was available.

| | Cards played | Such cards | Points |
|---|---|---|---|
| Bots, whole log | 16,176 | 541 (3.3%) | 1,068 |
| Bots from id 364 | 5,842 | 190 (3.3%) | 375 |
| Humans | 4,725 | 292 (6.2%) | 489 |

| Situation (bots, whole log) | Cards | Points | Avoidable? |
|---|---|---|---|
| Led a side-suit master (nearly always a Jack) and it was cut | 211 | 586 | No rule found (5.1) |
| Followed with points on a partner's card that looked safe, partner then beaten | 80 | 103 | No (feed guard neutral) |
| Cut, then overcut | 72 | 85 | No; 15 held a trump nobody could beat, but using it loses overall |
| Discarded points on a partner's card that looked safe, then lost | 51 | 75 | No |
| Led a point card that was not a master | 48 | 54 | - |
| Took the lead when following, then overtaken or cut | 40 | 108 | Part of fighting for the trick |
| Discarded points on an opponent's trick while holding a trump | 29 | 41 | Rule tried: neutral |
| Discarded points on a partner known unsafe | 10 | 16 | The family fixed by `saveDiscardCut` (548 t4, 547) |

Side-suit Jack leads by bots: 880, lost 225 (26%); by trick: t1 18%, t2 21%, t3 24%, t4-5 30%, t6 43%. Winning cuts by bots: 1,233, overcut 252 (20%).

Humans give away twice as often per card, mostly by leading point cards that are not masters (78) and by putting points on tricks an opponent is already winning (52; today's bot would play none of those 52 cards).

Not measured: masters left uncashed when the hand ended (the log stops when the result is decided).

## 7. What strong programs for similar games do [WEB + REASONING]

- **Sampled layouts with a full-information evaluation** is the standard for Bridge (GIB) and Skat (Kermit): deal the unseen cards many times consistently with what is known, score each candidate card on every layout, play the best average. `dealUnseen` + `simRun` are already the sampler and evaluator; they are used only for bids today.
- **Inference is where the strength comes from.** The Skat work weights each sampled layout by how likely the players' actual actions would have been with those cards, using a model trained on human games. Section 3.4 is the small version for this bot.
- **Known weakness**: averaging over layouts treats each as if everyone saw everything, so it undervalues information and safety plays ("strategy fusion"); newer work delays the layout evaluation a few plies.
- **Human imitation**: Skat policies were trained on very large human game sets. With 2,088 decisions here, only a small fitted model per situation is realistic.

Practical here [REASONING]:
1. Use the layouts for a few card decisions only: the bidding side's lead in tricks 1-3 and the cover / cut-or-discard choice. Two or three candidate cards on 16-24 layouts; a layout playout costs about 0.2 ms on this VM.
2. Keep the hard-fact sampler for level decisions; add the mild length weight only where probabilities are compared (`competeEv`).
3. Rollouts with the bot's own play inherit its habits, so they will not discover the cover rule by themselves.

Sources:
- Policy Based Inference in Trick-Taking Card Games: https://arxiv.org/pdf/1905.10911
- Learning Policies from Human Data for Skat: https://arxiv.org/pdf/1905.10907
- Improving AI in Skat through Human Imitation and Policy Based Inference (thesis): https://era.library.ualberta.ca/items/ea95bd12-3066-4cde-aa69-2e91df75c00f/download/9e37fe63-b303-45e4-960b-0d4ca400ad40
- Understanding the Success of Perfect Information Monte Carlo Sampling in Game Tree Search: https://cdn.aaai.org/ojs/7562/7562-13-11092-1-2-20201228.pdf
- Extended PIMC and strategy fusion: https://pdf.arxiv.org/pdf/2408.02380

## 8. Proposed changes, ranked

Sizes are from the logged deals only. Each needs the stated test before it is switched on.

### A. Both halves (play)

| # | Rule | Where | Evidence | Expected size | Test |
|---|---|---|---|---|---|
| A1 | Partner holds the trick but an opponent behind can beat it, and I can follow with a card nobody behind can beat: play the cheapest such card | `DEFAULT_PARAMS.coverMinPts` 99 -> 0 (code exists in the following branch of `choosePlay`) | Humans: 31 overtakes, +3.8 each. Logged deals: +0.41 +/- 0.13 declarers, +0.47 +/- 0.12 defence. 65 logged ducks, 334 trick points | About 0.4 points per hand per side; 3 more contracts per 527 hands as declarer, 8 more beaten as defence | `test/par.js ab` with `{"coverMinPts":0}`, scored by chips, not contracts made; then side-swapped matches. `simRun` plays layouts with `DEFAULT_PARAMS`, so bids shift too: check the made rate |
| A2 | `saveDiscardCut` | Shipped 2026-11-14 (6c5a5c1) at 2 with the higher-trump condition | Self-play neutral | Small | Done |
| A3 | When the layout result is within 2 points of what the bid needs, lay out more deals before deciding | `simPoints` and its callers in `chooseBid`, `chooseSelfRaise` | 547: bid in 5 of 30 seeds; 444: three different calls over 30 seeds | Removes coin-flip bids near the line; chips unknown | Seed test on logged decisions (share that change with the seed), then `par.js ab` |
| A4 | Do not add: safe-trump cuts, lead guards for side masters, feed guards, side Jacks before trumps, "never discard points" | - | Section 5.1: neutral to -1.08 points per hand | - | Done on logged deals |

### B. Human-tuned half (more human-like)

| # | Rule | Where | Evidence | Expected size | Test |
|---|---|---|---|---|---|
| B1 | Team silent: no first call over an opponent on a 2-card suit, or a 3-card suit without the Jack or under 10 points (two Jacks exempt) | `chooseBid`, before the genuine-bid block; new knob in `HUMAN_TUNED` | Humans bid 22% / 33% with Jack + 2 / Jack + 3, bot 32% / 47%. Score 58.85 -> 59.47. Rollout +0.23 +/- 0.18 (48 decisions) | +0.6 score; chips level or slightly up | Imitation score; `par.js ab` against the current human-tuned numbers |
| B2 | Raise partner's suit one step with 3+ cards and no Jack, once, below 36 | `chooseBid`, partner-holds block, next to the show-Jack raise | Humans 46% with three small cards, bot 0%; human raises 33 of 40 made. Exact calls 36.3 -> 38.0%; rollout -0.10 +/- 0.25 | +1.7 exact calls, -2.3 passes; chips level | Same |
| B3 | Fix `TEST_NAMES` to cover "Tester2" / "Tester 2", retune `HUMAN_TUNED` on 548 hands | `test/imitate.js`, then `node test/imitate.js tune` | `estBase -1` alone 59.70; `plusSlack 0` 59.20; current set fitted on 261 hands | About +1 score | Tuner's held-out half, then `par.js ab` so it does not cost chips |
| B4 | 2 or fewer in partner's suit with Jack + 3 elsewhere: name it below 36. Only with an answer rule: the first bidder returns to his suit holding 4+ with the Jack, or passes with 3+ in the new suit | `chooseBid`: widen `weakHere` in the alternative-suit offer; new answer branch | Humans 45%, bot 0%; team makes 76% live. With bot partners -0.47 +/- 0.21 per call | +2 exact calls; chips negative unless the answer works | Imitation score, then duplicate play. Do not ship on agreement alone |
| B5 | Do not copy: doubles, self-raise window, 48 / 56, rebidding the same suit over an opponent, higher support at 34+ | - | Doubles 6 of 29 set, -17. Self-raise 16 of 26, -11 against +4 kept. 48+ 0 of 5, -53. Rebids 9 of 17, team -40. Support 16 of 26, -25 | - | - |
| B6 | No separate human card-play style. Only A1 scores; the other human habits cost 0.6-1.5 points each time | - | Section 5 | - | - |
| B7 | Later, at 1,000+ hands: a small fitted model per situation (call or pass, then which call) | New table in `src/bot.js`, fitted by a script beside `imitate.js` | Fixed rules trade calls for passes one for one | Unknown | Held-out agreement by player, then duplicate play |

### C. Self-play half (more robust)

| # | Rule | Where | Evidence | Expected size | Test |
|---|---|---|---|---|---|
| C1 | Deploy the newer commits to play56.in so `leadW 2` and `competeEv` are live, then compare the halves | Server deploy | No play56.in hand is past 077b6ac; only 19 Render hands carry the newer commits. Self-play bots declare 8.9% of seat-hands (human-tuned 16.2%, humans 32.1%) | Unknown until logged | Log: made rate and chips per contract by half over 200+ hands |
| C2 | Plus that would make me declarer at 32+ must pass the layout check like a contested bid, with no slack when the other team leads | Both Plus branches of `chooseBid` (`plusSlack`, `simMinValue`) | Plus-won contracts: other side on lead 25 of 44, -9 chips; own lead 29 of 35, +20. Layouts at 545 and 397 said 31 for a 33 / 34 | About +0.02 chips per hand | `par.js ab`; logged replay: how many of the 19 failed Plus contracts it passes |
| C3 | Other team on lead: take off about 0.6 per exposed point, add about 1 per side-suit Jack | `estimateFor` / the `estimate` closure in `chooseBid`; new knobs in `SELF_PLAY_TUNED` | No side Jack 51% made, -0.67 (73); exposed 3+ 51% (59); bots with both 41%, -0.76 (29). Examples 545, 397 | Fewer of the 41% contracts, which are 10% of bot contracts | `par.js screen` on the two knobs, 3,000 duplicate deals. A flat "subtract when not leading" lost 0.025 on 2026-11-12; this is targeted, test separately |
| C4 | `estNineW` 0.5 -> 1 | `SELF_PLAY_TUNED` | Outbids at 36+: 0-1 team Nines 7 of 15, -8; 2+ 11 of 14, +12. Par screening gave +0.019 +/- 0.010 for this step | Small | Confirm with 3,000 deals on top of the current self-play set |
| C5 | A3 matters most here: near-the-line bids are the ones that look reckless | See A3 | 547, 444 | - | See A3 |
| C6 | In `competeEv` only: callers get their suit at twice the weight when laying out the opponents' contract | `dealUnseen` (optional weight) used by `simRun(view, b.high.suit, ...)` | Defender's view underestimates the bidder's side by 3.0; weight 2 gives +0.9, Brier 0.230 -> 0.202 | Unknown; the compete rule will fire less | Layout calibration, then `par.js ab` |
| C7 | No level rule, no outbid-on-trump-count rule | - | Sections 3.2, 3.3 | - | - |

Suggested order: A1, C1, C2, B1 + B2 + B3, A3, C3, C4, then B4 and C6 as experiments.

## 9. Example hands by finding

- Bot ducks under an unsafe partner with a sure winner (A1): 402 t7, 366 t6, 371 t5, 480 t3, 508 t4, 513 t1, 396 t3, 426 t5, 430 t1, 494 t1. Humans covering: 33, 154, 142, 355, 148, 200, 241, 405.
- Early loss to Jack leads, other side on lead (C3): 545, 397, 488, 274, 509, 529, 270, 233, 309, 167.
- Plus that became a failing contract, other side on lead (C2): 545, 397, 507, 434, 431, 395, 332, 327, 313, 264.
- No more trumps than the opponents: fewer 547, 89, 65, 304; equal 198, 76, 103, 22, 47, 75, 118, 371.
- Layout noise (A3): 547, 444.
- Level correctly left alone: 548. Level jumps that failed in the play: 525 (two cheap cuts overcut by a known-void opponent holding 9-A-10), 128, 143.
- Human 40 bids in the auction, made: 192, 210, 224, 295, 373, 384, 406, 419, 421, 440; failed: 235, 145, 165, 420, 469.
- Human self-raises that failed: 152, 180, 231, 246, 288, 289, 375, 456, 528.
- Human doubles: 181, 183, 217, 225, 229, 292, 328, 343, 453, 457.
- New suit over partner's bid (B4): 373, 374, 387, 394, 399, 415, 423, 426, 454, 543.
- Cuts overcut while holding a trump nobody could beat (rule rejected): 400, 401, 436, 475, 489, 523, 525, 534.

## 10. Scripts

The analysis scripts were scratch files (session scratchpad `research` folder on the VM, not in the repo): `lib.js` (load / rebuild / replay),
`q1.js` (contracts), `q2collect.js` / `q2.js` / `q2b.js` / `habits.js` (auction decisions and habits), `imit.js` / `imit2.js` (agreement for knobs
and prototype rules), `q3.js` (trump fit, contested bids, levels), `q4.js` (opening lead), `q5collect.js` / `q56.js` (card choices, points given away),
`abplay.js` (play-rule what-ifs on logged deals), `calls.js` / `simcal.js` / `spot.js` (what calls show, layout calibration, one decision over many seeds).
They will have to be rewritten if the scratchpad is gone.
