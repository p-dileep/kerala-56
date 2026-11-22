'use strict';
// Coach facts for one hand and one seat (test/coach_lib.js): card costs, call judging, all-cards values.
const assert = require('assert');
const E = require('../src/engine');
const B = require('../src/bot');
const { rigHand } = require('./imitate');
const { bidAndPlay } = require('./par');
const { cardFacts, cardFactsAll, judgeCalls, allCardsBySuit, MISTAKE_CHIPS } = require('./coach_lib');

const t0 = Date.now();
const DEALS = 60;

// A logged-hand object: seat 1 holds `mine`, the rest of the deck goes round the other seats in deck order;
// `calls(s)` returns the next [seat, action] for the rigged engine state, or null when done.
function logged(id, mine, calls) {
  const rest = E.makeDeck(6).map((c) => c.id).filter((x) => !mine.includes(x));
  const dealt = [[], mine.slice(), [], [], [], []];
  rest.forEach((x, i) => dealt[[0, 2, 3, 4, 5][i % 5]].push(x));
  const h = { id, players: 6, dealer: 5, dealt, auction: [], contract: null, played: [], result: null, seats: dealt.map(() => ({ kind: 'bot', pid: null })) };
  const s = rigHand(h);
  assert.equal(s.bidding.opener, 0);
  for (let c = calls(s); c; c = calls(s)) E.applyBid(s, c[0], c[1]);
  h.auction = JSON.parse(JSON.stringify(s.bidding.actions));
  h.contract = s.contract || (s.bidding.high && { ...s.bidding.high, team: E.team(s.bidding.high.seat), mult: 1 });
  return h;
}
// Seat 0 opens 28 Hearts, seat 1 does `act`, everyone else passes (seat 0 keeps in the self-raise window).
const after28 = (act) => (s) => {
  if (s.phase === 'selfraise') return [s.turn, { type: 'keep' }];
  if (s.phase !== 'bidding') return null;
  const n = s.bidding.actions.length;
  if (n === 0) return [0, { type: 'bid', value: 28, suit: 'H' }];
  if (n === 1) return [1, act];
  return [s.turn, { type: 'pass' }];
};

const STRONG = ['JS0', 'JS1', '9S0', '9S1', 'AS0', 'AS1', '10S0', '10S1'];
const WEAK = ['KS0', 'QS0', 'KH0', 'QH0', 'KD0', 'QD0', 'KC0', 'QC0'];

{ // a hand full of top Spades that passed: a judged mistake, the better call a Spade bid
  const c = judgeCalls(logged(1, STRONG, after28({ type: 'pass' })), 1, { deals: DEALS });
  assert.equal(c.length, 1);
  assert.ok(c[0].judged && c[0].loss >= MISTAKE_CHIPS, JSON.stringify(c[0]));
  assert.equal(c[0].alt.call.type, 'bid');
  assert.equal(c[0].alt.call.suit, 'S');
  console.log('strong pass is a mistake');
  // the same pass made by the takeover bot for an away player is nobody's call
  const h = logged(1, STRONG, after28({ type: 'pass' }));
  h.auction = h.auction.map((a) => (a.seat === 1 ? { ...a, auto: true } : a));
  const ca = judgeCalls(h, 1, { deals: DEALS });
  assert.ok(ca.length === 1 && ca[0].judged === false && ca[0].auto === true, JSON.stringify(ca));
  console.log('takeover calls not judged');
}

{ // a pointless hand that passed: no mistake
  const c = judgeCalls(logged(2, WEAK, after28({ type: 'pass' })), 1, { deals: DEALS });
  assert.ok(c[0].judged && c[0].loss < MISTAKE_CHIPS, JSON.stringify(c[0]));
  console.log('weak pass is fine');
}

{ // the same pointless hand bidding 40 Hearts: a mistake, passing was better
  const c = judgeCalls(logged(3, WEAK, after28({ type: 'bid', value: 40, suit: 'H' })), 1, { deals: DEALS });
  assert.ok(c[0].judged && c[0].loss >= MISTAKE_CHIPS, JSON.stringify(c[0]));
  assert.equal(c[0].alt.call.type, 'pass');
  console.log('weak 40 is a mistake');
}

{ // a Plus is listed but not judged; a replay that breaks leaves later calls unjudged without throwing
  // seat 1 holds both Heart Jacks; its partner seat 3 bids Hearts, and seat 1 says Plus over it on its next turn
  const both = ['JH0', 'JH1', 'KS0', 'QS0', 'KD0', 'QD0', 'KC0', 'QC0'];
  const h = logged(4, both, (s) => {
    if (s.phase === 'selfraise') return [s.turn, { type: 'keep' }];
    if (s.phase !== 'bidding') return null;
    const n = s.bidding.actions.length;
    if (n === 0) return [0, { type: 'bid', value: 28, suit: 'S' }];
    if (s.turn === 3 && n < 6) return [3, { type: 'bid', value: 29, suit: 'H' }];
    if (s.turn === 1 && n > 1 && !s.bidding.actions.some((a) => a.type === 'plus')) {
      const legal = E.legalBidActions(s, 1);
      if (legal.plus.length) return [1, { type: 'plus', n: legal.plus[0] }];
    }
    return [s.turn, { type: 'pass' }];
  });
  assert.ok(h.auction.some((a) => a.type === 'plus' && a.seat === 1), 'the engine offered seat 1 a Plus');
  const c = judgeCalls(h, 1, { deals: DEALS });
  assert.ok(c.some((x) => x.call.type === 'plus' && x.judged === false), JSON.stringify(c));
  assert.ok(c[0].call.type === 'pass' && c[0].judged, 'the pass before it is judged');

  const broken = { ...h, auction: h.auction.map((a, i) => (i === 1 ? { seat: 1, type: 'bid', value: 20, suit: 'H' } : a)) };
  const c1 = judgeCalls(broken, 1, { deals: DEALS });
  assert.ok(c1.length >= 1 && c1.every((x) => x.judged === false), JSON.stringify(c1));
  console.log('plus not judged; broken replay safe');
}

// A bot-played 6-player hand as the server logs it.
function playedHand(seed) {
  const s = bidAndPlay(seed, { ...B.DEFAULT_PARAMS });
  return { id: 100 + seed, players: 6, dealer: s.dealer, dealt: s.dealt.map((h) => h.map((c) => c.id)), auction: s.bidding.actions,
    contract: s.result.contract, played: s.played.map((p) => ({ seat: p.seat, card: { id: p.card.id }, trick: p.trick })), result: s.result,
    seats: s.dealt.map(() => ({ kind: 'bot', pid: null })) };
}
const full = (() => { for (let seed = 1; seed < 400; seed++) { const h = playedHand(seed); if (!h.result.void && h.played.length === 48) return h; } return null; })();

{ // card facts: only my own non-auto cards, costs >= 1, best cards for costs >= 2, budget and 8 players
  const all = cardFactsAll(full);
  const seat = all.findIndex((f) => f.cards.some((x) => x.cost >= 2));
  assert.ok(seat >= 0, 'some seat lost 2+ points on one card');
  const f = all[seat];
  assert.ok(f.cards.every((x) => full.played[x.k].seat === seat && x.cost >= 1));
  assert.ok(f.cards.every((x) => (x.cost >= 2 ? Array.isArray(x.best) && !x.best.some((id) => id.slice(0, -1) === x.card.slice(0, -1)) : x.best === null)));
  assert.equal(f.given, f.cards.reduce((a, x) => a + x.cost, 0));
  assert.ok(Math.abs(f.tableAvg - all.reduce((a, x) => a + x.given, 0) / 6) < 0.051);
  const k = f.cards[0].k;
  const auto = { ...full, played: full.played.map((p, i) => (i === k ? { ...p, auto: true } : p)) };
  assert.ok(!cardFacts(auto, seat).cards.some((x) => x.k === k), 'an auto card is not mine');
  assert.deepEqual(cardFacts({ ...full, players: 8 }, 0), { reason: 'players' });
  assert.deepEqual(cardFacts(full, 0, { maxNodes: 1000 }), { reason: 'budget' });
  assert.deepEqual(cardFacts({ ...full, players: 8 }, 0), { reason: 'players' });
  assert.deepEqual(cardFacts({ ...full, played: [] }, 0), { reason: 'empty' });
  { // budget spent after values(): costly cards say why there is no best card
    const n = require('../src/review').values(full).nodes;
    const tight = cardFactsAll(full, { maxNodes: n + 10 });
    const costly = tight.flatMap((x) => x.cards).filter((x) => x.cost >= 2);
    assert.ok(costly.length && costly.every((x) => Array.isArray(x.best) || x.bestReason === 'budget'), 'a best card or a reason');
    assert.ok(costly.some((x) => x.best === null && x.bestReason === 'budget'), JSON.stringify(costly));
  }
  console.log('card facts');
}

{ // all cards visible: the bidding team's own trump value matches the card review's best
  const a = allCardsBySuit(full, full.contract.team, { maxNodes: 1000 });   // other trumps run out of budget here
  assert.deepEqual(Object.keys(a), ['S', 'H', 'D', 'C', 'NT']);
  assert.equal(a[full.contract.suit], require('../src/review').values(full)[0]);
  assert.ok(Object.entries(a).every(([s, v]) => s === full.contract.suit || v === null));
  // a short ending solves every trump from the deal within the normal budget
  const tail = { ...full, dealt: full.dealt.map((h, seat) => h.filter((id) => full.played.some((p, k) => k >= 36 && p.seat === seat && p.card.id === id))), played: full.played.slice(36) };
  const t = allCardsBySuit(tail, 1 - full.contract.team);
  assert.ok(Object.values(t).every((v) => typeof v === 'number' && v >= 0 && v <= 56), JSON.stringify(t));
  console.log('all cards by suit');
}

{ // one broken hand gives an error entry, not a crash of the whole run
  const { solveHand } = require('./coach_lib');
  const c = solveHand({ hand: { ...full, auction: undefined }, seats: [0], cached: null });
  assert.ok(typeof c.error === 'string' && c.id === full.id, JSON.stringify(c));
  const ok = solveHand({ hand: { ...full, dealt: full.dealt }, seats: [], cached: { v: 1, id: full.id, cards: { reason: 'budget' }, allCards: {}, calls: {} } });
  assert.deepEqual(ok.cards, { reason: 'budget' });
  console.log('broken hand contained');
}

{ // upload: a note needs both texts and its hand ids
  const { noteRow } = require('./coach_upload');
  assert.equal(noteRow(7, { hand_ids: [1, 2], note_ml: 'x' }), 'note_en missing');
  assert.equal(noteRow(7, { hand_ids: [1, 2], note_en: 'x' }), 'note_ml missing');
  assert.equal(noteRow(7, { hand_ids: [], note_en: 'x', note_ml: 'y' }), 'hand_ids missing');
  const row = noteRow(7, { hand_ids: [1, 2], note_en: 'x', note_ml: 'y' });
  assert.deepEqual([row.player_id, row.hand_ids, row.note_en, row.note_ml, row.facts_version], [7, [1, 2], 'x', 'y', 1]);
  console.log('upload rows');
}

console.log(`coach tests passed (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
