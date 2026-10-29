'use strict';
/**
 * Self-play tuner for the bot's judgment numbers (src/bot.js DEFAULT_PARAMS).
 * Candidate params play one team against baseline params on the other, then the same deals
 * are replayed with the teams swapped so luck cancels. Score = mean tables gained per match.
 *
 *   node test/tune.js [rounds=6] [matchesPerEval=60]
 */
const E = require('../src/engine'); const B = require('../src/bot');

function rngFrom(seed) {               // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Tables gained by team `candTeam` (playing with cand params) over one match from seed.
function playMatch(seed, cand, base, candTeam) {
  const rng = rngFrom(seed);
  const s = E.newMatch({}, rng);
  let guard = 0;
  while (s.phase !== 'matchover' && guard++ < 200000) {
    if (s.phase === 'handover') { E.nextHand(s, rng); continue; }
    if (s.phase === 'playing' && s.trick.complete) { E.collectTrick(s); continue; }
    const P = E.team(s.turn) === candTeam ? cand : base;
    const d = B.decide(B.botView(s, s.turn), P);
    if (d.kind === 'bid') E.applyBid(s, s.turn, d.action); else E.playCard(s, s.turn, d.cardId);
  }
  return s.tables[candTeam] - s.settings.startingTables;
}

function score(cand, base, matches, seed0 = 1) {
  let total = 0;
  for (let i = 0; i < matches; i++) {
    total += playMatch(seed0 + i, cand, base, 0);
    total += playMatch(seed0 + i, cand, base, 1);
  }
  return total / (2 * matches);
}

// Step tried for each parameter (absolute delta, both directions)
const STEPS = {
  estBase: 1, estPtsW: 0.2, estLenW: 0.4, estJackW: 0.5, estNineW: 0.5, estNtJackW: 0.5, estNtPenalty: 1,
  plusMaxValue: 2, plus2Margin: 1, raiseMargin: 1, raiseMaxValue: 2,
  nsMaxValue: 2, nsMargin: 1,
  bidContestMargin: 1, jumpEst: 2, jumpGap: 2,
  doubleMinValue: 2, doubleMinPts: 1,
  cutMinPts: 1, fightMinPts: 1
};

function tune(rounds, matches, minGain = 0.15) {
  let best = { ...B.DEFAULT_PARAMS };
  const base = { ...B.DEFAULT_PARAMS };
  console.log('self-play sanity (should be ~0):', score(best, base, matches).toFixed(3));
  for (let r = 0; r < rounds; r++) {
    let improved = false;
    const seed0 = 1000 * (r + 1);
    for (const k of Object.keys(STEPS)) {
      const cur = score(best, base, matches, seed0);
      for (const dir of [1, -1]) {
        const cand = { ...best, [k]: +(best[k] + dir * STEPS[k]).toFixed(3) };
        if (cand[k] < 0) continue;
        const sc = score(cand, base, matches, seed0);
        if (sc > cur + minGain) {
          console.log(`round ${r + 1}: ${k} ${best[k]} -> ${cand[k]}  (${cur.toFixed(3)} -> ${sc.toFixed(3)})`);
          best = cand; improved = true; break;
        }
      }
    }
    if (!improved) { console.log(`round ${r + 1}: no further improvement`); break; }
  }
  const final = score(best, base, matches * 3, 777777);
  console.log('tuned vs original on fresh deals, mean tables gained per match:', final.toFixed(3));
  console.log(JSON.stringify(best, null, 2));
  return best;
}

if (require.main === module) {
  const rounds = Number(process.argv[2] || 6), matches = Number(process.argv[3] || 60);
  const t0 = Date.now();
  tune(rounds, matches);
  console.log(`took ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
module.exports = { score, playMatch, rngFrom };
