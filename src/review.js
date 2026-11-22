'use strict';
/**
 * Post-hand card review, with all cards visible. For a finished hand it works out, with perfect play by everyone:
 *   best       - the bidding team's points for the whole hand from the deal,
 *   playedOut  - where the hand would have ended had play gone on from the last card played,
 *   given[s]   - for each seat, how many points its own cards cost its team against best play.
 * V(k) = the bidding team's total for the hand with perfect play from position k (k cards played, points already
 * taken included). Card k by seat s costs V(k) - V(k+1) for a bidder, V(k+1) - V(k) for a defender; never negative.
 * Cards a takeover bot played for an absent human (`auto`) are kept apart in autoGiven and count for nobody.
 *
 * The solver: alpha-beta over every legal card, null-window probes (MTD(f)), one fixed transposition table
 * (2^20 entries, 12 MB, allocated once), duplicate copies and equivalent cards searched once. Work is limited by a
 * count of positions searched, so a hand gets the same answer on a busy machine as on an idle one.
 * 6-player hands only for now (8-player hands are too slow).
 */
const E = require('./engine');

const TT_BITS = 20, TT_SIZE = 1 << TT_BITS, TT_MASK = (TT_SIZE - 1) & ~1;   // two-entry buckets
let ttK1, ttK2, ttLo, ttHi, ttMv, ttW;                                      // allocated on first use

let seed = 12345;
const r32 = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; };
const Z1 = new Int32Array(8 * 32 * 3), Z2 = new Int32Array(8 * 32 * 3);    // [seat][card type][count 0..2]
for (let i = 0; i < Z1.length; i++) { Z1[i] = r32(); Z2[i] = r32(); }
const ZL1 = Int32Array.from({ length: 8 }, r32), ZL2 = Int32Array.from({ length: 8 }, r32);   // trick leader
const ZT1 = new Int32Array(8 * 32), ZT2 = new Int32Array(8 * 32);          // [position in trick][card type]
for (let i = 0; i < ZT1.length; i++) { ZT1[i] = r32(); ZT2[i] = r32(); }

class Budget extends Error {}

function makeSolver(P, bidTeam, trumpSuit, maxNodes) {
  if (!ttK1) {
    ttK1 = new Int32Array(TT_SIZE); ttK2 = new Int32Array(TT_SIZE);
    ttLo = new Int8Array(TT_SIZE); ttHi = new Int8Array(TT_SIZE); ttMv = new Int8Array(TT_SIZE); ttW = new Int8Array(TT_SIZE);
  }
  ttW.fill(-1);   // -1 = empty slot
  const ranks = E.ranksFor(P), NR = ranks.length, NT = 4 * NR;
  const tSuit = new Int8Array(NT), tPow = new Int8Array(NT), tPts = new Int8Array(NT);
  for (let s = 0; s < 4; s++) for (let r = 0; r < NR; r++) {
    tSuit[s * NR + r] = s; tPow[s * NR + r] = E.RANK_POWER[ranks[r]]; tPts[s * NR + r] = E.POINTS[ranks[r]];
  }
  const typeOf = (id) => E.SUITS.indexOf(id.slice(-2, -1)) * NR + ranks.indexOf(id.slice(0, -2));
  const trump = trumpSuit === 'NT' ? -1 : E.SUITS.indexOf(trumpSuit), bt = bidTeam;
  const cnt = new Int8Array(P * NT), sc = new Int8Array(P * 4), out = new Int8Array(NT);
  // Trick cards per trick depth: a trick searched below must never overwrite the trick above it.
  const tc = new Int8Array(10 * P), ts = new Int8Array(10 * P);
  const MV = new Int8Array(80 * 8), SCORE = new Int32Array(80 * 8);         // candidate cards per search depth
  const hist = new Int32Array(P * NT);
  let k1 = 0, k2 = 0, tk1 = 0, tk2 = 0, remPts = 0, remCards = 0, nodes = 0, rootN = 0, rootWi = 0;
  const team = (s) => s & 1;
  const beats = (a, b) => (tSuit[a] === tSuit[b] ? tPow[a] > tPow[b] : tSuit[a] === trump);   // a played after b
  function take(s, t) { const i = s * NT + t, c = cnt[i], z = i * 3; k1 ^= Z1[z + c] ^ Z1[z + c - 1]; k2 ^= Z2[z + c] ^ Z2[z + c - 1]; cnt[i] = c - 1; sc[s * 4 + tSuit[t]]--; remCards--; }
  function give(s, t) { const i = s * NT + t, c = cnt[i], z = i * 3; k1 ^= Z1[z + c] ^ Z1[z + c + 1]; k2 ^= Z2[z + c] ^ Z2[z + c + 1]; cnt[i] = c + 1; sc[s * 4 + tSuit[t]]++; remCards++; }

  // Candidate cards for `seat` into MV[d*8..], best first; equivalent cards dropped. Returns the count.
  function genMoves(d, base, n, seat, winIdx, bm) {
    const h = seat * NT, o = d * 8;
    let lo = 0, hi = NT, m = 0, prev = -1;
    if (n > 0) { const ls = tSuit[tc[base]]; if (sc[seat * 4 + ls] > 0) { lo = ls * NR; hi = lo + NR; } }
    for (let t = lo; t < hi; t++) {
      if (!cnt[h + t]) continue;
      // same suit, same points, and no card from prev down to t held by anyone else or lying in the trick
      if (prev >= 0 && tSuit[prev] === tSuit[t] && tPts[prev] === tPts[t]) {
        let eq = true;
        for (let u = prev; u <= t; u++) if (out[u] - cnt[h + u] > 0) { eq = false; break; }
        if (eq) continue;
      }
      prev = t;
      let g;
      if (t === bm) g = 1 << 30;
      else if (n === 0) g = hist[h + t];
      else {
        const w = tc[base + winIdx], wins = beats(t, w);
        const q = team(ts[base + winIdx]) === team(seat)
          ? (wins ? 500 - tPow[t] : 1000 + tPts[t] * 10 - tPow[t])     // partner ahead: give points, do not overtake
          : (wins ? 1000 - tPow[t] - tPts[t] : 500 - tPts[t] * 10 - tPow[t]);   // cheapest winner, else the least
        g = q * 4096 + Math.min(hist[h + t], 4095);
      }
      let j = m++;
      while (j > 0 && SCORE[o + j - 1] < g) { MV[o + j] = MV[o + j - 1]; SCORE[o + j] = SCORE[o + j - 1]; j--; }
      MV[o + j] = t; SCORE[o + j] = g;
    }
    return m;
  }

  // Bidder points from here on. n cards lie in the trick at tc[base..]; d = search depth.
  function ply(base, n, seat, winIdx, alpha, beta, d) {
    if (++nodes > maxNodes) throw new Budget();
    if (n === P) {
      const winner = ts[base + winIdx];
      let pts = 0;
      for (let i = 0; i < P; i++) { pts += tPts[tc[base + i]]; out[tc[base + i]]--; }
      remPts -= pts;
      const g = team(winner) === bt ? pts : 0;
      const s1 = tk1, s2 = tk2;
      tk1 = 0; tk2 = 0;
      const v = g + ply(base + P, 0, winner, 0, alpha - g, beta - g, d + 1);
      tk1 = s1; tk2 = s2;
      remPts += pts;
      for (let i = 0; i < P; i++) out[tc[base + i]]++;
      return v;
    }
    if (remPts === 0) return 0;
    if (alpha >= remPts) return remPts;
    if (beta <= 0) return 0;
    const leader = n === 0 ? seat : ts[base];
    const a1 = k1 ^ ZL1[leader] ^ tk1, a2 = k2 ^ ZL2[leader] ^ tk2, s0 = (a1 ^ (a2 >>> 11)) & TT_MASK;
    let slot = -1, lo = 0, hi = remPts, bm = -1;
    if (ttW[s0] >= 0 && ttK1[s0] === a1 && ttK2[s0] === a2) slot = s0;
    else if (ttW[s0 + 1] >= 0 && ttK1[s0 + 1] === a1 && ttK2[s0 + 1] === a2) slot = s0 + 1;
    if (slot >= 0) {
      lo = ttLo[slot]; hi = ttHi[slot]; bm = ttMv[slot];
      if (lo >= beta) return lo;
      if (hi <= alpha) return hi;
      if (lo === hi) return lo;
    }
    const al = alpha > lo ? alpha : lo, be = beta < hi ? beta : hi;
    let a = al, b = be;
    const max = team(seat) === bt;
    let best = max ? -1 : 99, bestMv = -1;
    const m = genMoves(d, base, n, seat, winIdx, bm), o = d * 8;
    const s1 = tk1, s2 = tk2, next = seat + 1 === P ? 0 : seat + 1;
    for (let i = 0; i < m; i++) {
      const t = MV[o + i];
      take(seat, t);
      tc[base + n] = t; ts[base + n] = seat;
      tk1 = s1 ^ ZT1[n * 32 + t]; tk2 = s2 ^ ZT2[n * 32 + t];
      const nw = n === 0 ? 0 : beats(t, tc[base + winIdx]) ? n : winIdx;
      const v = ply(base, n + 1, next, nw, a, b, d + 1);
      give(seat, t);
      if (max) { if (v > best) { best = v; bestMv = t; } if (best > a) a = best; }
      else { if (v < best) { best = v; bestMv = t; } if (best < b) b = best; }
      if (a >= b) { hist[seat * NT + t] += remCards * remCards; break; }
    }
    tk1 = s1; tk2 = s2;
    let nlo = lo, nhi = hi;
    if (best <= al) nhi = nhi < best ? nhi : best;
    else if (best >= be) nlo = nlo > best ? nlo : best;
    else { nlo = best; nhi = best; }
    let w = slot;
    if (w < 0) w = ttW[s0] <= ttW[s0 + 1] ? s0 : s0 + 1;   // replace the entry with fewer cards left
    ttK1[w] = a1; ttK2[w] = a2; ttLo[w] = nlo; ttHi[w] = nhi; ttMv[w] = bestMv; ttW[w] = remCards;
    return best;
  }

  // Set up a position: hands = card ids per seat, trick = [{ seat, id }] in play order.
  function setPos(hands, trick) {
    k1 = 0; k2 = 0; tk1 = 0; tk2 = 0; remPts = 0; remCards = 0;
    cnt.fill(0); sc.fill(0); out.fill(0);
    hands.forEach((h, s) => h.forEach((id) => { const t = typeOf(id); cnt[s * NT + t]++; sc[s * 4 + tSuit[t]]++; out[t]++; remPts += tPts[t]; remCards++; }));
    for (let i = 0; i < P * NT; i++) { k1 ^= Z1[i * 3 + cnt[i]]; k2 ^= Z2[i * 3 + cnt[i]]; }
    let wi = 0;
    trick.forEach((x, i) => {
      const t = typeOf(x.id);
      tc[i] = t; ts[i] = x.seat; out[t]++; remPts += tPts[t];
      tk1 ^= ZT1[i * 32 + t]; tk2 ^= ZT2[i * 32 + t];
      if (i > 0 && beats(t, tc[wi])) wi = i;
    });
    rootN = trick.length; rootWi = wi;
  }
  // Exact bidder points from the position set up, by null-window probes around a guess.
  function solve(seat, guess) {
    let g = Math.max(0, Math.min(remPts, guess == null ? remPts >> 1 : guess)), lo = -1, hi = 99;
    while (lo < hi) {
      const beta = g === lo ? g + 1 : g;
      const s1 = tk1, s2 = tk2;
      g = ply(0, rootN, seat, rootWi, beta - 1, beta, 0);
      tk1 = s1; tk2 = s2;
      if (g < beta) hi = g; else lo = g;
    }
    return g;
  }
  return { setPos, solve, get nodes() { return nodes; }, get remPts() { return remPts; } };
}

// V(0..m) for a hand, or null when the work budget runs out. `hand.leader` is the opening leader when nothing
// has been played (tests); otherwise the first card's seat.
// The position after `seat` plays card `id` from position p ({ hands, trick, taken, leader }).
function nextPos(p, seat, id, P, bt, trump) {
  const hands = p.hands.map((h) => h.slice());
  hands[seat].splice(hands[seat].indexOf(id), 1);
  let trick = [...p.trick, { seat, id }], taken = p.taken, leader = p.leader;
  if (trick.length === P) {
    const w = trick[E.winningIndex(trick.map((x) => ({ card: { suit: x.id.slice(-2, -1), rank: x.id.slice(0, -2) } })), trump)].seat;
    if (E.team(w) === bt) taken += trick.reduce((s, x) => s + E.POINTS[x.id.slice(0, -2)], 0);
    leader = w; trick = [];
  }
  return { hands, trick, taken, leader };
}
const toMove = (p, P) => (p.trick.length ? (p.trick[p.trick.length - 1].seat + 1) % P : p.leader);
// Positions 0..upto of a hand (k cards of hand.played played).
function positions(hand, upto = hand.played.length) {
  const P = hand.players, c = hand.contract, trump = c.suit === 'NT' ? null : c.suit;
  const pos = [{ hands: hand.dealt.map((h) => h.slice()), trick: [], taken: 0, leader: hand.played.length ? hand.played[0].seat : hand.leader }];
  for (let k = 0; k < upto; k++) pos.push(nextPos(pos[k], hand.played[k].seat, hand.played[k].card.id, P, c.team, trump));
  return pos;
}

// One solver for a hand, to share between values() and bestCards(): its table stays filled between calls.
const handSolver = (hand, maxNodes = 180e6) => makeSolver(hand.players, hand.contract.team, hand.contract.suit, maxNodes);

function values(hand, { maxNodes = 180e6, solver = null } = {}) {
  const P = hand.players, c = hand.contract, bt = c.team;
  const S = solver || makeSolver(P, bt, c.suit, maxNodes);
  const m = hand.played.length, pos = positions(hand);
  const V = new Array(m + 1);
  let guess = null;
  try {
    for (let k = m; k >= 0; k--) {        // last position first: its search fills the table for the earlier ones
      const p = pos[k];
      S.setPos(p.hands, p.trick);
      const n = p.trick.length, seat = n ? (p.trick[n - 1].seat + 1) % P : p.leader;
      V[k] = p.taken + S.solve(seat, guess == null ? null : guess - p.taken);
      guess = V[k];
    }
  } catch (e) {
    if (e instanceof Budget) return null;
    throw e;
  }
  V.nodes = S.nodes;
  return V;
}

// At position k: the best total the bidding team can reach (= values(hand)[k]) and the legal cards of the seat to
// move that keep it (one id per card type). null when the work budget runs out.
function bestCards(hand, k, { maxNodes = 180e6, solver = null, guess = null } = {}) {
  const P = hand.players, c = hand.contract, bt = c.team, trump = c.suit === 'NT' ? null : c.suit;
  const p = positions(hand, k)[k], seat = toMove(p, P), mine = p.hands[seat];
  const led = p.trick.length ? p.trick[0].id.slice(-2, -1) : null;
  const follow = led ? mine.filter((id) => id.slice(-2, -1) === led) : [];
  const seen = new Set(), legal = (follow.length ? follow : mine).filter((id) => !seen.has(id.slice(0, -1)) && seen.add(id.slice(0, -1)));
  const S = solver || makeSolver(P, bt, c.suit, maxNodes);
  try {
    const got = legal.map((id) => {
      const q = nextPos(p, seat, id, P, bt, trump);
      S.setPos(q.hands, q.trick);
      return { id, v: q.taken + S.solve(toMove(q, P), guess == null ? null : guess - q.taken) };
    });
    const value = (E.team(seat) === bt ? Math.max : Math.min)(...got.map((x) => x.v));
    return { value, cards: got.filter((x) => x.v === value).map((x) => x.id) };
  } catch (e) {
    if (e instanceof Budget) return null;
    throw e;
  }
}

// The review of one logged hand ({ players, dealt, contract, played }).
function reviewHand(hand, opts = {}) {
  if (hand.players !== 6) return { v: 1, none: 'players' };
  if (!hand.played.length) return { v: 1, none: 'empty' };
  const V = values(hand, opts);
  if (!V) return { v: 1, none: 'budget' };
  const bt = hand.contract.team, given = new Array(6).fill(0), autoGiven = new Array(6).fill(0);
  hand.played.forEach((p, k) => {
    const cost = E.team(p.seat) === bt ? V[k] - V[k + 1] : V[k + 1] - V[k];
    (p.auto ? autoGiven : given)[p.seat] += cost;
  });
  const dealt = hand.dealt.reduce((s, h) => s + h.length, 0);
  return { v: 1, best: V[0], playedOut: V[hand.played.length], stopped: hand.played.length < dealt, given, autoGiven, nodes: V.nodes };
}

// What one viewer sees: the hand lines, the table average, and their own number only (seat null = spectator).
function personal(review, seat) {
  if (!review) return null;
  if (review.none) return { none: review.none };
  const out = { best: review.best, playedOut: review.playedOut, stopped: review.stopped,
    avg: Math.round((review.given.reduce((a, b) => a + b, 0) / review.given.length) * 10) / 10 };
  if (typeof seat === 'number' && seat >= 0) out.mine = review.given[seat];
  return out;
}

module.exports = { reviewHand, personal, values, bestCards, handSolver };
