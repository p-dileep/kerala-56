'use strict';
/**
 * Heuristic computer player for 56. Uses only what a real player could know:
 * its own hand, the bidding, and the cards played so far.
 */
const E = require('./engine');

const pts = (c) => E.POINTS[c.rank];
const pow = (c) => E.RANK_POWER[c.rank];

// Judgment numbers. Tuned by self-play (test/tune.js); pass a different object to decide() to experiment.
const DEFAULT_PARAMS = {
  // hand estimate
  estBase: 24, estPtsW: 0.6, estLenW: 2.0, estJackW: 1.5, estNineW: 0.5, estNtJackW: 2.5, estNtPenalty: 3,
  // partner holds the bid
  plusMaxValue: 40, plus2Margin: 3, raiseMargin: 5, raiseMaxValue: 36,
  // alternative-suit offer to a partner who holds the bid
  altMaxValue: 36, altMinLen: 3, altMargin: 0, altGap: 4,
  // NS signal
  nsMaxValue: 36, nsMargin: 0,
  // partner probed with a second suit: go back to the first suit / call NT
  backMaxValue: 40, backGap: 2, backNtMargin: 0,
  // show the Jack of partner's suit by raising one step ("30 Hearts" form)
  showJackMargin: 0,
  // go for 40 / 48 / 56 when partner's bid plus our extra strength reaches the level
  levelMargin: 4,
  // own bids
  bidContestMargin: 2, jumpEst: 42, jumpGap: 10,
  // double
  doubleMinValue: 44, doubleMinPts: 15,
  // play
  cutMinPts: 3, fightMinPts: 2,
  // card tracking (1 = use inferred voids / remaining trumps, 0 = plain heuristics)
  useTracking: 1
};

// Behaviour presets: overrides on DEFAULT_PARAMS. 'medium' is the tuned default.
const STYLES = {
  defensive: { estBase: 22, bidContestMargin: 4, raiseMargin: 7, plus2Margin: 5, levelMargin: 99, jumpEst: 99,
    showJackMargin: 2, altMargin: 2, doubleMinPts: 17, raiseMaxValue: 32, plusMaxValue: 36, backMaxValue: 36 },
  medium: {},
  aggressive: { estBase: 26, bidContestMargin: 0, raiseMargin: 3, plus2Margin: 1, levelMargin: 2, jumpEst: 38, jumpGap: 6,
    showJackMargin: -1, altMargin: -1, doubleMinPts: 13, raiseMaxValue: 44, plusMaxValue: 48, backMaxValue: 48 }
};
const paramsFor = (style) => ({ ...DEFAULT_PARAMS, ...(STYLES[style] || {}) });

// ---------------------------------------------------------------- bidding

function estimateFor(hand, suit, P = DEFAULT_PARAMS, players = 6) {
  // Baseline: a team expects ~28 of 56 on an average hand (avg hand = 56/players points).
  // Averages scale with hand size: 8 cards at 6 players, 6 cards at 8 players.
  const hs = 48 / players, avgPts = 56 / players, avgLen = 1.33 * hs / 8, avgJ = 1.33 * hs / 8;
  const myPts = hand.reduce((s, c) => s + pts(c), 0);
  let est = P.estBase + (myPts - avgPts) * P.estPtsW;
  if (suit !== 'NT') {
    const t = hand.filter((c) => c.suit === suit);
    const jacks = t.filter((c) => c.rank === 'J').length;
    const nines = t.filter((c) => c.rank === '9').length;
    est += (t.length - avgLen) * P.estLenW + jacks * P.estJackW + (jacks ? nines : 0) * P.estNineW;
  } else {
    // No-trump wants top cards everywhere
    const js = hand.filter((c) => c.rank === 'J').length;
    est += (js - avgJ) * P.estNtJackW - P.estNtPenalty;
  }
  return Math.round(est);
}

function chooseBid(view, P = DEFAULT_PARAMS) {
  const legal = view.legal.bid;
  const hand = view.hand;
  const b = view.bidding;
  const seat = view.mySeat;
  const N = view.players || 6;
  const estimate = (h, s, PP) => estimateFor(h, s, PP, N);
  const options = [...legal.suits].map((s) => ({ suit: s, est: estimate(hand, s, P) }))
    .sort((a, b2) => b2.est - a.est);
  const best = options[0];

  const partnerHolds = b.high && E.team(b.high.seat) === E.team(seat);
  // Partner holds the bid: only push if our hand clearly adds value.
  if (partnerHolds) {
    const partnerSuit = b.high.suit;
    // Partner probed: the high bidder earlier named a different suit (their strong one) and is now
    // on a second suit to ask for information. If everyone passes they play the weak suit, so answer
    // once: go back to the first suit when we can support it, otherwise call no-trump when strong.
    const hb = b.high.seat;
    const own = b.actions.filter((a) => a.seat === hb && (a.type === 'bid' || a.type === 'plus') && a.suit !== 'NT');
    const firstSuit = own.length ? own[0].suit : null;
    const probeIdx = own.length ? b.actions.indexOf(own[own.length - 1]) : -1;
    const answered = b.actions.some((a, i) => i > probeIdx && a.seat === seat && a.type !== 'pass');
    if (legal.minBid && firstSuit && firstSuit !== partnerSuit && !answered && b.high.value < P.backMaxValue) {
      const inFirst = hand.filter((c) => c.suit === firstSuit);
      const power = inFirst.some((c) => c.rank === 'J' || c.rank === '9');
      const estFirst = estimate(hand, firstSuit, P), estProbe = estimate(hand, partnerSuit, P);
      if (legal.suits.includes(firstSuit) && (inFirst.length >= 2 || power) && estFirst >= estProbe + P.backGap)
        return { type: 'bid', value: legal.minBid, suit: firstSuit };
      const estNt = estimate(hand, 'NT', P);
      if (legal.suits.includes('NT') && estNt >= legal.minBid + P.backNtMargin && estNt >= estProbe + P.backGap)
        return { type: 'bid', value: legal.minBid, suit: 'NT' };
    }
    // Plus convention: signal power cards in partner's suit (Plus 1 = bare Jack, Plus 2 = two Jacks, Plus 3 = Jack+Nine)
    // Say Plus once per suit per auction: repeating it tells the table nothing new.
    const saidPlus = b.actions.some((a) => a.type === 'plus' && a.seat === seat && a.suit === partnerSuit);
    if (legal.plus.length && !saidPlus && b.high.value < P.plusMaxValue) {
      const support = estimate(hand, partnerSuit, P);
      if (legal.plus.includes(1)) return { type: 'plus', n: 1 };
      // Plus 2 (two Jacks, or Jack+Nine after a Plus 1) / Plus 3 (Jack+Nine): say the lowest that applies
      const n = legal.plus.find((k) => k >= 2);
      if (n && support >= b.high.value + P.plus2Margin) return { type: 'plus', n };
    }
    // Offer an alternative suit: when weak in partner's suit but strong elsewhere, call that suit
    // one step up. Partner may pass (accept the shift) or raise their own suit by one on top of it.
    const offered = b.actions.some((a) => a.type === 'bid' && a.seat === seat);
    if (legal.minBid && !offered && b.high.value < P.altMaxValue) {
      const inPartner = hand.filter((c) => c.suit === partnerSuit);
      const weakHere = partnerSuit === 'NT' || inPartner.length <= 1;
      const partnerEst = partnerSuit === 'NT' ? -99 : estimate(hand, partnerSuit, P);
      const alt = options.find((o) => o.suit !== 'NT' && o.suit !== partnerSuit && legal.suits.includes(o.suit) &&
        hand.filter((c) => c.suit === o.suit).length >= P.altMinLen &&
        hand.some((c) => c.suit === o.suit && (c.rank === 'J' || c.rank === '9')) &&
        o.est >= legal.minBid + P.altMargin && o.est >= partnerEst + P.altGap);
      if (weakHere && alt) return { type: 'bid', value: legal.minBid, suit: alt.suit };
    }
    if (legal.minBid && partnerSuit !== 'NT' && legal.suits.includes(partnerSuit)) {
      const support = estimate(hand, partnerSuit, P);
      // Levels pay more tables: 40+ = 2, 48+ = 3. Partner's bid is their estimate assuming an average
      // partner; add how much our hand exceeds average and go straight to the highest level reached.
      const teamEst = b.high.value + (support - P.estBase);
      const level = [56, 48, 40].find((L) => L > b.high.value && teamEst >= L + P.levelMargin);
      if (level && level >= legal.minBid) return { type: 'bid', value: level, suit: partnerSuit };
      // Holding the Jack of partner's suit: tell the team by raising one step (the "30 Hearts" form
      // shows the Jack), unless we already showed it or the level is getting high.
      const haveJ = hand.some((c) => c.suit === partnerSuit && c.rank === 'J');
      const shownJ = b.actions.some((a) => a.seat === seat && a.suit === partnerSuit && a.hasJack);
      if (haveJ && !shownJ && b.high.value < P.raiseMaxValue && support >= legal.minBid + P.showJackMargin)
        return { type: 'bid', value: legal.minBid, suit: partnerSuit };
      const target = Math.min(E.MAX_BID, Math.max(b.high.value, support) + 0);
      // Raise partner's suit by one to show support when the hand is clearly strong in it
      if (support >= b.high.value + P.raiseMargin && legal.minBid <= target - 3 && b.high.value < P.raiseMaxValue)
        return { type: 'bid', value: legal.minBid, suit: partnerSuit };
    }
    return legal.pass ? { type: 'pass' } : { type: 'bid', value: legal.minBid, suit: best.suit };
  }

  // Opponents hold the bid but a partner named a suit: a cheap Plus 1 (top remaining card) keeps the
  // partnership informed; say it once per suit.
  if (legal.plus.includes(1) && b.high && !partnerHolds && b.high.value < P.plusMaxValue &&
      !b.actions.some((a) => a.type === 'plus' && a.seat === seat && a.suit === legal.plusSuit))
    return { type: 'plus', n: 1 };
  // NS convention: opponents hold a suit bid and we are void in it. Tell the partnership only
  // when it is worth the raise: a partner has already named a suit we can support (so the void
  // becomes a cut on their trump), and the NS level stays cheap. Otherwise keep quiet.
  const saidNS = b.actions.some((a) => a.type === 'ns' && a.seat === seat);
  if (legal.ns.length && b.high && !partnerHolds && !saidNS && b.high.value < P.nsMaxValue) {
    const partnerSuits = b.actions
      .filter((a) => (a.type === 'bid' || a.type === 'plus') && a.suit !== 'NT' && E.team(a.seat) === E.team(seat))
      .map((a) => a.suit);
    const opt = legal.ns.find((o) => o.suit === b.high.suit);   // cheapest: the standing opponent suit
    if (opt && partnerSuits.length) {
      const ps = partnerSuits[partnerSuits.length - 1];
      const inPs = hand.filter((c) => c.suit === ps);
      const power = inPs.some((c) => c.rank === 'J' || c.rank === '9');
      if (inPs.length >= 2 && power && estimate(hand, ps, P) >= opt.value - P.nsMargin) return { type: 'ns', value: opt.value };
    }
  }

  // Forced opener or genuine bid
  if (!legal.pass) {
    const s = options.find((o) => o.suit !== 'NT') || best;
    // Open with Plus N in our suit when the hand shows it and the estimate covers 28+N
    const po = (legal.plusOpen || []).filter((o) => o.suit === s.suit && s.est >= E.MIN_BID + o.n).sort((a, c) => c.n - a.n)[0];
    if (po) return { type: 'plus', n: po.n, suit: po.suit };
    return { type: 'bid', value: legal.minBid, suit: s.suit };
  }

  if (legal.minBid && best.est >= legal.minBid + (b.high ? P.bidContestMargin : 0)) {
    // Bid economically: just the minimum, but jump to a level when strong and contested.
    let value = legal.minBid;
    if (b.high && best.est >= P.jumpEst && value < 40 && best.est - value > P.jumpGap) value = 40;
    return { type: 'bid', value, suit: best.suit };
  }

  // Double an opponent's overreach when we're very strong in defence
  if (legal.double && b.high) {
    const myPts = hand.reduce((s, c) => s + pts(c), 0);
    if (b.high.value >= P.doubleMinValue && myPts >= P.doubleMinPts) return { type: 'double' };
  }
  return { type: 'pass' };
}

// ---------------------------------------------------------------- play helpers

function unseenHigher(card, view) {
  // Count copies of strictly higher ranks in the same suit that are not in my hand and not played.
  const playedIds = new Set(view.playedIds);
  const myIds = new Set(view.hand.map((c) => c.id));
  let n = 0;
  for (const r of E.RANKS) {
    if (E.RANK_POWER[r] <= pow(card)) continue;
    for (const copy of [0, 1]) {
      const id = `${r}${card.suit}${copy}`;
      if (!playedIds.has(id) && !myIds.has(id)) n++;
    }
  }
  return n;
}

const isMaster = (card, view) => unseenHigher(card, view) === 0;

// ---------------------------------------------------------------- card tracking
// Everything here is public information: cards played (and who failed to follow suit),
// plus what the bidding conventions revealed (NS = void in a suit).
function track(view) {
  const trump = view.contract.suit === 'NT' ? null : view.contract.suit;
  const voids = Array.from({ length: view.players || 6 }, () => new Set());
  const byTrick = new Map();
  for (const p of view.played || []) {
    if (!byTrick.has(p.trick)) byTrick.set(p.trick, []);
    byTrick.get(p.trick).push(p);
  }
  for (const t of byTrick.values()) {
    const led = t[0].card.suit;
    for (const p of t) if (p.card.suit !== led) voids[p.seat].add(led);
  }
  for (const a of view.bidding.actions) if (a.type === 'ns') voids[a.seat].add(a.ns);
  const seen = new Set([...(view.playedIds || []), ...view.hand.map((c) => c.id)]);
  // cards of `suit` with power above `minPow` that are neither played nor in my hand
  const outside = (suit, minPow = -1) => {
    let n = 0;
    for (const r of E.RANKS) {
      if (E.RANK_POWER[r] <= minPow) continue;
      for (const copy of [0, 1]) if (!seen.has(`${r}${suit}${copy}`)) n++;
    }
    return n;
  };
  const trumpOutside = trump ? outside(trump) : 0;
  // Can any of `seats` still beat `card` when `led` is the suit led?
  const canBeat = (card, led, seats) => seats.some((o) => {
    if (trump && card.suit === trump) return !voids[o].has(trump) && outside(trump, pow(card)) > 0;
    const follow = !voids[o].has(led) && card.suit === led && outside(led, pow(card)) > 0;
    const cut = trump && voids[o].has(led) && !voids[o].has(trump) && trumpOutside > 0;
    return follow || cut;
  });
  return { trump, voids, outside, trumpOutside, canBeat };
}

function lowest(cards) {
  return cards.slice().sort((a, b) => pts(a) - pts(b) || pow(a) - pow(b))[0];
}
function highestPoints(cards) {
  return cards.slice().sort((a, b) => pts(b) - pts(a) || pow(a) - pow(b))[0];
}

function beats(card, winningCard, ledSuit, trump) {
  const cT = card.suit === trump, wT = winningCard.suit === trump;
  if (cT && !wT) return true;
  if (!cT && wT) return false;
  return card.suit === winningCard.suit && pow(card) > pow(winningCard);
}

function choosePlay(view, P = DEFAULT_PARAMS) {
  const legalIds = new Set(view.legal.cards);
  const legal = view.hand.filter((c) => legalIds.has(c.id));
  if (legal.length === 1) return legal[0].id;

  const trump = view.contract.suit === 'NT' ? null : view.contract.suit;
  const seat = view.mySeat;
  const myTeam = E.team(seat);
  const bidding = view.contract.team === myTeam;
  const cards = view.trick.cards;
  const T = P.useTracking ? track(view) : null;
  const opps = [0, 1, 2, 3, 4, 5].filter((s2) => E.team(s2) !== myTeam);
  const partners = [0, 1, 2, 3, 4, 5].filter((s2) => s2 !== seat && E.team(s2) === myTeam);
  // an opponent is void in this suit and trumps remain: a point-bearing lead may be cut
  const cutThreat = (suit) => !!T && !!trump && suit !== trump && T.trumpOutside > 0 &&
    opps.some((o) => T.voids[o].has(suit) && !T.voids[o].has(trump));

  // ---- leading
  if (cards.length === 0) {
    const trumps = legal.filter((c) => c.suit === trump);
    if (bidding && trumps.length) {
      const top = trumps.slice().sort((a, b) => pow(b) - pow(a))[0];
      if (isMaster(top, view)) return top.id;
    }
    const masters = legal.filter((c) => c.suit !== trump && isMaster(c, view))
      .sort((a, b) => pts(b) - pts(a));
    const safeMasters = masters.filter((c) => !cutThreat(c.suit));
    if (safeMasters.length) return safeMasters[0].id;
    // Tracking: a partner is known void in a suit and trumps remain; lead that suit low so they can cut
    if (T && trump && T.trumpOutside > 0) {
      const forCut = legal.filter((c) => c.suit !== trump && !cutThreat(c.suit) &&
        partners.some((p) => T.voids[p].has(c.suit) && !T.voids[p].has(trump)));
      if (forCut.length) return lowest(forCut).id;
    }
    if (masters.length && !T) return masters[0].id;
    // Lead a worthless card from the longest side suit (prefer suits no opponent can cut)
    const side = legal.filter((c) => c.suit !== trump);
    const pool = side.length ? side : legal;
    const bySuit = {};
    pool.forEach((c) => (bySuit[c.suit] = (bySuit[c.suit] || 0) + 1));
    const pick = pool.slice().sort((a, b) =>
      pts(a) - pts(b) || (cutThreat(a.suit) - cutThreat(b.suit)) || bySuit[b.suit] - bySuit[a.suit] || pow(a) - pow(b))[0];
    return pick.id;
  }

  // ---- following
  const led = cards[0].card.suit;
  const wi = E.winningIndex(cards, trump);
  const winCard = cards[wi].card;
  const partnerWinning = E.team(cards[wi].seat) === myTeam;
  const N = view.players || 6;
  const last = cards.length === N - 1;
  const trickPts = cards.reduce((s, x) => s + pts(x.card), 0);
  const following = legal[0].suit === led;
  // opponents still to play in this trick
  const toPlay = [];
  for (let s2 = E.nextSeat(seat, N); toPlay.length < N - cards.length - 1; s2 = E.nextSeat(s2, N)) toPlay.push(s2);
  const oppsToPlay = toPlay.filter((s2) => E.team(s2) !== myTeam);
  const safeWin = T
    ? (c) => !T.canBeat(c, led, oppsToPlay)
    : (c) => last || (c.suit === trump ? isMaster(c, view) : (isMaster(c, view) && !trump));
  const partnerSafe = partnerWinning && (T
    ? !T.canBeat(winCard, led, oppsToPlay)
    : (last || (winCard.suit === trump ? isMaster(winCard, view) : isMaster(winCard, view) && winCard.suit === led)));

  if (following) {
    if (partnerSafe) return highestPoints(legal).id;
    const winners = legal.filter((c) => beats(c, winCard, led, trump));
    if (!partnerWinning && winners.length) {
      const sure = winners.filter(safeWin).sort((a, b) => pow(a) - pow(b));
      if (sure.length) return (last ? highestPoints(sure) : sure[0]).id;
      if (trickPts >= P.fightMinPts) return winners.sort((a, b) => pow(b) - pow(a))[0].id;
    }
    return lowest(legal).id;
  }

  // ---- void in led suit
  const trumps = legal.filter((c) => c.suit === trump);
  if (!partnerSafe && trumps.length) {
    const winningTrumps = trumps.filter((c) => beats(c, winCard, led, trump)).sort((a, b) => pow(a) - pow(b));
    if (winningTrumps.length && (trickPts >= P.cutMinPts || last || !partnerWinning)) {
      return winningTrumps[0].id;
    }
  }
  const nonTrump = legal.filter((c) => c.suit !== trump);
  const pool = nonTrump.length ? nonTrump : legal;
  return (partnerSafe ? highestPoints(pool) : lowest(pool)).id;
}

function decide(view, P = DEFAULT_PARAMS) {
  if (view.phase === 'bidding') return { kind: 'bid', action: chooseBid(view, P) };
  if (view.phase === 'playing') return { kind: 'play', cardId: choosePlay(view, P) };
  return null;
}

/** Build the view a bot sees, including the public list of played cards. */
function botView(state, seat) {
  const v = E.getView(state, seat);
  v.playedIds = state.played.map((p) => p.card.id);
  v.played = state.played;     // public: who played what, and in which trick
  return v;
}

const estimate = estimateFor;
module.exports = { decide, botView, estimate, chooseBid, choosePlay, track, DEFAULT_PARAMS, STYLES, paramsFor };
