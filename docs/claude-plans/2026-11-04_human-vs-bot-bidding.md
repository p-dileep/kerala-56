# Human vs bot bidding — first look (2026-11-04)

Data: `data/hands.jsonl`, 120 hands (2026-11-01 .. 11-03), 119 six-player, 11 humans.
Method: every logged auction replayed through `src/engine.js` with the logged deal; at each
human decision the current bot (`DEFAULT_PARAMS`, i.e. 'medium') was asked what it would do.
Replay check: bots' logged calls match the current bot (own personality params) 1481/1499 = 99%.
Scripts (scratch, not in repo): `analyze_bids.js`, `drill.js`, `selfplay.js`.

## Findings

1. **Humans call far more often than the bot would in the same spot.**
   - Opponents hold the bid: humans call 42%, bot 15%.
   - Partner holds the bid: humans call 48%, bot 24%.
   - 137 human bids where the bot would pass; 31 human passes where the bot would call (20 of those are Plus signals humans skip).
   - Same action type overall: 298/514 (58%).
2. **Humans bid above the bot's hand estimate.** Bid value minus `estimateFor` in the named suit: humans +3.2 on average (34% are 5+ above), bots +0.6 (8%).
3. **But human contracts make more.**
   - Made rate: human declarer 38/49 (78%), bot declarer 40/71 (56%).
   - At 33-39: human 18/26, bot 12/32.
   - Chips: human declaring teams +13 net, bot declaring teams -18 net.
   - Human made rate barely depends on how far the bid is above the bot estimate (9+ above: 10/14 made). The single-hand estimate does not predict what humans make.
4. **Bots make fewer contracts with humans at the table than against each other.** 400 bot-only 'mixed' hands make 69% (33-39: 54/85 = 64%). Live, bots make 56% (33-39: 38%). Even bot contracts where the estimate already covered the value made only 7/12. The likely causes are humans defending better, or competitive auctions pushing bots higher. Bidding alone does not explain it.
5. **Partner holds the bid.**
   - Humans more often name another suit (48) than raise partner (37), and raise by small steps (+1.5).
   - Bots raise by +4.5 on average (straight level jumps to 40).
   - Humans reach 40 through the self-raise instead: 6 of the 9 logged raises are human, and the bot would have kept every one.
6. **Doubles.** Humans doubled 11 times (Vijith 9) where the bot would pass. Only 2 of the 11 were set. The bot's strict double rule (`doubleMinValue 44`) looks right.

## Caveats
- Small sample: 49 human contracts, and most human players have fewer than 35 decisions.
- The declarer is whoever bid highest, so the comparison has selection bias.
- Declarer and defence play skill are mixed in with bidding.
- Play stops early once the result is decided, so points minus value is not a usable margin.
- Hands logged before the 27+N opening rule change replayed without errors, but the bot code changed over these days.

## Implications for tuning (not done)
- Do not simply make bots bid more. Bots already fail more often live, so first look at how bot-declared contracts lose to human defenders (the `played` log).
- The Plus signal is the main thing humans skip that bots do. Bot partners of humans therefore get less information.
- Re-run at ~300+ hands. Per-player calibration (e.g. Vijith's 59% call rate) becomes meaningful there.
