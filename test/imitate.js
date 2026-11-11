'use strict';
/**
 * Bidding imitation: replay the logged human hands (data/hands.jsonl, from test/fetch_hands.js) and
 * ask the bot, at every human auction decision, what it would have called with the same cards and
 * the same auction so far. Score = how often it agrees with the human; tune DEFAULT_PARAMS towards it.
 *
 *   node test/imitate.js                              agreement report for DEFAULT_PARAMS (and per style)
 *   node test/imitate.js tune [rounds] [keys]         coordinate ascent on the even-id hands, checked on the odd ids
 *   node test/imitate.js ab [matches] [json params]   self-play A/B of params vs DEFAULT_PARAMS (test/tune.js)
 *
 * Decisions inside the self-raise window and hands that no longer replay under today's rules are skipped.
 */
const fs = require('fs'), path = require('path');
const E = require('../src/engine'); const B = require('../src/bot');
const { rngFrom, score: abScore } = require('./tune');

function loadHands(file = path.join(__dirname, '..', 'data', 'hands.jsonl')) {
  return fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
}

// Rebuild the engine state at the start of the logged hand.
function rigHand(h) {
  const s = E.newMatch({ players: h.players || 6 }, () => 0);
  s.dealer = h.dealer; s.handNo = 0;
  E.startHand(s, () => 0);
  const deck = new Map(E.makeDeck(h.players || 6).map((c) => [c.id, c]));
  s.hands = h.dealt.map((ids) => E.sortHand(ids.map((id) => deck.get(id))));
  s.dealt = s.hands.map((x) => x.slice());
  return s;
}

// Logged auction record -> applyBid action (null in the self-raise window = the declarer kept, not logged).
function toAction(s, a) {
  if (s.phase === 'selfraise') {
    if (a.type === 'raise') return { type: 'raise', value: a.value };
    if (a.type === 'redouble') return { type: 'redouble' };
    if (a.type === 'bid' && a.change) return { type: 'change', value: a.value, suit: a.suit };
    return null;
  }
  if (a.type === 'pass') return { type: 'pass' };
  if (a.type === 'bid') return { type: 'bid', value: a.value, suit: a.suit };
  if (a.type === 'plus') {
    const legal = E.legalBidActions(s, a.seat);
    return legal.plusSuit === a.suit && legal.plus.includes(a.n) ? { type: 'plus', n: a.n } : { type: 'plus', n: a.n, suit: a.suit };
  }
  if (a.type === 'ns') return { type: 'ns', value: a.value };
  if (a.type === 'double') return { type: 'double' };
  if (a.type === 'redouble') return { type: 'redouble' };
  throw new Error('unknown logged action ' + a.type);
}

const same = (x, y) => x.type === y.type && (x.type === 'pass' || x.type === 'double' ||
  (x.type === 'plus' ? x.n === y.n && (x.suit || '') === (y.suit || '') : x.value === y.value && x.suit === y.suit));

const TEST_NAMES = /^tester$/i;   // the owner's own test seats: not counted as human play
// Every human decision in the bidding phase: { hand, seat, name, human: action, view }.
function* humanDecisions(hands) {
  for (const h of hands) {
    const humans = new Set(h.seats.map((x, i) => x.kind === 'human' && !TEST_NAMES.test(x.name) ? i : -1).filter((i) => i >= 0));
    if (!humans.size) continue;
    let s;
    try { s = rigHand(h); } catch (e) { continue; }
    for (const a of h.auction) {
      if (s.phase === 'selfraise' && toAction(s, a) === null) {
        try { E.applyBid(s, s.turn, { type: 'keep' }); } catch (e) { break; }
      }
      if (s.phase !== 'bidding' && s.phase !== 'selfraise') break;
      let act;
      try { act = toAction(s, a); } catch (e) { break; }
      if (s.phase === 'bidding' && humans.has(a.seat) && s.turn === a.seat) {
        const view = B.botView(s, a.seat);
        view.bidding = JSON.parse(JSON.stringify(s.bidding));   // snapshot: the engine keeps mutating s.bidding
        const human = act.type === 'plus' ? { ...act, suit: act.suit || view.legal.bid.plusSuit } : act;
        yield { hand: h, seat: a.seat, name: h.seats[a.seat].name, human, view };
      }
      try { E.applyBid(s, a.seat, act); } catch (e) { break; }   // logged under older rules
    }
  }
}

function botCall(d, P) {
  Math.random = rngFrom((d.hand.id * 131 + d.view.bidding.actions.length) >>> 0);
  const c = B.chooseBid(d.view, P);
  if (c.type === 'plus' && !c.suit) c.suit = d.view.legal.bid.plusSuit;
  return c;
}

// Agreement: exact match on calls, pass-for-pass on passes; the headline score is the mean of the two
// rates so the tuner cannot win by always passing (or always calling).
function evaluate(decisions, P, detail = false) {
  const r = { n: 0, passes: 0, passOk: 0, calls: 0, callOk: 0, callType: 0, byType: {}, rows: [] };
  for (const d of decisions) {
    const bot = botCall(d, P);
    r.n++;
    const t = d.human.type;
    r.byType[t] = r.byType[t] || { n: 0, ok: 0 };
    r.byType[t].n++;
    if (t === 'pass') { r.passes++; if (bot.type === 'pass') { r.passOk++; r.byType[t].ok++; } }
    else { r.calls++; if (same(bot, d.human)) { r.callOk++; r.byType[t].ok++; } if (bot.type === t) r.callType++; }
    if (detail) r.rows.push({ id: d.hand.id, name: d.name, seat: d.seat, human: d.human, bot, auction: d.view.bidding.actions.length });
  }
  r.passRate = r.passes ? r.passOk / r.passes : 0;
  r.callRate = r.calls ? r.callOk / r.calls : 0;
  r.callTypeRate = r.calls ? r.callType / r.calls : 0;
  r.score = (r.passRate + r.callRate) / 2;
  return r;
}

const pct = (x) => (100 * x).toFixed(1) + '%';
const fmt = (r) => `n=${r.n}  pass ${r.passOk}/${r.passes} (${pct(r.passRate)})  call exact ${r.callOk}/${r.calls} (${pct(r.callRate)})  call type ${pct(r.callTypeRate)}  score ${(100 * r.score).toFixed(2)}`;

// Bidding knobs and the step tried for each (both directions).
const STEPS = {
  estBase: 1, estPtsW: 0.1, estLenW: 0.25, estJackW: 0.5, estNineW: 0.5, estNtJackW: 0.5, estNtPenalty: 1,
  plusMaxValue: 2, plus2Margin: 1, raiseMargin: 1, raiseMaxValue: 2,
  altMaxValue: 2, altMargin: 1, altGap: 1, nsMaxValue: 2, nsMargin: 1,
  backMaxValue: 2, backGap: 1, backNtMargin: 1, showJackMargin: 1, levelMargin: 1,
  bidContestMargin: 1, jumpEst: 2, jumpGap: 2, doubleMinValue: 2, doubleMinPts: 1,
  probeMaxValue: 1, probeSlack: 1,
  readJackW: 0.5, readNineW: 0.5, readLenW: 0.5, readPassW: 0.5, readCutW: 0.5, plusSlack: 1, simMinValue: 1,
  simConf: 0.05, simMargin: 1, backSlack: 1
};
const LOWER = { simConf: 0.5, showJackMargin: -3, altMargin: -3, backNtMargin: -3, nsMargin: -3 };
const UPPER = { simConf: 0.95 };

function tune(decisions, rounds, keys = Object.keys(STEPS), minGain = 0.002) {
  const train = decisions.filter((d) => d.hand.id % 2 === 0), test = decisions.filter((d) => d.hand.id % 2 === 1);
  let best = { ...B.DEFAULT_PARAMS };
  let cur = evaluate(train, best).score;
  console.log(`train ${train.length} decisions (even hand ids), test ${test.length} (odd)`);
  console.log('start  train:', fmt(evaluate(train, best)));
  console.log('start  test :', fmt(evaluate(test, best)));
  for (let r = 0; r < rounds; r++) {
    let improved = false;
    for (const k of keys) {
      for (const dir of [1, -1]) {
        const v = +(best[k] + dir * STEPS[k]).toFixed(3);
        if (v < (LOWER[k] ?? 0) || v > (UPPER[k] ?? Infinity)) continue;
        const cand = { ...best, [k]: v };
        const sc = evaluate(train, cand).score;
        if (sc > cur + minGain) {
          console.log(`round ${r + 1}: ${k} ${best[k]} -> ${v}  (${(100 * cur).toFixed(2)} -> ${(100 * sc).toFixed(2)})`);
          best = cand; cur = sc; improved = true; break;
        }
      }
    }
    if (!improved) { console.log(`round ${r + 1}: no further improvement`); break; }
  }
  console.log('tuned  train:', fmt(evaluate(train, best)));
  console.log('tuned  test :', fmt(evaluate(test, best)));
  console.log('tuned  all  :', fmt(evaluate(decisions, best)));
  const diff = Object.fromEntries(Object.entries(best).filter(([k, v]) => v !== B.DEFAULT_PARAMS[k]));
  console.log('changes:', JSON.stringify(diff));
  return best;
}

if (require.main === module) {
  const mode = process.argv[2] || 'report';
  const t0 = Date.now();
  const hands = loadHands();
  const decisions = [...humanDecisions(hands)];
  console.log(`${hands.length} hands, ${decisions.length} human bidding decisions`);
  if (mode === 'report') {
    for (const style of ['medium', 'defensive', 'aggressive']) console.log(style.padEnd(10), fmt(evaluate(decisions, B.paramsFor(style))));
    const r = evaluate(decisions, B.DEFAULT_PARAMS, true);
    console.log('by type:', Object.entries(r.byType).map(([t, x]) => `${t} ${x.ok}/${x.n}`).join('  '));
    const kinds = {};
    for (const m of r.rows.filter((x) => !same(x.bot, x.human))) { const k = `${m.human.type}->${m.bot.type}`; kinds[k] = (kinds[k] || 0) + 1; }
    console.log('disagreements human->bot:', JSON.stringify(kinds));
  } else if (mode === 'tune') {
    const rounds = Number(process.argv[3] || 4);
    const keys = process.argv[4] ? process.argv[4].split(',') : undefined;
    const best = tune(decisions, rounds, keys);
    fs.writeFileSync(path.join(__dirname, '..', 'data', 'imitate_params.json'), JSON.stringify(best, null, 2));
    console.log('written data/imitate_params.json');
  } else if (mode === 'ab') {
    const matches = Number(process.argv[3] || 100);
    const P = { ...B.DEFAULT_PARAMS, ...JSON.parse(process.argv[4] || fs.readFileSync(path.join(__dirname, '..', 'data', 'imitate_params.json'), 'utf8')) };
    console.log('control (default vs default):', abScore(B.DEFAULT_PARAMS, B.DEFAULT_PARAMS, Math.min(matches, 50), 4242).toFixed(3));
    console.log(`tuned vs default, ${matches} matches side-swapped, tables/match:`, abScore(P, B.DEFAULT_PARAMS, matches, 4242).toFixed(3));
  }
  console.log(`took ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
module.exports = { loadHands, humanDecisions, evaluate, tune };
