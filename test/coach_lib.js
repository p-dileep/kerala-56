'use strict';
// Coach facts for one logged hand and one seat (docs/claude-plans/2026-11-22_daily-coach-notes.md):
//   cardFacts      - what the seat's own cards cost against best play, with all cards visible
//   judgeCalls     - each bid / pass of the seat, judged from what that seat could see (the bot's Monte Carlo)
//   allCardsBySuit - background: what a team could take with each trump, with all cards visible
const E = require('../src/engine');
const B = require('../src/bot');
const { values, bestCards, handSolver } = require('../src/review');
const { rigHand, toAction } = require('./imitate');
const { rngFrom } = require('./tune');

const MISTAKE_CHIPS = 0.5;
const CACHE_V = 2;           // bump when the facts for a hand change meaning (2: takeover-bot calls not judged)   // a call is a mistake when the player's own view had a call this many expected chips better

const r2 = (x) => Math.round(x * 100) / 100;

// Card facts for all six seats in one pass: one solver, so the best-card searches reuse the table that values() filled.
function cardFactsAll(hand, { maxNodes = 180e6 } = {}) {
  if (hand.players !== 6) return { reason: 'players' };
  if (!hand.played.length) return { reason: 'empty' };
  const S = handSolver(hand, maxNodes);
  const V = values(hand, { solver: S });
  if (!V) return { reason: 'budget' };
  const bt = hand.contract.team, value = hand.contract.value;
  const given = new Array(6).fill(0), cards = [[], [], [], [], [], []];
  hand.played.forEach((p, k) => {
    const cost = E.team(p.seat) === bt ? V[k] - V[k + 1] : V[k + 1] - V[k];
    if (p.auto) return;
    given[p.seat] += cost;
    if (cost < 1) return;
    let best = null, bestReason;
    if (cost >= 2) { const b = bestCards(hand, k, { solver: S, guess: V[k] }); if (b) best = b.cards; else bestReason = 'budget'; }
    cards[p.seat].push({ k, trick: (p.trick ?? Math.floor(k / 6)) + 1, card: p.card.id, cost, best, ...(bestReason ? { bestReason } : {}), flipped: (V[k] >= value) !== (V[k + 1] >= value) });
  });
  const tableAvg = Math.round(given.reduce((a, b) => a + b, 0) / 6 * 10) / 10;
  return [0, 1, 2, 3, 4, 5].map((seat) => ({ best: V[0], playedOut: V[hand.played.length], given: given[seat], tableAvg, cards: cards[seat] }));
}
function cardFacts(hand, seat, opts) {
  const all = cardFactsAll(hand, opts);
  return Array.isArray(all) ? all[seat] : all;
}

// The contract's own trump for the bidding team comes from the played cards (cheap: the search runs backwards from
// the end); every other trump is a solve from the deal, which can take 300M+ positions, hence the larger budget.
function allCardsBySuit(hand, team, { maxNodes = 600e6 } = {}) {
  const leader = hand.played.length ? hand.played[0].seat : (hand.dealer + 1) % hand.players;
  const out = {};
  for (const suit of ['S', 'H', 'D', 'C', 'NT']) {
    let V = null;
    if (hand.players !== 6) V = null;
    else if (hand.played.length && team === hand.contract.team && suit === hand.contract.suit) V = values(hand);
    else V = values({ players: 6, dealt: hand.dealt, contract: { team, suit }, played: [], leader }, { maxNodes });
    out[suit] = V ? V[0] : null;
  }
  return out;
}

// Expected chips of each call the seat could make at this point, from its own view.
function judgeOne(s, seat, act, P, rng) {
  const view = B.botView(s, seat);
  view.bidding = JSON.parse(JSON.stringify(s.bidding));
  const legal = E.legalBidActions(s, seat), b = s.bidding, mult = [1, 2, 4][b.doubled || 0];
  const runs = new Map();
  const run = (suit, decl) => {
    const key = suit + decl;
    if (!runs.has(key)) runs.set(key, B.simRun(view, suit, P, rng, decl));
    return runs.get(key);
  };
  const evBid = (v, suit) => B.evAt(run(suit, seat), v);
  let evPass = 0;
  if (b.high) {
    const r = run(b.high.suit, b.high.seat);
    evPass = E.team(b.high.seat) === E.team(seat) ? B.evAt(r, b.high.value) * mult : -B.evAt(r.map((x) => 56 - x), b.high.value) * mult;
  }
  const cands = [];
  if (legal.pass) cands.push({ call: { type: 'pass' }, ev: evPass });
  if (legal.minBid) {
    const levels = [legal.minBid, ...[40, 48, 56].filter((v) => v > legal.minBid)];
    for (const suit of legal.suits) for (const v of levels) cands.push({ call: { type: 'bid', value: v, suit }, ev: evBid(v, suit) });
  }
  const ev = act.type === 'pass' ? evPass : evBid(act.value, act.suit);
  const alt = cands.reduce((a, c) => (c.ev > a.ev ? c : a), cands[0]);
  return { ev: r2(ev), alt: { call: alt.call, ev: r2(alt.ev) }, loss: r2(Math.max(0, alt.ev - ev)) };
}

function judgeCalls(hand, seat, { deals = 200 } = {}) {
  const P = { ...B.DEFAULT_PARAMS, simDeals: deals };
  const out = [];
  const keepRandom = Math.random;
  let s = null;
  try { s = rigHand(hand); } catch (e) { s = null; }
  try {
    hand.auction.forEach((a, n) => {
      const entry = () => ({ n, call: { type: a.type, value: a.value, suit: a.suit, n: a.n }, judged: false, ...(a.auto ? { auto: true } : {}) });
      if (!s) { if (a.seat === seat) out.push(entry()); return; }
      if (s.phase === 'selfraise' && toAction(s, a) === null) {
        try { E.applyBid(s, s.turn, { type: 'keep' }); } catch (e) { s = null; }
      }
      let act = null;
      if (s && (s.phase === 'bidding' || s.phase === 'selfraise')) { try { act = toAction(s, a); } catch (e) { act = null; } }
      if (!s || !act) { s = null; if (a.seat === seat) out.push(entry()); return; }
      if (a.seat === seat) {
        const e = entry();
        if (!a.auto && s.phase === 'bidding' && s.turn === seat && (act.type === 'pass' || act.type === 'bid')) {   // auto: the takeover bot's call
          const legal = E.legalBidActions(s, seat);
          const ok = act.type === 'pass' ? legal.pass : legal.minBid && act.value >= legal.minBid && legal.suits.includes(act.suit);
          if (ok) {
            const rng = rngFrom((hand.id * 131 + n) >>> 0);
            Math.random = rng;
            Object.assign(e, { judged: true }, judgeOne(s, seat, act, P, rng));
          }
        }
        out.push(e);
      }
      try { E.applyBid(s, a.seat, act); } catch (err) { s = null; }   // logged under older rules: stop judging
    });
  } finally {
    Math.random = keepRandom;
  }
  return out;
}

// One hand for the daily facts run: fill what the cache lacks for these seats. A hand that throws comes back as
// { error } so one bad log line cannot stop every player's note.
function solveHand({ hand, seats, cached }) {
  const c = cached || { v: CACHE_V, id: hand.id, cards: null, allCards: {}, calls: {} };
  try {
    if (!c.cards) c.cards = cardFactsAll(hand);
    for (const seat of seats) {
      const team = seat % 2;
      if (!(team in c.allCards)) c.allCards[team] = allCardsBySuit(hand, team);
      if (!(seat in c.calls)) c.calls[seat] = judgeCalls(hand, seat);
    }
    return c;
  } catch (e) {
    return { v: CACHE_V, id: hand.id, error: String(e && e.message || e) };
  }
}

module.exports = { cardFacts, cardFactsAll, judgeCalls, allCardsBySuit, solveHand, MISTAKE_CHIPS, CACHE_V };
