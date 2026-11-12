'use strict';
/**
 * Par check for bot bidding. Each deal is bid and played by the bots as usual; then the same deal is
 * replayed with every strain (four suits and no-trump) forced as the contract for each team, the bots
 * playing the cards, to see what each team could really have made. "Par" is the chips that change
 * hands when both teams bid that deal perfectly; the gap between par and what the auction earned is
 * the bidding error on that deal, in chips.
 *
 *   node test/par.js [deals=300] [seed0=1] [style=medium] [players=6]     report
 *   node test/par.js show [n=10] [deals=300] [seed0=1] [style] [category] worst deals, with hands and auction
 *   node test/par.js tune [rounds=3] [deals=400] [keys=all]               tune the bidding knobs by duplicate play
 *   node test/par.js screen [deals=600] [keys=all] [seed0]                each knob one step either way, against the default
 *   node test/par.js ab [deals=1000] [style | json params] [matches=0]    params against the default bot
 *
 * Par rules: the team that can make more declares at its best value and wins that tier's chips
 * (28-39 = 1, 40-47 = 2, 48-55 = 3, 56 = 4); a tie goes to the opener's team. When the opener's team
 * can make nothing, the other team takes at least the 2 chips of the forced 28 going down.
 * Doubles are not part of par. Hands void under the no-trump-in-defence rule are skipped.
 */
const E = require('../src/engine'); const B = require('../src/bot');
const { rngFrom, score: abScore } = require('./tune');
const { STEPS, LOWER, UPPER } = require('./imitate');

const STRAINS = [...E.SUITS, 'NT'];
const tier = (v) => E.bidBaseTables(v).win;

// Points `teamIdx` takes over the whole hand as the bidding side in `suit` (all tricks played, no
// early stop), on the deal in `s` or on other `hands`. The players know the auction in `bidding`.
function playOut(s, teamIdx, suit, hands = s.dealt, bidding = s.bidding) {
  const hs = hands[0].length;
  const st = {
    settings: s.settings, phase: 'playing', handNo: s.handNo, dealer: s.dealer, tables: [99, 99],
    hands: hands.map((h) => h.slice()), bidding, history: [], winner: null, log: [], result: null,
    contract: { seat: teamIdx, team: teamIdx, value: 56, suit, hasJack: false, mult: 1 },
    trick: { leader: s.bidding.opener, cards: [], complete: false, winner: null }, turn: s.bidding.opener,
    tricksTaken: [0, 0], points: [0, 0], played: [], trickNo: 0, lastTrick: null
  };
  while (st.trickNo < hs) {
    if (st.trick.complete) {
      const w = st.trick.winner;
      st.points[E.team(w)] += st.trick.points; st.trickNo++;
      st.trick = { leader: w, cards: [], complete: false, winner: null }; st.turn = w;
      continue;
    }
    E.playCard(st, st.turn, B.choosePlay(B.botView(st, st.turn), B.DEFAULT_PARAMS));
  }
  return st.points[teamIdx];
}

// Teamwork value: what `teamIdx` should bid in `suit` if its players saw each other's hands but not the
// opponents'. The opponents' cards are reshuffled among them `layouts` times; the bid is the level
// (28 / 40 / 48 / 56) with the best expected chips over those layouts. Returns { suit, bid, ev }.
function teamValue(s, teamIdx, suit, layouts, rng) {
  const oppSeats = s.dealt.map((_, i) => i).filter((i) => E.team(i) !== teamIdx);
  const oppCards = oppSeats.flatMap((i) => s.dealt[i]);
  const hs = s.dealt[0].length, quiet = { ...s.bidding, actions: [] };
  const res = [];
  for (let k = 0; k < layouts; k++) {
    const sh = E.shuffle(oppCards, rng);
    const hands = s.dealt.map((h) => h.slice());
    oppSeats.forEach((seat, j) => { hands[seat] = E.sortHand(sh.slice(j * hs, (j + 1) * hs)); });
    res.push(playOut(s, teamIdx, suit, hands, quiet));
  }
  return E.LEVELS.map((bid) => {
    const p = res.filter((x) => x >= bid).length / layouts, t = E.bidBaseTables(bid);
    return { suit, bid, ev: p * t.win - (1 - p) * t.lose };
  }).sort((a, b) => b.ev - a.ev)[0];
}

const sign = (t) => (t === 0 ? 1 : -1);

// The bots bid and play one seeded deal. P = params for every seat, or seat -> params. Returns the engine state.
function bidAndPlay(seed, P, players = 6) {
  const paramsOf = typeof P === 'function' ? P : () => P;
  const rng = rngFrom(seed);
  Math.random = rngFrom(seed ^ 0x9e3779b9);     // the bot's Monte Carlo layouts: same for every candidate
  const s = E.newMatch({ players }, rng);
  while (s.phase === 'bidding' || s.phase === 'selfraise') E.applyBid(s, s.turn, B.decide(B.botView(s, s.turn), paramsOf(s.turn)).action);
  while (s.phase === 'playing') {
    if (s.trick.complete) { E.collectTrick(s); continue; }
    E.playCard(s, s.turn, B.decide(B.botView(s, s.turn), paramsOf(s.turn)).cardId);
  }
  return s;
}

// One deal: the bots' own auction and play, then the forced replays (and, with `layouts`, the teamwork value).
function playDeal(seed, P, players = 6, layouts = 0) {
  const s = bidAndPlay(seed, P, players);
  if (s.result.void) return { seed, void: true };
  const r = s.result, c = r.contract;
  const actual0 = sign(r.receiver) * r.amount;

  // what each team makes in each strain it could have been in
  const pts = [{}, {}];
  for (const t of [0, 1]) for (const x of STRAINS) {
    const holds = (tt) => s.dealt.some((h, i) => E.team(i) === tt && h.some((cd) => cd.suit === x));
    if (x !== 'NT' && (!holds(t) || !holds(1 - t))) continue;
    pts[t][x] = playOut(s, t, x);
  }
  const best = pts.map((p) => Object.entries(p).sort((a, b) => b[1] - a[1])[0]).map(([suit, v]) => ({ suit, pts: v }));
  const O = E.team(s.bidding.opener);
  let parTeam, parChips;
  if (best[O].pts < 28) { parTeam = 1 - O; parChips = Math.max(2, best[1 - O].pts >= 28 ? tier(best[1 - O].pts) : 0); }
  else { parTeam = best[0].pts === best[1].pts ? O : best[0].pts > best[1].pts ? 0 : 1; parChips = tier(best[parTeam].pts); }
  const par0 = sign(parTeam) * parChips;

  // who erred, and how
  const D = c.team, actD = sign(D) * actual0, parD = sign(D) * par0;
  let cat, erring = D;
  if (actD === parD) { cat = 'par'; erring = null; }
  else if (actD > parD && r.made && parD > 0) { cat = 'par'; erring = null; }               // made a doubled par contract
  else if (r.made && parD > 0) cat = 'missed level';
  else if (r.made) { cat = 'sold out'; erring = 1 - D; }
  else if (actD > parD) { cat = 'cheap save'; erring = null; }                               // went down for less than par gives away
  else if (best[D].pts >= c.value) cat = 'wrong suit';
  else if (parD > 0) cat = 'too high';
  else cat = 'outbid the stronger side';
  const out = { seed, s, contract: c, made: r.made, points: r.points, actual0, par0, parTeam, best, pts, cat, erring,
    gap: Math.abs(actual0 - par0), doubled: c.mult > 1 };
  if (layouts) {
    // perfect teamwork: each team's best strain and level by expected chips; the team with more to gain declares
    const lr = rngFrom(seed ^ 0x51f15e);
    out.tv = [0, 1].map((t) => Object.keys(pts[t]).map((x) => teamValue(s, t, x, layouts, lr)).sort((a, b) => b.ev - a.ev)[0]);
    const T = out.tv[0].ev === out.tv[1].ev ? O : out.tv[0].ev > out.tv[1].ev ? 0 : 1;
    const bid = out.tv[T].bid, base = E.bidBaseTables(bid);
    out.coopTeam = T; out.coopBid = bid; out.coopSuit = out.tv[T].suit;
    out.coopMade = pts[T][out.tv[T].suit] >= bid;
    out.coop0 = sign(T) * (out.coopMade ? base.win : -base.lose);
  }
  return out;
}

function run(P, deals, seed0 = 1, players = 6, layouts = 0) {
  const out = [];
  for (let i = 0; i < deals; i++) out.push(playDeal(seed0 + i, P, players, layouts));
  return out;
}
const meanGap = (rows) => { const live = rows.filter((d) => !d.void); return live.reduce((a, d) => a + d.gap, 0) / live.length; };

const CATS = ['par', 'missed level', 'sold out', 'too high', 'wrong suit', 'outbid the stronger side', 'cheap save'];
const NOTE = {
  'par': 'right team, right level',
  'missed level': 'made, but a higher level (40 / 48 / 56) was there',
  'sold out': 'the stronger team let the other side play and make',
  'too high': 'right team, went down: a lower bid was the limit',
  'wrong suit': 'went down, but the value was there in another suit',
  'outbid the stronger side': 'went down bidding over a team that could make more',
  'cheap save': 'went down, cheaper than letting the other side make theirs'
};

function report(rows) {
  const live = rows.filter((d) => !d.void), n = live.length;
  const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  console.log(`${rows.length} deals, ${rows.length - n} void.  Gap to par: ${meanGap(rows).toFixed(3)} chips per hand`);
  console.log(`contracts made ${(100 * live.filter((d) => d.made).length / n).toFixed(1)}%   average bid ${avg(live.map((d) => d.contract.value)).toFixed(1)}` +
    `   average best makeable (stronger team) ${avg(live.map((d) => Math.max(d.best[0].pts, d.best[1].pts))).toFixed(1)}   doubled ${live.filter((d) => d.doubled).length}`);
  console.log('\ncategory                    hands  share  chips lost  per hand   bid   makeable');
  for (const k of CATS) {
    const g = live.filter((d) => d.cat === k);
    if (!g.length) continue;
    const mk = avg(g.map((d) => d.best[k === 'sold out' ? 1 - d.contract.team : d.contract.team].pts));
    console.log(`${k.padEnd(26)} ${String(g.length).padStart(6)} ${(100 * g.length / n).toFixed(1).padStart(5)}% ${String(g.reduce((a, d) => a + d.gap, 0)).padStart(10)} ` +
      `${(g.reduce((a, d) => a + d.gap, 0) / n).toFixed(3).padStart(9)} ${avg(g.map((d) => d.contract.value)).toFixed(1).padStart(6)} ${mk.toFixed(1).padStart(8)}   ${NOTE[k]}`);
  }
  // level reached against the level that was there, for hands the stronger team declared and made
  const T = ['28-39', '40-47', '48-55', '56'];
  console.log('\nstronger team declared and made: level bid (rows) against level makeable (columns)');
  console.log('          ' + T.map((x) => x.padStart(7)).join(''));
  for (let a = 1; a <= 4; a++) {
    const g = live.filter((d) => d.made && d.contract.team === d.parTeam && tier(d.contract.value) === a);
    console.log(`  ${T[a - 1].padEnd(8)}` + [1, 2, 3, 4].map((m) => String(g.filter((d) => tier(d.best[d.parTeam].pts) === m).length).padStart(7)).join(''));
  }
  if (!live[0].tv) return;
  // Teamwork: the team with more to gain (its players seeing each other's cards) declares at its best level.
  const coop = avg(live.map((d) => sign(d.coopTeam) * d.coop0)), act = avg(live.map((d) => sign(d.coopTeam) * d.actual0));
  console.log(`\nperfect teamwork (a team sees its own three hands and bids the level with the best expected chips):`);
  console.log(`  stronger team would bid ${avg(live.map((d) => d.coopBid)).toFixed(1)} on average and make ${(100 * live.filter((d) => d.coopMade).length / n).toFixed(1)}%, ` +
    `earning ${coop.toFixed(3)} chips per hand; the auction earned it ${act.toFixed(3)}  (headroom ${(coop - act).toFixed(3)})`);
  console.log('  that team in the auction (rows) against its teamwork level (columns)');
  console.log('                 ' + T.map((x) => x.padStart(7)).join(''));
  const rowOf = (d) => (d.contract.team !== d.coopTeam ? 0 : !d.made ? 5 : tier(d.contract.value));
  [['did not declare', 0], ...T.map((x, i) => [x + ' made', i + 1]), ['went down', 5]].forEach(([label, k]) => {
    const g = live.filter((d) => rowOf(d) === k);
    console.log(`  ${label.padEnd(15)}` + [1, 2, 3, 4].map((m) => String(g.filter((d) => tier(d.coopBid) === m).length).padStart(7)).join(''));
  });
}

function showDeal(d) {
  const SYM = { S: '♠', H: '♥', D: '♦', C: '♣' };
  console.log(`\n--- seed ${d.seed}: ${d.cat} (${d.gap} chips), team ${'AB'[d.erring]} erred`);
  d.s.dealt.forEach((h, i) => console.log(`  seat ${i + 1} ${'AB'[E.team(i)]}  ` +
    E.SUITS.map((x) => SYM[x] + ' ' + (h.filter((c) => c.suit === x).map((c) => c.rank).join(' ') || '-')).join('   ')));
  console.log('  ' + d.s.log.filter((l) => /^(Call|Contract)/.test(l)).map((l) => l.replace(/^Call: /, '')).join(' | '));
  console.log(`  result: ${d.made ? 'made' : 'down'} with ${d.points[d.contract.team]} points, team A ${d.actual0 >= 0 ? '+' : ''}${d.actual0} chips; par team A ${d.par0 >= 0 ? '+' : ''}${d.par0}`);
  for (const t of [0, 1]) console.log(`  team ${'AB'[t]} makes: ` + Object.entries(d.pts[t]).map(([x, v]) => `${SYM[x] || x} ${v}`).join('  '));
  if (d.tv) console.log(`  teamwork: team ${'AB'[d.coopTeam]} bids ${d.coopBid} ${SYM[d.coopSuit] || d.coopSuit} (${d.coopMade ? 'makes' : 'down'}); expected chips A ${d.tv[0].ev.toFixed(2)}, B ${d.tv[1].ev.toFixed(2)}`);
}

// Duplicate play: every deal is played twice, the candidate on team A then on team B, the baseline on the
// other team, same cards and same Monte Carlo layouts. Returns the candidate's chips per hand and its standard error.
const chips0 = (s) => (s.result.void ? 0 : sign(s.result.receiver) * s.result.amount);
function duel(cand, base, deals, seed0 = 1, players = 6) {
  const diffs = [];
  for (let i = 0; i < deals; i++) {
    let d = 0;
    for (const ct of [0, 1]) d += sign(ct) * chips0(bidAndPlay(seed0 + i, (seat) => (E.team(seat) === ct ? cand : base), players));
    diffs.push(d / 2);
  }
  const m = diffs.reduce((x, y) => x + y, 0) / deals;
  const se = Math.sqrt(diffs.reduce((x, y) => x + (y - m) * (y - m), 0) / (deals - 1) / deals);
  return { mean: m, se };
}

// Coordinate ascent on the bidding knobs, scored by duplicate play. A step is kept only when it beats
// the best so far by at least `minGain` chips per hand and by two standard errors.
function tune(rounds, deals, keys = Object.keys(STEPS), minGain = 0.03) {
  const base = { ...B.DEFAULT_PARAMS };
  let best = { ...base };
  for (let r = 0; r < rounds; r++) {
    let improved = false;
    for (const k of keys) {
      for (const dir of [1, -1]) {
        const v = +(best[k] + dir * STEPS[k]).toFixed(3);
        if (v < (LOWER[k] ?? 0) || v > (UPPER[k] ?? Infinity)) continue;
        const cand = { ...best, [k]: v };
        const step = duel(cand, best, deals, 100000 * (r + 1));
        if (step.mean > minGain && step.mean > 2 * step.se) {
          console.log(`round ${r + 1}: ${k} ${best[k]} -> ${v}  (+${step.mean.toFixed(3)} +/- ${step.se.toFixed(3)} chips per hand over the previous best)`);
          best = cand; improved = true; break;
        }
      }
    }
    if (!improved) { console.log(`round ${r + 1}: no further improvement`); break; }
  }
  const diff = Object.fromEntries(Object.entries(best).filter(([k, v]) => v !== base[k]));
  console.log('changes:', JSON.stringify(diff));
  const f = duel(best, base, deals * 2, 900000);
  console.log(`fresh deals (${deals * 2}): tuned vs default ${f.mean.toFixed(3)} +/- ${f.se.toFixed(3)} chips per hand`);
  return best;
}

if (require.main === module) {
  const a = process.argv.slice(2), t0 = Date.now();
  const styleP = (x) => (x && x.trim().startsWith('{') ? { ...B.DEFAULT_PARAMS, ...JSON.parse(x) } : B.paramsFor(x || 'medium'));
  if (a[0] === 'tune') {
    tune(Number(a[1] || 3), Number(a[2] || 400), a[3] ? a[3].split(',') : undefined);
  } else if (a[0] === 'screen') {
    // every knob one step up and one step down against the default, each on the same deals
    const deals = Number(a[1] || 600), seed0 = Number(a[3] || 300000);
    for (const k of a[2] ? a[2].split(',') : Object.keys(STEPS)) for (const dir of [1, -1]) {
      const v = +(B.DEFAULT_PARAMS[k] + dir * STEPS[k]).toFixed(3);
      if (v < (LOWER[k] ?? 0) || v > (UPPER[k] ?? Infinity)) continue;
      const f = duel({ ...B.DEFAULT_PARAMS, [k]: v }, B.DEFAULT_PARAMS, deals, seed0);
      console.log(`${k.padEnd(16)} ${String(B.DEFAULT_PARAMS[k]).padStart(5)} -> ${String(v).padEnd(5)} ${(f.mean >= 0 ? '+' : '') + f.mean.toFixed(3)} +/- ${f.se.toFixed(3)}${Math.abs(f.mean) > 2.5 * f.se ? '  *' : ''}`);
    }
  } else if (a[0] === 'ab') {
    // params (json or style) against the default: duplicate chips per hand, then whole matches (test/tune.js)
    const deals = Number(a[1] || 1000), P = styleP(a[2]);
    const f = duel(P, B.DEFAULT_PARAMS, deals, 700000);
    console.log(`duplicate, ${deals} deals: ${f.mean.toFixed(3)} +/- ${f.se.toFixed(3)} chips per hand`);
    const matches = Number(a[3] || 0);
    if (matches) console.log(`matches, ${matches} side-swapped: ${abScore(P, B.DEFAULT_PARAMS, matches, 4242).toFixed(3)} tables per match`);
  } else if (a[0] === 'show') {
    const rows = run(styleP(a[4]), Number(a[2] || 300), Number(a[3] || 1), 6, 24).filter((d) => !d.void && d.gap > 0 && (!a[5] || d.cat === a[5]));
    rows.sort((x, y) => y.gap - x.gap).slice(0, Number(a[1] || 10)).forEach(showDeal);
  } else {
    report(run(styleP(a[2]), Number(a[0] || 300), Number(a[1] || 1), Number(a[3] || 6), 24));
  }
  console.log(`took ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
module.exports = { bidAndPlay, playDeal, playOut, teamValue, run, meanGap, report, duel, tune };
