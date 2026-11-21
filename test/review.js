'use strict';
// Post-hand card review: the all-cards-visible solver (src/review.js) and its worker queue (src/reviewWorker.js).
const assert = require('assert');
const E = require('../src/engine');
const { reviewHand, personal, values } = require('../src/review');
const { rngFrom } = require('./tune');
const { bidAndPlay } = require('./par');

const t0 = Date.now();
const card = (id) => ({ id, rank: id.slice(0, -2), suit: id.slice(-2, -1) });
const PTS = (id) => E.POINTS[id.slice(0, -2)];

// Plain minimax, no pruning: bidder points from here on (trick in progress included).
function brute(hands, trump, bt, leader, trick = []) {
  const P = hands.length;
  if (trick.length === P) {
    const w = trick[E.winningIndex(trick.map((x) => ({ card: card(x.id) })), trump)].seat;
    const pts = trick.reduce((s, x) => s + PTS(x.id), 0);
    if (hands.every((h) => !h.length)) return w % 2 === bt ? pts : 0;
    return (w % 2 === bt ? pts : 0) + brute(hands, trump, bt, w, []);
  }
  const seat = (leader + trick.length) % P, h = hands[seat];
  const led = trick.length ? trick[0].id.slice(-2, -1) : null;
  const follow = led ? h.filter((id) => id.slice(-2, -1) === led) : [];
  const legal = follow.length ? follow : h;
  let best = null;
  for (const id of new Set(legal)) {
    const i = h.indexOf(id);
    h.splice(i, 1);
    const v = brute(hands, trump, bt, leader, [...trick, { seat, id }]);
    h.splice(i, 0, id);
    if (best === null || (seat % 2 === bt ? v > best : v < best)) best = v;
  }
  return best;
}

{ // brute force agrees on random endings (2 and 3 cards each, all trumps and no-trump)
  const rng = rngFrom(7);
  for (let k = 0; k < 400; k++) {
    const per = k < 300 ? 2 : 3;
    const deck = E.shuffle(E.makeDeck(6), rng);
    const dealt = [0, 1, 2, 3, 4, 5].map((s) => deck.slice(s * per, s * per + per).map((c) => c.id));
    const suit = [...E.SUITS, 'NT'][Math.floor(rng() * 5)], bt = Math.floor(rng() * 2), leader = Math.floor(rng() * 6);
    const want = brute(dealt.map((h) => h.slice()), suit === 'NT' ? null : suit, bt, leader);
    const V = values({ players: 6, dealt, contract: { team: bt, suit }, played: [], leader });
    assert.equal(V[0], want, `ending ${k}: solver ${V[0]} vs brute ${want}`);
  }
  console.log('brute force agrees');
}

{ // tie goes to the first copy: the A of spades led beats the other A of spades played later
  const dealt = [['AS0'], ['QS0'], ['KS0'], ['AS1'], ['QH0'], ['KH0']];
  const V = values({ players: 6, dealt, contract: { team: 0, suit: 'S' }, played: [], leader: 0 });
  assert.equal(V[0], 2, 'team 0 takes both aces');
  const V1 = values({ players: 6, dealt, contract: { team: 1, suit: 'S' }, played: [], leader: 0 });
  assert.equal(V1[0], 0, 'team 1 takes nothing');
  console.log('tie goes to the first copy');
}

// A seeded bot-played deal, cut after `cut` tricks: hands left then, and the cards played after that.
function cutDeal(s, cut) {
  const hs = s.played.filter((p) => p.trick < cut);
  const gone = new Set(hs.map((p) => p.card.id + ':' + p.seat));
  const dealt = s.dealt.map((h, seat) => h.map((c) => c.id).filter((id) => !gone.has(id + ':' + seat)));
  return { players: 6, dealt, contract: s.result.contract, played: s.played.filter((p) => p.trick >= cut).map((p) => ({ seat: p.seat, card: { id: p.card.id } })) };
}
const deals = [];
for (let seed = 1; deals.length < 3 && seed < 200; seed++) {
  const s = bidAndPlay(seed, { ...require('../src/bot').DEFAULT_PARAMS });
  if (!s.result.void && s.played.length > 24) deals.push(s);
}
const full = (() => { for (let seed = 1; seed < 400; seed++) { const s = bidAndPlay(seed, { ...require('../src/bot').DEFAULT_PARAMS }); if (!s.result.void && s.played.length === 48) return s; } return null; })();
assert.ok(full, 'a seeded deal played to the end');

{ // identity and no negative cost
  for (const s of [...deals, full]) {
    const h = cutDeal(s, 3), r = reviewHand(h);
    assert.ok(!r.none, 'reviewed');
    const bt = h.contract.team;
    const cost = (seat) => r.given[seat] + r.autoGiven[seat];
    for (let i = 0; i < 6; i++) assert.ok(r.given[i] >= 0 && r.autoGiven[i] >= 0, 'no negative cost');
    const bid = [0, 2, 4].map((i) => cost(i ^ (bt === 1 ? 1 : 0))).reduce((a, b) => a + b, 0);
    const def = [1, 3, 5].map((i) => cost(i ^ (bt === 1 ? 1 : 0))).reduce((a, b) => a + b, 0);
    // points the bidders took in the first 3 tricks are outside the cut hand: compare from the cut on
    assert.equal(r.playedOut, r.best - bid + def, 'identity');
    assert.equal(r.stopped, s.played.length < 48);
  }
  // played to the end: played out is what the bidders actually took after trick 3
  const h = cutDeal(full, 3), r = reviewHand(h), bt = full.result.contract.team;
  const tricks = {};
  for (const p of full.played) (tricks[p.trick] = tricks[p.trick] || []).push(p);
  let after = 0;
  for (const [t, cs] of Object.entries(tricks)) {
    if (Number(t) < 3) continue;
    const w = cs[E.winningIndex(cs, full.result.contract.suit === 'NT' ? null : full.result.contract.suit)].seat;
    if (w % 2 === bt) after += cs.reduce((x, p) => x + PTS(p.card.id), 0);
  }
  assert.equal(r.playedOut, after, 'played out = actual on a finished hand');
  console.log('identity and no negative cost');
}

{ // conceded mid-trick: the last position has a part trick
  const h = cutDeal(deals[0], 3);
  h.played = h.played.slice(0, 6 + 2);
  const r = reviewHand(h);
  assert.ok(!r.none && typeof r.playedOut === 'number' && r.stopped === true, 'mid-trick review');
  console.log('conceded mid-trick');
}

{ // auto cards count for nobody
  const h = cutDeal(full, 3), r = reviewHand(h);
  const seat = r.given.indexOf(Math.max(...r.given));
  assert.ok(r.given[seat] > 0, 'some seat gave points away');
  const V = values(h);
  let k = -1, c = 0;
  h.played.forEach((p, i) => { const d = (p.seat % 2 === h.contract.team ? 1 : -1) * (V[i] - V[i + 1]); if (p.seat === seat && d > c) { c = d; k = i; } });
  const ha = { ...h, played: h.played.map((p, i) => (i === k ? { ...p, auto: true } : p)) };
  const ra = reviewHand(ha);
  assert.equal(ra.given[seat], r.given[seat] - c);
  assert.equal(ra.autoGiven[seat], c);
  assert.equal(ra.best, r.best);
  console.log('auto cards count for nobody');
}

{ // budget, 8 players, nothing played
  const h = cutDeal(deals[0], 0);
  assert.deepEqual(reviewHand(h, { maxNodes: 10 }), { v: 1, none: 'budget' });
  assert.deepEqual(reviewHand({ ...h, players: 8 }), { v: 1, none: 'players' });
  assert.deepEqual(reviewHand({ ...h, played: [] }), { v: 1, none: 'empty' });
  console.log('budget, 8 players, empty');
}

{ // personal: only my own number, the table average to 0.1
  const r = { v: 1, best: 44, playedOut: 47, stopped: true, given: [3, 0, 1, 2, 0, 1], autoGiven: [0, 0, 0, 0, 0, 0], nodes: 5 };
  assert.deepEqual(personal(r, 0), { best: 44, playedOut: 47, stopped: true, avg: 1.2, mine: 3 });
  assert.deepEqual(personal(r, null), { best: 44, playedOut: 47, stopped: true, avg: 1.2 });
  assert.equal(personal(null, 0), null);
  assert.deepEqual(personal({ v: 1, none: 'budget' }, 2), { none: 'budget' });
  console.log('personal');
}

module.exports = { cutDeal, deals, full };
if (require.main === module) {
  (async () => {
    if (process.env.REVIEW_SKIP_WORKER !== '1') await require('./review_worker_tests')();
    console.log(`review tests passed (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  })().catch((e) => { console.error(e); process.exit(1); });
}
