'use strict';
/**
 * 56 (Ambathiyaaru) — Kerala rules engine, 6 players (3 vs 3).
 *
 * Seats 0..5. Turn order goes seat -> seat+1 (shown counter-clockwise on screen).
 * Teams alternate: even seats = team 0, odd seats = team 1.
 *
 * The engine is pure state + functions. The server owns one state per room
 * and only ever sends players a masked view (getView).
 */

const SUITS = ['S', 'H', 'D', 'C'];
const RANKS = ['J', '9', 'A', '10', 'K', 'Q'];           // high -> low
const RANK_POWER = { J: 6, 9: 5, A: 4, 10: 3, K: 2, Q: 1 };
const POINTS = { J: 3, 9: 2, A: 1, 10: 1, K: 0, Q: 0 };
const LEVELS = [28, 40, 48, 56];
const NUM_SEATS = 6;
const HAND_SIZE = 8;
const MIN_BID = 28;
const MAX_BID = 56;

const DEFAULT_SETTINGS = {
  startingTables: 12,      // tables (kuttu) each team starts with
  redoubleMultiplier: 4,   // some groups use 3
  selfRaiseNextLevel: true // raising your own standing bid must reach the next level (40/48/56)
};

const team = (seat) => seat % 2;
const nextSeat = (seat) => (seat + 1) % NUM_SEATS;

function makeDeck() {
  const deck = [];
  for (let copy = 0; copy < 2; copy++)
    for (const suit of SUITS)
      for (const rank of RANKS) deck.push({ id: `${rank}${suit}${copy}`, rank, suit });
  return deck;
}

function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sortHand(hand) {
  const suitOrder = { S: 0, H: 1, C: 2, D: 3 };
  return hand.slice().sort((a, b) =>
    suitOrder[a.suit] - suitOrder[b.suit] || RANK_POWER[b.rank] - RANK_POWER[a.rank]);
}

function bidBaseTables(value) {
  if (value >= 56) return { win: 4, lose: 5 };
  if (value >= 48) return { win: 3, lose: 4 };
  if (value >= 40) return { win: 2, lose: 3 };
  return { win: 1, lose: 2 };
}

function nextLevelAbove(value) {
  return LEVELS.find((l) => l > value) ?? null;
}

// ---------------------------------------------------------------- match/hand

function newMatch(settings = {}, rng = Math.random) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const state = {
    settings: s,
    phase: 'bidding',
    handNo: 0,
    dealer: Math.floor(rng() * NUM_SEATS),
    tables: [s.startingTables, s.startingTables],
    history: [],          // per-hand results
    winner: null,         // match winner team
    log: []
  };
  startHand(state, rng);
  return state;
}

function startHand(state, rng = Math.random) {
  const deck = shuffle(makeDeck(), rng);
  state.handNo += 1;
  state.phase = 'bidding';
  state.hands = Array.from({ length: NUM_SEATS }, (_, i) =>
    sortHand(deck.slice(i * HAND_SIZE, (i + 1) * HAND_SIZE)));
  const first = nextSeat(state.dealer);         // player to dealer's right
  state.turn = first;
  state.bidding = {
    opener: first,
    actions: [],          // {seat, type, value?, suit?}
    high: null,           // {seat, value, suit}
    doubled: 0,           // 0 none, 1 doubled, 2 redoubled
    passesInRow: 0
  };
  state.contract = null;
  state.trick = { leader: first, cards: [], complete: false, winner: null };
  state.tricksTaken = [0, 0];
  state.points = [0, 0];
  state.played = [];      // every card played this hand, in order (public)
  state.lastTrick = null;
  state.trickNo = 0;
  state.result = null;
  state.log = [`Hand ${state.handNo}: seat ${state.dealer + 1} deals.`];
}

// ---------------------------------------------------------------- bidding

/**
 * What each Plus N would mean right now for `suit`, given the calls so far.
 * Returns { 1: [rank], 2: [rank, rank], 3: [rank, rank] } (a key is absent when not possible).
 * The ladder starts J J 9 9 A A 10 10 K K Q Q; a suit call made with the Jack signal removes one Jack,
 * and every Plus removes the cards it showed.
 */
function plusMeaning(actions, suit) {
  let ladder = RANKS.flatMap((r) => [r, r]);
  const take = (ranks) => { for (const r of ranks) { const i = ladder.indexOf(r); if (i >= 0) ladder.splice(i, 1); } };
  const meaning = () => {
    const m = {};
    if (ladder.length >= 1) m[1] = [ladder[0]];   // top remaining card; a Jack must be the only card held
    if (ladder.length >= 2) m[2] = [ladder[0], ladder[1]];
    if (ladder.length >= 3) m[3] = ladder.slice(0, 3);
    return m;
  };
  const jackShown = new Set();          // seats whose Jack signal was already counted
  for (const a of actions) {
    if (a.suit !== suit) continue;
    if (a.type === 'bid' && a.hasJack && !jackShown.has(a.seat)) { jackShown.add(a.seat); take(['J']); }
    if (a.type === 'plus') { const m = meaning(); if (m[a.n]) take(m[a.n]); }
  }
  return meaning();
}

function legalBidActions(state, seat) {
  const out = { pass: false, double: false, redouble: false, minBid: null, suits: [], plus: [], plusMeaning: {}, ns: [] };
  if (state.phase !== 'bidding' || state.turn !== seat) return out;
  const b = state.bidding;
  const hand = state.hands[seat];

  // The opener cannot pass the very first call: someone must open at 28+.
  out.pass = !(b.high === null && seat === b.opener);

  let min;
  if (!b.high) min = MIN_BID;
  else if (b.high.seat === seat && state.settings.selfRaiseNextLevel) min = nextLevelAbove(b.high.value);
  else min = b.high.value + 1;
  if (min !== null && min <= MAX_BID) {
    out.minBid = min;
    out.suits = SUITS.filter((s) => hand.some((c) => c.suit === s)); // cannot bid a void suit
    out.suits.push('NT');
  }
  // Plus convention: only a partner of the high bidder may say "Plus N" (raise by N in that suit).
  // Meanings are relative to the cards the auction has already revealed in that suit (see plusMeaning):
  // Plus 1 = a lone Jack and nothing else in the suit.
  // Plus 2 = the top two remaining cards (fresh suit: both Jacks; after a Plus 1 or Jack signal: the other Jack and a Nine; ...).
  // Plus 3 = the top three remaining cards (fresh suit: both Jacks and a Nine).
  // Plus is said in the partnership's suit: the standing bid when a partner holds it, otherwise the
  // last suit a partner called (an opponent's bid in between does not block it). Plus N = high + N.
  let plusSuit = null;
  if (b.high && b.high.seat !== seat) {
    if (team(b.high.seat) === team(seat)) plusSuit = b.high.suit !== 'NT' ? b.high.suit : null;
    else {
      const last = [...b.actions].reverse().find((a) => (a.type === 'bid' || a.type === 'plus') && a.suit !== 'NT' && a.seat !== seat && team(a.seat) === team(seat));
      plusSuit = last ? last.suit : null;
    }
  }
  out.plusSuit = plusSuit;
  if (plusSuit) {
    const suit = plusSuit;
    const inSuit = hand.filter((c) => c.suit === suit);
    const count = (r) => inSuit.filter((c) => c.rank === r).length;
    const holds = (ranks) => RANKS.every((r) => count(r) >= ranks.filter((x) => x === r).length);
    const room = MAX_BID - b.high.value;
    const m = plusMeaning(b.actions, suit);
    out.plusMeaning = m;
    if (room >= 1 && m[1] && holds(m[1]) && (m[1][0] !== 'J' || inSuit.length === 1)) out.plus.push(1);
    if (room >= 2 && m[2] && holds(m[2])) out.plus.push(2);
    if (room >= 3 && m[3] && holds(m[3])) out.plus.push(3);
  }
  // Opening Plus: the opener may open "Plus N" in a suit = MIN_BID + N in that suit, showing the fresh-ladder holding.
  out.plusOpen = [];
  if (!b.high && seat === b.opener) {
    for (const suit of SUITS) {
      const inSuit = hand.filter((c) => c.suit === suit);
      const count = (r) => inSuit.filter((c) => c.rank === r).length;
      const holds = (ranks) => RANKS.every((r) => count(r) >= ranks.filter((x) => x === r).length);
      const m = plusMeaning([], suit);
      if (m[1] && inSuit.length === 1 && holds(m[1])) out.plusOpen.push({ n: 1, suit });   // fresh: lone Jack
      if (m[2] && holds(m[2])) out.plusOpen.push({ n: 2, suit });
      if (m[3] && holds(m[3])) out.plusOpen.push({ n: 3, suit });
    }
  }
  // NS convention: "value NS" is a no-trump bid that says "I hold no cards of a called suit".
  // high+1 NS = void in the most recently called suit, high+2 NS = the suit called before that, etc.
  if (b.high && b.high.seat !== seat) {
    const called = [];
    for (let i = b.actions.length - 1; i >= 0; i--) {
      const a = b.actions[i];
      if ((a.type === 'bid' || a.type === 'plus') && a.suit !== 'NT' && !called.includes(a.suit)) called.push(a.suit);
    }
    called.forEach((suit, k) => {
      const value = b.high.value + k + 1;
      if (value <= MAX_BID && !hand.some((c) => c.suit === suit)) out.ns.push({ value, suit });
    });
  }
  if (b.high && b.doubled === 0 && team(b.high.seat) !== team(seat)) out.double = true;
  if (b.high && b.doubled === 1 && team(b.high.seat) === team(seat)) out.redouble = true;
  return out;
}

function applyBid(state, seat, action) {
  if (state.phase !== 'bidding') throw new Error('Not in bidding');
  if (state.turn !== seat) throw new Error('Not your turn');
  const legal = legalBidActions(state, seat);
  const b = state.bidding;
  const type = action.type;

  if (type === 'pass') {
    if (!legal.pass) throw new Error('Opener must bid at least 28');
    b.actions.push({ seat, type: 'pass' });
    b.passesInRow += 1;
  } else if (type === 'bid') {
    const value = Number(action.value);
    const suit = action.suit;
    if (legal.minBid === null) throw new Error('No higher bid possible');
    if (!Number.isInteger(value) || value < legal.minBid || value > MAX_BID)
      throw new Error(`Bid must be between ${legal.minBid} and ${MAX_BID}`);
    if (!legal.suits.includes(suit)) throw new Error('You cannot bid a suit you do not hold');
    // Convention: "30 Hearts" = caller holds the Jack of the suit; "Hearts 30" = caller does not.
    const hasJack = state.hands[seat].some((c) => c.suit === suit && c.rank === 'J');
    b.high = { seat, value, suit, hasJack };
    b.doubled = 0;
    b.passesInRow = 0;
    b.actions.push({ seat, type: 'bid', value, suit, hasJack });
  } else if (type === 'plus') {
    const n = Number(action.n);
    let value, suit;
    if (!b.high) {
      suit = action.suit;
      if (!legal.plusOpen.some((o) => o.n === n && o.suit === suit)) throw new Error('Cannot open with Plus ' + (Number.isInteger(n) ? n : '') + ' in that suit');
      value = MIN_BID + n;
    } else {
      if (!legal.plus.includes(n)) throw new Error('Cannot say Plus ' + (Number.isInteger(n) ? n : '') + ' now');
      value = b.high.value + n;
      suit = legal.plusSuit;
    }
    const hasJack = state.hands[seat].some((c) => c.suit === suit && c.rank === 'J');
    b.high = { seat, value, suit, hasJack };
    b.doubled = 0;
    b.passesInRow = 0;
    b.actions.push({ seat, type: 'plus', n, value, suit, hasJack });
  } else if (type === 'ns') {
    const value = Number(action.value);
    const opt = legal.ns.find((o) => o.value === value);
    if (!opt) throw new Error('Cannot bid ' + value + ' NS now');
    b.high = { seat, value, suit: 'NT', hasJack: true, ns: opt.suit };
    b.doubled = 0;
    b.passesInRow = 0;
    b.actions.push({ seat, type: 'ns', value, suit: 'NT', ns: opt.suit });
  } else if (type === 'double') {
    if (!legal.double) throw new Error('Cannot double now');
    b.doubled = 1;
    b.passesInRow = 0;
    b.actions.push({ seat, type: 'double' });
  } else if (type === 'redouble') {
    if (!legal.redouble) throw new Error('Cannot redouble now');
    b.doubled = 2;
    b.actions.push({ seat, type: 'redouble' });
    return finishAuction(state);                 // redouble ends the auction
  } else throw new Error('Unknown bid action');

  if (b.high && b.passesInRow >= NUM_SEATS - 1) return finishAuction(state);
  state.turn = nextSeat(seat);
}

function finishAuction(state) {
  const b = state.bidding;
  const mult = b.doubled === 2 ? state.settings.redoubleMultiplier : b.doubled === 1 ? 2 : 1;
  state.contract = { seat: b.high.seat, team: team(b.high.seat), value: b.high.value, suit: b.high.suit, hasJack: b.high.hasJack, mult };
  state.phase = 'playing';
  state.turn = state.trick.leader;
  const sym = { S: '♠', H: '♥', D: '♦', C: '♣', NT: 'NT' }[b.high.suit];
  state.log.push(`Contract: seat ${b.high.seat + 1} — ${b.high.hasJack ? `${b.high.value} ${sym}` : `${sym} ${b.high.value}`}${mult > 1 ? ` ×${mult}` : ''}`);
}

// ---------------------------------------------------------------- play

function trumpSuit(state) {
  return state.contract && state.contract.suit !== 'NT' ? state.contract.suit : null;
}

function legalCards(state, seat) {
  if (state.phase !== 'playing' || state.turn !== seat || state.trick.complete) return [];
  const hand = state.hands[seat];
  const cards = state.trick.cards;
  if (cards.length === 0) return hand.map((c) => c.id);
  const led = cards[0].card.suit;
  const follow = hand.filter((c) => c.suit === led);
  return (follow.length ? follow : hand).map((c) => c.id);
}

/** Index (into cards) of the current winning card. Ties go to the card played first. */
function winningIndex(cards, trump) {
  let best = 0;
  for (let i = 1; i < cards.length; i++) {
    const c = cards[i].card, w = cards[best].card;
    const cTrump = c.suit === trump, wTrump = w.suit === trump;
    if (cTrump && !wTrump) best = i;
    else if (cTrump === wTrump && c.suit === w.suit && RANK_POWER[c.rank] > RANK_POWER[w.rank]) best = i;
  }
  return best;
}

function playCard(state, seat, cardId) {
  if (state.phase !== 'playing') throw new Error('Not in play');
  if (state.turn !== seat) throw new Error('Not your turn');
  if (!legalCards(state, seat).includes(cardId)) throw new Error('You must follow suit');
  const hand = state.hands[seat];
  const idx = hand.findIndex((c) => c.id === cardId);
  const [card] = hand.splice(idx, 1);
  state.trick.cards.push({ seat, card });
  state.played.push({ seat, card, trick: state.trickNo });

  if (state.trick.cards.length < NUM_SEATS) {
    state.turn = nextSeat(seat);
    return;
  }
  const wi = winningIndex(state.trick.cards, trumpSuit(state));
  const winner = state.trick.cards[wi].seat;
  const pts = state.trick.cards.reduce((s, x) => s + POINTS[x.card.rank], 0);
  state.trick.complete = true;
  state.trick.winner = winner;
  state.trick.points = pts;
  state.turn = null;            // server calls collectTrick() after a short pause
}

function collectTrick(state) {
  if (!state.trick.complete) return;
  const { winner, points } = state.trick;
  state.points[team(winner)] += points;
  state.tricksTaken[team(winner)] += 1;
  state.lastTrick = { cards: state.trick.cards, winner, points };
  state.trickNo += 1;
  if (state.trickNo >= HAND_SIZE) return scoreHand(state);
  // Stop early once the outcome is decided: the bidding team has reached the target, or the points
  // still on the table can no longer get them there.
  const bt = state.contract.team, mine = state.points[bt];
  const remaining = 56 - state.points[0] - state.points[1];
  if (mine >= state.contract.value || mine + remaining < state.contract.value) {
    state.log.push(`Hand stopped after trick ${state.trickNo}: ${mine >= state.contract.value ? 'target reached' : 'target out of reach'} (${remaining} points left).`);
    return scoreHand(state);
  }
  state.trick = { leader: winner, cards: [], complete: false, winner: null };
  state.turn = winner;
}

// ---------------------------------------------------------------- scoring

function scoreHand(state) {
  const c = state.contract;
  const bidTeam = c.team, other = 1 - bidTeam;
  const made = state.points[bidTeam] >= c.value;
  const base = bidBaseTables(c.value);
  const amount = (made ? base.win : base.lose) * c.mult;
  const payer = made ? other : bidTeam;
  const receiver = 1 - payer;
  const paid = Math.min(amount, state.tables[payer]);
  state.tables[payer] -= paid;
  state.tables[receiver] += paid;

  state.result = { contract: c, made, points: state.points.slice(), amount, payer, receiver };
  state.history.push({ hand: state.handNo, ...state.result });
  state.log.push(made
    ? `Team ${'AB'[bidTeam]} made ${c.value} with ${state.points[bidTeam]} — receives ${amount} table(s).`
    : `Team ${'AB'[bidTeam]} fell short of ${c.value} with ${state.points[bidTeam]} — pays ${amount} table(s).`);

  if (paid < amount || state.tables[payer] <= 0) {
    state.phase = 'matchover';
    state.winner = receiver;
    state.log.push(`Team ${'AB'[receiver]} wins the match!`);
  } else {
    state.phase = 'handover';
  }
  state.turn = null;
}

function nextHand(state, rng = Math.random) {
  if (state.phase !== 'handover') return;
  state.dealer = nextSeat(state.dealer);
  startHand(state, rng);
}

// ---------------------------------------------------------------- views

function getView(state, seat) {
  const mine = seat !== null && seat !== undefined && seat >= 0;
  return {
    phase: state.phase,
    handNo: state.handNo,
    dealer: state.dealer,
    turn: state.turn,
    tables: state.tables,
    settings: state.settings,
    mySeat: mine ? seat : null,
    hand: mine ? state.hands[seat] : [],
    handCounts: state.hands.map((h) => h.length),
    bidding: state.bidding,
    contract: state.contract,
    trick: state.trick,
    lastTrick: state.lastTrick,
    trickNo: state.trickNo,
    points: state.points,
    tricksTaken: state.tricksTaken,
    result: state.result,
    history: state.history,
    winner: state.winner,
    log: state.log.slice(-30),
    // revealed hands at end of hand are not needed; keep private
    legal: mine
      ? { bid: legalBidActions(state, seat), cards: legalCards(state, seat) }
      : null
  };
}

module.exports = {
  SUITS, RANKS, RANK_POWER, POINTS, LEVELS, NUM_SEATS, HAND_SIZE, MIN_BID, MAX_BID, DEFAULT_SETTINGS,
  team, nextSeat, plusMeaning, makeDeck, shuffle, sortHand, bidBaseTables, nextLevelAbove,
  newMatch, startHand, legalBidActions, applyBid, legalCards, winningIndex, playCard,
  collectTrick, scoreHand, nextHand, getView, trumpSuit
};
