const E = require('../src/engine'); const B = require('../src/bot');
const assert = require('assert');
// unit checks
const deck = E.makeDeck(); assert.equal(deck.length, 48);
assert.equal(deck.reduce((s,c)=>s+E.POINTS[c.rank],0), 56);
const T = (rank,suit,copy=0)=>({card:{id:rank+suit+copy,rank,suit}});
// equal cards: first wins
assert.equal(E.winningIndex([T('J','S',0),T('J','S',1)], null), 0);
assert.equal(E.winningIndex([T('Q','S'),T('J','S'),T('9','H')], 'H'), 2);
assert.equal(E.winningIndex([T('Q','S'),T('J','D'),T('9','S')], 'H'), 2);
assert.equal(E.nextLevelAbove(28), 40); assert.equal(E.nextLevelAbove(40), 48);
// full bot matches
let matches=0, hands=0, made=0, errors=0;
for (let m=0;m<200;m++){
  const s = E.newMatch();
  let guard=0;
  while (s.phase!=='matchover' && guard++<500000){
    if (s.phase==='handover'){ E.nextHand(s); continue; }
    if (s.phase==='playing' && s.trick.complete){ E.collectTrick(s); if(s.phase!=='playing') {hands++; if(s.result.made) made++;} continue; }
    const v = B.botView(s, s.turn); const d = B.decide(v);
    if (d.kind==='bid') E.applyBid(s, s.turn, d.action); else E.playCard(s, s.turn, d.cardId);
    assert.equal(s.tables[0]+s.tables[1], 24);
  }
  assert.equal(s.phase,'matchover'); matches++;
}
console.log({matches, hands, avgHandsPerMatch:(hands/matches).toFixed(1), contractMadeRate:(made/hands).toFixed(2)});
// 8-player matches (4 vs 4, 6 cards each): same rules, bots must cope with the shorter hand
{ let m8=0, h8=0, made8=0;
  for (let m=0;m<60;m++){
    const s = E.newMatch({players:8}); let guard=0;
    assert.equal(s.hands.length, 8); assert.equal(s.hands[0].length, 6);
    while (s.phase!=='matchover' && guard++<500000){
      if (s.phase==='handover'){ E.nextHand(s); continue; }
      if (s.phase==='playing' && s.trick.complete){ assert.equal(s.trick.cards.length, 8); E.collectTrick(s); if(s.phase!=='playing') {h8++; if(s.result.made) made8++; assert.ok(s.trickNo<=6);} continue; }
      const v = B.botView(s, s.turn); const d = B.decide(v);
      if (d.kind==='bid') E.applyBid(s, s.turn, d.action); else E.playCard(s, s.turn, d.cardId);
      assert.equal(s.tables[0]+s.tables[1], 24);
    }
    assert.equal(s.phase,'matchover'); m8++;
  }
  console.log({matches8: m8, hands8: h8, contractMadeRate8:(made8/h8).toFixed(2)});
}
// legality checks
const s = E.newMatch({}, ()=>0.3);
assert.throws(()=>E.applyBid(s, s.turn, {type:'pass'}), /Opener/);
// Jack convention: hasJack reflects whether the caller holds the J of the called suit
{
  const t = E.newMatch({}, ()=>0.3);
  let value = 28;
  for (let i = 0; i < 2; i++) {
    const hand = t.hands[t.turn];
    const suits = [...new Set(hand.map((c)=>c.suit))];
    const suit = suits[i % suits.length];
    const expect = hand.some((c)=>c.suit===suit && c.rank==='J');
    E.applyBid(t, t.turn, {type:'bid', value: value++, suit});
    assert.equal(t.bidding.high.hasJack, expect);
    assert.equal(t.bidding.actions.at(-1).hasJack, expect);
  }
}
// Plus convention
{
  const t = E.newMatch({}, ()=>0.3);
  const opener = t.turn;
  const suit = t.hands[opener][0].suit;
  // opponent (next seat) may never say Plus
  E.applyBid(t, opener, {type:'bid', value:28, suit});
  assert.deepEqual(E.legalBidActions(t, t.turn).plus, []);
  assert.throws(()=>E.applyBid(t, t.turn, {type:'plus', n:2}), /Plus/);
  E.applyBid(t, t.turn, {type:'pass'});
  // partner: legal Plus set follows the hand
  const p = t.turn; const h = t.hands[p];
  const inSuit = h.filter((c)=>c.suit===suit), js = inSuit.filter((c)=>c.rank==='J').length, ns9 = inSuit.filter((c)=>c.rank==='9').length;
  const plus = E.legalBidActions(t, p).plus;
  assert.equal(plus.includes(1), inSuit.length===1 && js===1);
  assert.equal(plus.includes(2), js===2);
  assert.equal(plus.includes(3), js===2 && ns9>=1);
  if (plus.length) { const n = plus[0]; E.applyBid(t, p, {type:'plus', n}); assert.equal(t.bidding.high.value, 28+n); assert.equal(t.bidding.high.suit, suit); assert.equal(t.bidding.high.seat, p); }
  // forced hands against the ladder: opener called with the Jack signal (one J shown) or without
  const u = E.newMatch({}, ()=>0.3); const o = u.turn; const os = u.hands[o][0].suit;
  E.applyBid(u, o, {type:'bid', value:28, suit:os}); E.applyBid(u, u.turn, {type:'pass'});
  const q = u.turn; const others = u.hands[q].filter((c)=>c.suit!==os);
  const J = (k)=>({id:'J'+os+k, rank:'J', suit:os}), N = (k)=>({id:'9'+os+k, rank:'9', suit:os}), A = (k)=>({id:'A'+os+k, rank:'A', suit:os});
  const openerHasJ = u.bidding.high.hasJack;
  // ladder meanings right now
  const m = E.plusMeaning(u.bidding.actions, os);
  assert.deepEqual(m[1], ['J']);
  assert.deepEqual(m[2], openerHasJ ? ['J','9'] : ['J','J']);
  assert.deepEqual(m[3], openerHasJ ? ['J','9','9'] : ['J','J','9']);
  u.hands[q] = [...others.slice(0,7), J(8)];
  assert.deepEqual(E.legalBidActions(u, q).plus, [1]);
  u.hands[q] = [...others.slice(0,6), J(8), N(8)];
  assert.deepEqual(E.legalBidActions(u, q).plus, openerHasJ ? [2] : []);
  u.hands[q] = [...others.slice(0,6), J(8), J(9)];
  assert.deepEqual(E.legalBidActions(u, q).plus, openerHasJ ? [] : [2]);
  assert.throws(()=>E.applyBid(u, q, {type:'plus', n:4}), /Plus/);
  // pure ladder check: after both Jacks and both Nines are shown, Plus 2 means two Aces
  const acts = [{seat:0,type:'bid',value:28,suit:'H',hasJack:false},{seat:2,type:'plus',n:2,suit:'H'},{seat:4,type:'plus',n:2,suit:'H'}];
  assert.deepEqual(E.plusMeaning(acts,'H')[2], ['A','A']);
  assert.deepEqual(E.plusMeaning(acts,'H')[3], ['A','A','10']);
  assert.deepEqual(E.plusMeaning(acts,'H')[1], ['A']);   // Plus 1 = top remaining card once both Jacks and Nines are shown
  // after a Plus 1 on a fresh suit, Plus 2 = other Jack and a Nine
  const acts2 = [{seat:0,type:'bid',value:28,suit:'H',hasJack:false},{seat:2,type:'plus',n:1,suit:'H'}];
  assert.deepEqual(E.plusMeaning(acts2,'H')[2], ['J','9']);
  assert.deepEqual(E.plusMeaning(acts2,'H')[3], ['J','9','9']);
  void A;
  // Plus over an opponent's bid: partner opened Plus 2 spades (both Jacks), opponent said 31 hearts,
  // we hold 9 and A of spades -> Plus 1 spades = 32 spades, meaning the 9
  { const y = E.newMatch({}, ()=>0.3); const yo = y.turn; const at = (k)=>(yo + k) % 6;
    const C = (r, su, k)=>({id:r+su+k, rank:r, suit:su});
    y.hands[yo] = [C('J','S',1),C('J','S',2),C('K','S',1),C('Q','H',1),C('10','H',1),C('K','C',1),C('Q','D',1),C('10','D',1)];
    y.hands[at(1)] = [C('J','H',1),C('9','H',1),C('A','H',1),C('K','H',1),C('Q','C',1),C('A','C',1),C('10','C',1),C('K','D',1)];
    y.hands[at(2)] = [C('9','S',1),C('A','S',1),C('A','H',2),C('K','H',2),C('10','C',2),C('K','C',2),C('10','D',2),C('K','D',2)];
    E.applyBid(y, yo, {type:'plus', n:2, suit:'S'});
    E.applyBid(y, at(1), {type:'bid', value:31, suit:'H'});
    const L = E.legalBidActions(y, at(2));
    assert.equal(L.plusSuit, 'S'); assert.deepEqual(L.plus, [1]); assert.deepEqual(L.plusMeaning[1], ['9']);
    E.applyBid(y, at(2), {type:'plus', n:1});
    assert.deepEqual([y.bidding.high.value, y.bidding.high.suit, y.bidding.high.seat], [32, 'S', at(2)]);
  }
  // chips reset: host puts both teams back to the start; a finished match reopens
  { const r = E.newMatch({}, ()=>0.3); r.tables = [3, 21]; E.resetChips(r); assert.deepEqual(r.tables, [12, 12]);
    r.phase = 'matchover'; r.winner = 1; E.resetChips(r); assert.equal(r.phase, 'handover'); assert.equal(r.winner, null); }
  // the deal is hidden while playing and revealed to everyone once the hand is over
  { const d = E.newMatch({}, ()=>0.3);
    assert.equal(E.getView(d, 0).dealt, null); assert.equal(E.getView(d, null).dealt, null);
    const firstDeal = d.hands.map((h)=>h.map((c)=>c.id));
    let g=0; while (d.phase!=='handover' && d.phase!=='matchover' && g++<10000) {
      if (d.phase==='playing' && d.trick.complete) { E.collectTrick(d); continue; }
      const a = B.decide(B.botView(d, d.turn)); if (a.kind==='bid') E.applyBid(d, d.turn, a.action); else E.playCard(d, d.turn, a.cardId);
    }
    assert.deepEqual(E.getView(d, null).dealt.map((h)=>h.map((c)=>c.id)), firstDeal);
  }
  // early stop: a hand ends as soon as the bidders reach the target or cannot reach it
  { const e = E.newMatch({}, ()=>0.3); let g=0, stopped=false;
    while (e.phase!=='handover' && e.phase!=='matchover' && g++<10000) {
      if (e.phase==='playing' && e.trick.complete) { E.collectTrick(e); if (e.phase!=='playing') stopped = e.trickNo < E.HAND_SIZE; continue; }
      const d = B.decide(B.botView(e, e.turn)); if (d.kind==='bid') E.applyBid(e, e.turn, d.action); else E.playCard(e, e.turn, d.cardId);
    }
    const r = e.result, rem = 56 - r.points[0] - r.points[1];
    assert.ok(r.made ? r.points[r.contract.team] >= r.contract.value : r.points[r.contract.team] + rem < r.contract.value);
    if (stopped) assert.ok(e.log.some((l)=>l.startsWith('Hand stopped')));
  }
  // bot styles are presets over DEFAULT_PARAMS
  assert.deepEqual(B.paramsFor('medium'), B.DEFAULT_PARAMS);
  assert.ok(B.paramsFor('aggressive').estBase > B.paramsFor('defensive').estBase);
  assert.deepEqual(B.paramsFor('nonsense'), B.DEFAULT_PARAMS);
  // partner probed with a second suit: bot goes back to partner's first suit when it can support it
  const z = E.newMatch({}, ()=>0.3); const zo = z.turn;
  const seatsFrom = (k)=>(zo + k) % 6;
  const give = (seat, cards)=>{ z.hands[seat] = cards; };
  const C = (r, su, k)=>({id:r+su+k, rank:r, suit:su});
  give(zo, [C('J','H',1),C('9','H',1),C('A','H',1),C('K','H',1),C('Q','D',1),C('10','D',1),C('K','C',1),C('Q','S',1)]);
  give(seatsFrom(1), [C('J','S',1),C('9','S',1),C('A','S',1),C('10','S',1),C('K','S',1),C('Q','C',1),C('A','C',1),C('10','C',1)]);
  give(seatsFrom(2), [C('J','H',2),C('9','H',2),C('10','H',1),C('Q','D',2),C('K','D',1),C('A','C',2),C('K','C',2),C('Q','S',2)]);
  E.applyBid(z, zo, {type:'bid', value:28, suit:'H'});
  E.applyBid(z, seatsFrom(1), {type:'bid', value:29, suit:'S'});
  E.applyBid(z, seatsFrom(2), {type:'pass'});
  E.applyBid(z, seatsFrom(3), {type:'pass'});
  E.applyBid(z, seatsFrom(4), {type:'pass'});
  E.applyBid(z, seatsFrom(5), {type:'pass'});
  assert.equal(z.turn, zo);
  E.applyBid(z, zo, {type:'bid', value:30, suit:'D'});   // probe with the weak suit
  E.applyBid(z, seatsFrom(1), {type:'pass'});
  assert.equal(z.turn, seatsFrom(2));
  const zd = B.decide(B.botView(z, seatsFrom(2)));
  assert.deepEqual(zd.action, {type:'bid', value:31, suit:'H'});
  // opening Plus: opener may open Plus N in a suit = 28+N, fresh-ladder meaning
  const w = E.newMatch({}, ()=>0.3); const wo = w.turn; const ws = w.hands[wo][0].suit;
  const wothers = w.hands[wo].filter((c)=>c.suit!==ws);
  const WJ = (k)=>({id:'J'+ws+k, rank:'J', suit:ws}), WN = (k)=>({id:'9'+ws+k, rank:'9', suit:ws});
  w.hands[wo] = [...wothers.slice(0,5), WJ(8), WJ(9), WN(8)];
  const po = E.legalBidActions(w, wo).plusOpen.filter((o)=>o.suit===ws).map((o)=>o.n);
  assert.deepEqual(po, [2,3]);
  assert.throws(()=>E.applyBid(w, wo, {type:'plus', n:1, suit:ws}), /Plus/);
  E.applyBid(w, wo, {type:'plus', n:3, suit:ws});
  assert.equal(w.bidding.high.value, 31); assert.equal(w.bidding.high.suit, ws);
  assert.deepEqual(E.plusMeaning(w.bidding.actions, ws)[2], ['9','A']);
  assert.deepEqual(E.plusMeaning(w.bidding.actions, ws)[1], ['9']);
}
console.log('all tests passed');
