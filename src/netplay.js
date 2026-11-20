'use strict';
/**
 * Card play of the neural bots (Jalaja, Keaton): a small neural net (trained off-line by self-play search, see the git-ignored neural/
 * folder, round 2) picks the card. Bidding stays with the rule bot (bot.js). Weights: cardnet.bin + cardnet.json.
 * Trained on 6-player tables only: at 8 players choose() returns null and the rule bot plays.
 * Same features as neural/common.js encode(): keep the two in step.
 */
const fs = require('fs');
const path = require('path');
const E = require('./engine');
const B = require('./bot');

const NAMES = ['Jalaja', 'Keaton'];   // same net; pick-only bots
const NT = 32;
const RANK_IDX = Object.fromEntries(E.RANKS_8P.map((r, i) => [r, i]));
const LAYOUT = [
  ['hand', NT], ['unseen', NT], ['trick', 7 * NT], ['winCard', NT], ['held', 7 * NT], ['voids', 7 * 4],
  ['counts', 8], ['trickPos', 8], ['winSeat', 8], ['led', 4], ['isNT', 1], ['is8p', 1],
  ['weBid', 1], ['declSeat', 8], ['value', 1], ['doubled', 1], ['redoubled', 1],
  ['ourPts', 1], ['theirPts', 1], ['need', 1], ['left', 1], ['trickNo', 8]
];
const OFF = {};
let F = 0;
for (const [name, n] of LAYOUT) { OFF[name] = F; F += n; }

let net = null;
function load() {
  if (net) return net;
  const meta = JSON.parse(fs.readFileSync(path.join(__dirname, 'cardnet.json'), 'utf8'));
  if (meta.F !== F) throw new Error(`cardnet.json expects ${meta.F} features, encoder gives ${F}`);
  const buf = fs.readFileSync(path.join(__dirname, 'cardnet.bin'));
  const all = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
  let o = 0;
  const layers = meta.layers.map(([inN, outN]) => {
    const W = all.subarray(o, o + inN * outN); o += inN * outN;
    const b = all.subarray(o, o + outN); o += outN;
    return { inN, outN, W, b };
  });
  if (o !== all.length) throw new Error('cardnet.bin size does not match cardnet.json');
  net = { layers, scale: Float32Array.from(meta.scale) };
  return net;
}

const suitOrder = (trump) => (trump ? [trump, ...E.SUITS.filter((s) => s !== trump)] : E.SUITS.slice());
const typeOf = (card, order) => order.indexOf(card.suit) * 8 + RANK_IDX[card.rank];

function encode(view) {
  const T = B.track(view, B.DEFAULT_PARAMS);
  const x = new Uint8Array(F);
  const N = view.players || 6, me = view.mySeat, myTeam = E.team(me);
  const trump = view.contract.suit === 'NT' ? null : view.contract.suit;
  const order = suitOrder(trump);
  const rel = (s) => (s - me + N) % N;
  const ty = (c) => typeOf(c, order);
  for (const c of view.hand) x[OFF.hand + ty(c)]++;
  const seen = new Set([...view.hand.map((c) => c.id), ...(view.playedIds || [])]);
  for (const c of E.makeDeck(N)) if (!seen.has(c.id)) x[OFF.unseen + ty(c)]++;
  const cards = view.trick.cards;
  for (const { seat, card } of cards) x[OFF.trick + (rel(seat) - 1) * NT + ty(card)]++;
  if (cards.length) {
    const wi = E.winningIndex(cards, trump);
    x[OFF.winCard + ty(cards[wi].card)] = 1;
    x[OFF.winSeat + rel(cards[wi].seat)] = 1;
    x[OFF.led + order.indexOf(cards[0].card.suit)] = 1;
  }
  x[OFF.trickPos + cards.length] = 1;
  for (let s = 0; s < N; s++) {
    if (s === me) continue;
    const r = rel(s) - 1;
    for (const rs of T.held[s]) x[OFF.held + r * NT + order.indexOf(rs.slice(-1)) * 8 + RANK_IDX[rs.slice(0, -1)]]++;
    for (const suit of T.voids[s]) x[OFF.voids + r * 4 + order.indexOf(suit)] = 1;
  }
  for (let s = 0; s < N; s++) x[OFF.counts + rel(s)] = view.handCounts[s];
  x[OFF.isNT] = trump ? 0 : 1;
  x[OFF.is8p] = N === 8 ? 1 : 0;
  const c = view.contract, bt = c.team;
  x[OFF.weBid] = bt === myTeam ? 1 : 0;
  x[OFF.declSeat + rel(c.seat)] = 1;
  x[OFF.value] = c.value - 28;
  x[OFF.doubled] = c.mult === 2 ? 1 : 0;
  x[OFF.redoubled] = c.mult > 2 ? 1 : 0;
  x[OFF.ourPts] = view.points[myTeam];
  x[OFF.theirPts] = view.points[1 - myTeam];
  x[OFF.need] = Math.max(0, c.value - view.points[bt]);
  x[OFF.left] = 56 - view.points[0] - view.points[1];
  x[OFF.trickNo + Math.min(7, view.trickNo)] = 1;
  return { x, order };
}

function dense(L, x, relu) {
  const y = new Float32Array(L.outN);
  for (let o = 0; o < L.outN; o++) {
    let s = L.b[o]; const row = o * L.inN;
    for (let i = 0; i < L.inN; i++) s += L.W[row + i] * x[i];
    y[o] = relu && s < 0 ? 0 : s;
  }
  return y;
}

/** The card id a neural bot plays in this playing-phase bot view, or null (8 players: let the rule bot play). */
function choose(view) {
  if ((view.players || 6) !== 6) return null;
  const legal = view.legal.cards;
  if (legal.length === 1) return legal[0];
  const n = load();
  const { x, order } = encode(view);
  let h = new Float32Array(F);
  for (let i = 0; i < F; i++) h[i] = x[i] * n.scale[i];
  for (let k = 0; k < n.layers.length; k++) h = dense(n.layers[k], h, k < n.layers.length - 1);
  const ok = new Set(legal);
  let best = null, bestZ = -Infinity;
  for (const card of view.hand) {
    if (!ok.has(card.id)) continue;
    const z = h[typeOf(card, order)];
    if (z > bestZ) { bestZ = z; best = card.id; }
  }
  return best;
}

module.exports = { NAMES, choose, encode, F };
