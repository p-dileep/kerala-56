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
// 8-player matches (4 vs 4, 64 cards with the 8s and 7s, 8 cards each): same rules and points
{ let m8=0, h8=0, made8=0;
  for (let m=0;m<60;m++){
    const s = E.newMatch({players:8}); let guard=0;
    assert.equal(s.hands.length, 8); assert.ok(s.hands.every((h) => h.length === 8));
    assert.equal(E.makeDeck(8).length, 64); assert.equal(E.makeDeck(8).reduce((t, c) => t + E.POINTS[c.rank], 0), 56);
    while (s.phase!=='matchover' && guard++<500000){
      if (s.phase==='handover'){ E.nextHand(s); continue; }
      if (s.phase==='playing' && s.trick.complete){ assert.equal(s.trick.cards.length, 8); E.collectTrick(s); if(s.phase!=='playing') {h8++; if(s.result.made) made8++; assert.ok(s.trickNo<=8);} continue; }
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
// self-raise: after the auction closes the declarer alone may convert once to 40/48/56, reopening doubling
{ const g = E.newMatch({}, ()=>0.3); const op = g.turn; const suit = g.hands[op][0].suit;
  E.applyBid(g, op, { type:'bid', value:32, suit });
  while (g.phase === 'bidding') E.applyBid(g, g.turn, { type:'pass' });   // everyone else passes
  assert.equal(g.phase, 'selfraise'); assert.equal(g.turn, op);
  const L = E.legalBidActions(g, op); assert.ok(L.keep); assert.deepEqual(L.raiseLevels, [40,48,56]);
  assert.throws(()=>E.applyBid(g, (op+1)%6, { type:'keep' }), /turn/);    // only the declarer acts
  E.applyBid(g, op, { type:'raise', value:48 });
  assert.equal(g.phase, 'bidding'); assert.equal(g.bidding.raised, true);
  assert.equal(g.bidding.high.value, 48); assert.equal(g.bidding.high.suit, suit);
  assert.equal(E.legalBidActions(g, g.turn).minBid, null);               // nobody can bid higher now
  while (g.phase === 'bidding') E.applyBid(g, g.turn, { type:'pass' });   // double window closes
  assert.equal(g.phase, 'playing'); assert.equal(g.contract.value, 48); }
// keep: the declarer may decline the self-raise and play the won bid as-is
{ const g = E.newMatch({}, ()=>0.3); const op = g.turn; const suit = g.hands[op][0].suit;
  E.applyBid(g, op, { type:'bid', value:30, suit });
  while (g.phase === 'bidding') E.applyBid(g, g.turn, { type:'pass' });
  assert.equal(g.phase, 'selfraise'); E.applyBid(g, op, { type:'keep' });
  assert.equal(g.phase, 'playing'); assert.equal(g.contract.value, 30); }
// Plus anytime: over an opponent's bid you may Plus in any suit you hold, including the opponent's own suit
{ const g = E.newMatch({}, ()=>0.3); const op = g.turn;
  g.hands[op] = [{id:'9Ha',suit:'H',rank:'9'},{id:'AHa',suit:'H',rank:'A'},{id:'KSa',suit:'S',rank:'K'},{id:'QSa',suit:'S',rank:'Q'},{id:'KCa',suit:'C',rank:'K'},{id:'QCa',suit:'C',rank:'Q'},{id:'KDa',suit:'D',rank:'K'},{id:'QDa',suit:'D',rank:'Q'}];
  E.applyBid(g, op, { type:'bid', value:28, suit:'H' });                  // suit-first (no Jack of H): the H ladder is untouched
  const opp = g.turn;                                                     // an opponent of the opener
  g.hands[opp] = [{id:'JHx',suit:'H',rank:'J'},{id:'JHy',suit:'H',rank:'J'},{id:'ASx',suit:'S',rank:'A'},{id:'10Sx',suit:'S',rank:'10'},{id:'ACx',suit:'C',rank:'A'},{id:'10Cx',suit:'C',rank:'10'},{id:'ADx',suit:'D',rank:'A'},{id:'10Dx',suit:'D',rank:'10'}];
  const L = E.legalBidActions(g, opp);
  assert.ok(L.plusOpen.some((o)=>o.suit==='H' && o.n===2));               // both Jacks = top two remaining hearts
  E.applyBid(g, opp, { type:'plus', n:2, suit:'H' });
  assert.equal(g.bidding.high.value, 30); assert.equal(g.bidding.high.suit, 'H'); assert.equal(g.bidding.high.seat, opp); }
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
  assert.equal(plus.includes(1), js>=1 && inSuit.length===1);    // a partner's shown Jack does not lift the lone-Jack rule
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
  assert.deepEqual(E.legalBidActions(u, q).plus, openerHasJ ? [2] : []);   // J+9: no Plus 1 (not lone, partner's Jack does not count)
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
  assert.deepEqual(B.paramsFor('mixed', 'Chinnu'), { ...B.paramsFor('aggressive'), ...B.SELF_PLAY_TUNED });
  assert.deepEqual(B.paramsFor('mixed', 'Kunjamma'), { ...B.paramsFor('defensive'), ...B.SELF_PLAY_TUNED });
  assert.deepEqual(B.paramsFor('mixed', 'Bot 3'), B.DEFAULT_PARAMS);
  // half of the named bots carry the human-tuned bidding numbers as shifts on top of their style
  assert.deepEqual(B.HUMAN_TUNED_BOTS, new Set(['Kuttan', 'Ammini', 'Unni', 'Sarojini', 'Leela']));
  assert.deepEqual(B.paramsFor('mixed', 'Unni'), { ...B.DEFAULT_PARAMS, ...B.HUMAN_TUNED });
  assert.equal(B.paramsFor('mixed', 'Kuttan').estBase, B.paramsFor('aggressive').estBase + B.HUMAN_TUNED.estBase - B.DEFAULT_PARAMS.estBase);
  assert.equal(B.paramsFor('mixed', 'Kuttan').cutMinPts, B.paramsFor('aggressive').cutMinPts);
  // team knowledge: the auction's Jack signal, Plus cards and NS void are read into facts and
  // every simulated layout honours them
  { const s = E.newMatch({}, ()=>0.3); const op = s.turn;
    s.hands[op] = s.hands[op].filter((c)=>!(c.suit==='H'&&c.rank==='J')); s.hands[op].push({ id: 'JH0', suit: 'H', rank: 'J' });
    E.applyBid(s, op, { type: 'bid', value: 28, suit: 'H' });            // shows a Jack
    const o1 = s.turn; E.applyBid(s, o1, { type: 'pass' });
    const p1 = s.turn;                                                    // opener's partner
    s.hands[p1] = s.hands[p1].filter((c)=>c.suit!=='H'); s.hands[p1].push({ id: 'JH1', suit: 'H', rank: 'J' }, { id: '9H0', suit: 'H', rank: '9' });
    s.hands[p1] = s.hands[p1].slice(0, 8); s.hands[op] = s.hands[op].slice(0, 8);
    E.applyBid(s, p1, { type: 'plus', n: 2 });                           // J + 9 of hearts
    const o2 = s.turn; const vs = E.legalBidActions(s, o2).ns.find((o)=>o.suit==='H');
    if (vs) { s.hands[o2] = s.hands[o2].filter((c)=>c.suit!=='H'); E.applyBid(s, o2, { type: 'ns', value: vs.value }); }
    const me = s.turn; const v = B.botView(s, me); const f = B.inferFacts(v);
    assert.deepEqual(f.must[op], ['JH']); assert.deepEqual(f.must[p1], ['JH', '9H']);
    if (vs) assert.ok(f.voids[o2].has('H'));
    for (let k = 0; k < 20; k++) { const h = B.dealUnseen(v, f, Math.random); if (!h) continue;
      assert.ok(h[op].some((c)=>c.rank==='J'&&c.suit==='H')); assert.ok(h[p1].some((c)=>c.rank==='9'&&c.suit==='H'));
      if (vs) assert.ok(!h[o2].some((c)=>c.suit==='H'));
      assert.equal(h.flat().length, 48); assert.equal(new Set(h.flat().map((c)=>c.id)).size, 48); }
    const q = B.simPoints(v, 'H', B.DEFAULT_PARAMS); assert.ok(q === null || (q >= 0 && q <= 56));
    assert.equal(B.simPoints(v, 'H', { ...B.DEFAULT_PARAMS, simDeals: 0 }), null); }
  // a Jack shown by the bid form cannot be claimed again by the same player's Plus
  { const s = E.newMatch({}, ()=>0.3); const op = s.turn;
    s.hands[op] = [{id:'JH0',suit:'H',rank:'J'},{id:'9H0',suit:'H',rank:'9'},{id:'AS0',suit:'S',rank:'A'},{id:'KS0',suit:'S',rank:'K'},{id:'QS0',suit:'S',rank:'Q'},{id:'KC0',suit:'C',rank:'K'},{id:'QC0',suit:'C',rank:'Q'},{id:'KD0',suit:'D',rank:'K'}];
    E.applyBid(s, op, { type: 'bid', value: 28, suit: 'H' });            // shows the Jack
    E.applyBid(s, s.turn, { type: 'pass' });
    const p1 = s.turn; s.hands[p1] = s.hands[p1].filter((c)=>c.suit!=='H').slice(0, 7).concat([{id:'JH1',suit:'H',rank:'J'}]);
    E.applyBid(s, p1, { type: 'plus', n: 1 });                           // partner: the other Jack, lone
    while (s.turn !== op) E.applyBid(s, s.turn, { type: 'pass' });
    const L = E.legalBidActions(s, op);                                   // ladder now 9 9 A A...: Plus 1 = a 9
    assert.deepEqual(L.plus, [1]); assert.deepEqual(L.plusMeaning[1], ['9']);
    s.hands[op] = s.hands[op].filter((c)=>c.id!=='9H0').concat([{id:'AH0',suit:'H',rank:'A'}]);
    assert.deepEqual(E.legalBidActions(s, op).plus, []); }               // only the shown Jack left: nothing new to claim
  // a player who already showed a Jack may say Plus 1 for the second Jack while also holding a 9 (Plus 2 stays offered)
  { const s = E.newMatch({}, ()=>0.3); const op = s.turn;
    s.hands[op] = [{id:'JS0',suit:'S',rank:'J'},{id:'JS1',suit:'S',rank:'J'},{id:'9S0',suit:'S',rank:'9'},{id:'JH0',suit:'H',rank:'J'},{id:'JC0',suit:'C',rank:'J'},{id:'JC1',suit:'C',rank:'J'},{id:'AD0',suit:'D',rank:'A'},{id:'10D0',suit:'D',rank:'10'}];
    E.applyBid(s, op, { type: 'bid', value: 28, suit: 'S' });            // shows one Jack
    while (s.turn !== op) E.applyBid(s, s.turn, s.turn === (op + 1) % 6 ? { type: 'bid', value: 29, suit: 'H' } : { type: 'pass' });
    const L = E.legalBidActions(s, op);
    assert.ok(L.plusOpen.some((o)=>o.suit==='S' && o.n===1 && o.cards[0]==='J'));
    assert.ok(L.plusOpen.some((o)=>o.suit==='S' && o.n===2));
    E.applyBid(s, op, { type: 'plus', n: 1, suit: 'S' });
    const f = B.inferFacts(E.getView(s, (op + 1) % 6));
    assert.ok(!f.lone[op].has('S'));                                     // second Jack, not a lone Jack
    // without the earlier Jack signal, Plus 1 on the Jack still needs a lone Jack
    const t = E.newMatch({}, ()=>0.3); const o2 = t.turn;
    t.hands[o2] = s.hands[op].slice();
    assert.ok(!E.legalBidActions(t, o2).plusOpen.some((o)=>o.suit==='S' && o.n===1));
    // a partner's Jack signal does not count: Plus 1 on the Jack still needs a lone Jack (Plus 2 = J+9 stays)
    const w = E.newMatch({}, ()=>0.3); const pa = w.turn;
    w.hands[pa] = [{id:'JS0',suit:'S',rank:'J'},{id:'AS0',suit:'S',rank:'A'},{id:'KS0',suit:'S',rank:'K'},{id:'AH0',suit:'H',rank:'A'},{id:'KH0',suit:'H',rank:'K'},{id:'AC0',suit:'C',rank:'A'},{id:'KC0',suit:'C',rank:'K'},{id:'AD0',suit:'D',rank:'A'}];
    E.applyBid(w, pa, { type: 'bid', value: 28, suit: 'S' });           // partner shows a Jack
    E.applyBid(w, w.turn, { type: 'pass' });
    const me = w.turn; w.hands[me] = [{id:'JS1',suit:'S',rank:'J'},{id:'9S0',suit:'S',rank:'9'},{id:'10S0',suit:'S',rank:'10'},{id:'QH0',suit:'H',rank:'Q'},{id:'QC0',suit:'C',rank:'Q'},{id:'10C0',suit:'C',rank:'10'},{id:'QD0',suit:'D',rank:'Q'},{id:'KD0',suit:'D',rank:'K'}];
    assert.deepEqual(E.legalBidActions(w, me).plus, [2]);
    w.hands[me] = w.hands[me].filter((c) => c.suit !== 'S' || c.id === 'JS1');
    assert.deepEqual(E.legalBidActions(w, me).plus, [1]);
    E.applyBid(w, me, { type: 'plus', n: 1 });
    assert.ok(B.inferFacts(E.getView(w, (me + 1) % 6)).lone[me].has('S'));
    // an opponent's Jack does not count: Plus 1 on the Jack still needs a lone Jack
    const x = E.newMatch({}, ()=>0.3); const op3 = x.turn;
    x.hands[op3] = w.hands[pa].slice();
    E.applyBid(x, op3, { type: 'bid', value: 28, suit: 'S' });
    const opp = x.turn; x.hands[opp] = [{id:'JS1',suit:'S',rank:'J'},{id:'9S0',suit:'S',rank:'9'},{id:'10S0',suit:'S',rank:'10'},{id:'QH0',suit:'H',rank:'Q'},{id:'QC0',suit:'C',rank:'Q'},{id:'10C0',suit:'C',rank:'10'},{id:'QD0',suit:'D',rank:'Q'},{id:'KD0',suit:'D',rank:'K'}];
    assert.ok(!E.legalBidActions(x, opp).plusOpen.some((o)=>o.suit==='S' && o.n===1)); }
  // Plus 2 on both Jacks, then a Jack-showing bid in the same suit: still two Jacks, and layouts can be dealt (hand #361)
  { const acts = [{ seat: 4, type: 'bid', value: 28, suit: 'H', hasJack: false }, { seat: 0, type: 'plus', n: 2, suit: 'H', value: 30 },
      { seat: 0, type: 'bid', value: 33, suit: 'H', hasJack: true }];
    const s = E.newMatch({}, ()=>0.3); const me = 1;
    s.hands[me] = s.hands[me].filter((c)=>!(c.suit==='H'&&c.rank==='J')).slice(0, 8);
    const v = { ...B.botView(s, me), bidding: { ...s.bidding, actions: acts } };
    const f = B.inferFacts(v); assert.deepEqual(f.must[0], ['JH', 'JH']);
    const h = B.dealUnseen(v, f, Math.random); assert.ok(h && h[0].filter((c)=>c.rank==='J'&&c.suit==='H').length === 2); }
  // doubled bid, everyone passes: the declarer may keep, raise, or change to another suit at a higher value
  { const s = E.newMatch({}, ()=>0.3); const op = s.turn; const N = 6;
    const H = (id, suit, rank) => ({ id, suit, rank });
    s.hands[op] = [H('JS0','S','J'),H('9S0','S','9'),H('AS0','S','A'),H('JH0','H','J'),H('9H0','H','9'),H('KC0','C','K'),H('QC0','C','Q'),H('KD0','D','K')];
    E.applyBid(s, op, { type: 'bid', value: 30, suit: 'S' });
    E.applyBid(s, s.turn, { type: 'double' });                          // left opponent doubles
    for (let k = 0; k < N - 2; k++) E.applyBid(s, s.turn, { type: 'pass' }); // everyone else passes: no pass needed from the bidder
    assert.equal(s.phase, 'selfraise'); assert.equal(s.turn, op);
    const L = E.legalBidActions(s, op);
    assert.ok(L.keep); assert.ok(L.redouble); assert.deepEqual(L.raiseLevels, [40, 48, 56]); assert.equal(L.changeMin, 31);
    assert.deepEqual(L.changeSuits, ['H', 'D', 'C', 'NT']);
    assert.throws(() => E.applyBid(s, op, { type: 'change', value: 30, suit: 'H' }), /between/);
    assert.throws(() => E.applyBid(s, op, { type: 'change', value: 33, suit: 'S' }), /another suit/);
    E.applyBid(s, op, { type: 'change', value: 33, suit: 'H' });
    assert.equal(s.phase, 'bidding'); assert.equal(s.bidding.doubled, 0);
    assert.deepEqual(s.bidding.high, { seat: op, value: 33, suit: 'H', hasJack: true });
    assert.equal(s.turn, (op + 1) % N);
    assert.ok(E.legalBidActions(s, s.turn).double);                       // the new suit can be doubled again
    // not doubled: the window offers no suit change
    const t = E.newMatch({}, ()=>0.3); const o2 = t.turn; t.hands[o2] = s.hands[op].slice();
    E.applyBid(t, o2, { type: 'bid', value: 30, suit: 'S' });
    while (t.phase === 'bidding') E.applyBid(t, t.turn, { type: 'pass' });
    assert.deepEqual(E.legalBidActions(t, o2).changeSuits, []); assert.ok(!E.legalBidActions(t, o2).redouble);
    // redouble from the window ends the auction at x4
    const r = E.newMatch({}, ()=>0.3); const o3 = r.turn; r.hands[o3] = s.hands[op].slice();
    E.applyBid(r, o3, { type: 'bid', value: 30, suit: 'S' }); E.applyBid(r, r.turn, { type: 'double' });
    while (r.phase === 'bidding') E.applyBid(r, r.turn, { type: 'pass' });
    E.applyBid(r, o3, { type: 'redouble' });
    assert.ok(r.phase === 'playing' || r.phase === 'handover'); assert.equal(r.contract.mult, 4);
    // doubled by the right-hand opponent: the bidder's turn comes first; a pass there, then everyone passes -> window
    const u = E.newMatch({}, ()=>0.3); const o4 = u.turn; u.hands[o4] = s.hands[op].slice();
    E.applyBid(u, o4, { type: 'bid', value: 30, suit: 'S' });
    while (u.turn !== (o4 + N - 1) % N) E.applyBid(u, u.turn, { type: 'pass' });
    E.applyBid(u, u.turn, { type: 'double' });
    assert.equal(u.phase, 'bidding'); assert.equal(u.turn, o4);
    while (u.phase === 'bidding') E.applyBid(u, u.turn, { type: 'pass' });
    assert.equal(u.phase, 'selfraise'); assert.equal(u.turn, o4); assert.ok(E.legalBidActions(u, o4).changeSuits.length); }
  // invalid hand: the defending team holds no trump -> void, no chips move, the deal passes on
  { const s = E.newMatch({}, ()=>0.3); const op = s.turn; const N = 6;
    const spades = s.hands.flat().filter((c) => c.suit === 'S');
    const rest = s.hands.flat().filter((c) => c.suit !== 'S');
    const bidders = [0, 1, 2, 3, 4, 5].filter((x) => E.team(x) === E.team(op));
    const defenders = [0, 1, 2, 3, 4, 5].filter((x) => E.team(x) !== E.team(op));
    const pool = { bid: [...spades], def: [] };
    for (const x of bidders) s.hands[x] = [];
    for (const x of defenders) s.hands[x] = [];
    // every spade goes to the bidding team, everything else fills the gaps
    for (const x of bidders) while (s.hands[x].length < 8 && pool.bid.length) s.hands[x].push(pool.bid.pop());
    for (const x of [...bidders, ...defenders]) while (s.hands[x].length < 8) s.hands[x].push(rest.pop());
    assert.equal(pool.bid.length, 0);
    const before = s.tables.slice(), dealer = s.dealer;
    E.applyBid(s, op, { type: 'bid', value: 28, suit: 'S' });
    while (s.phase === 'bidding') E.applyBid(s, s.turn, { type: 'pass' });
    if (s.phase === 'selfraise') E.applyBid(s, op, { type: 'keep' });
    assert.equal(s.phase, 'handover'); assert.ok(s.result.void); assert.equal(s.result.voidTeam, 1 - E.team(op));
    assert.deepEqual(s.tables, before);
    E.nextHand(s); assert.equal(s.dealer, (dealer + 1) % N); assert.equal(s.phase, 'bidding'); }
  // probe: holding one suit against a cheap opponent bid, a two-suited hand names its second suit
  { const s = E.newMatch({}, ()=>0.3); const op = s.turn;
    s.hands[op] = [{id:'JS0',suit:'S',rank:'J'},{id:'9S0',suit:'S',rank:'9'},{id:'AS0',suit:'S',rank:'A'},{id:'JH0',suit:'H',rank:'J'},{id:'9H0',suit:'H',rank:'9'},{id:'KH0',suit:'H',rank:'K'},{id:'QC0',suit:'C',rank:'Q'},{id:'KD0',suit:'D',rank:'K'}];
    E.applyBid(s, op, { type: 'bid', value: 28, suit: 'S' });
    s.hands[s.turn] = [{id:'JD0',suit:'D',rank:'J'},{id:'9D0',suit:'D',rank:'9'},{id:'AD0',suit:'D',rank:'A'},{id:'10D0',suit:'D',rank:'10'},{id:'JC0',suit:'C',rank:'J'},{id:'AC0',suit:'C',rank:'A'},{id:'KC0',suit:'C',rank:'K'},{id:'QD0',suit:'D',rank:'Q'}];
    E.applyBid(s, s.turn, { type: 'bid', value: 29, suit: 'D' });        // opponent overcalls
    while (s.turn !== op) E.applyBid(s, s.turn, { type: 'pass' });
    const a = B.chooseBid(B.botView(s, op)); assert.deepEqual(a, { type: 'bid', value: 30, suit: 'H' }); }
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
  // opening Plus: opener may open Plus N in a suit = 27+N (Plus 3 opens at 30), fresh-ladder meaning
  const w = E.newMatch({}, ()=>0.3); const wo = w.turn; const ws = w.hands[wo][0].suit;
  const wothers = w.hands[wo].filter((c)=>c.suit!==ws);
  const WJ = (k)=>({id:'J'+ws+k, rank:'J', suit:ws}), WN = (k)=>({id:'9'+ws+k, rank:'9', suit:ws});
  w.hands[wo] = [...wothers.slice(0,5), WJ(8), WJ(9), WN(8)];
  const po = E.legalBidActions(w, wo).plusOpen.filter((o)=>o.suit===ws).map((o)=>o.n);
  assert.deepEqual(po, [2,3]);
  assert.throws(()=>E.applyBid(w, wo, {type:'plus', n:1, suit:ws}), /Plus/);
  E.applyBid(w, wo, {type:'plus', n:3, suit:ws});
  assert.equal(w.bidding.high.value, 30); assert.equal(w.bidding.high.suit, ws);
  assert.deepEqual(E.plusMeaning(w.bidding.actions, ws)[2], ['9','A']);
  assert.deepEqual(E.plusMeaning(w.bidding.actions, ws)[1], ['9']);
}
// concede: a loss for the conceding team at the bid's stake; play phase only; can end the match
{ const toPlay = (s) => { while (s.phase !== 'playing') { const d = B.decide(B.botView(s, s.turn)); E.applyBid(s, s.turn, d.action); if (s.phase === 'handover') { E.nextHand(s); } } };
  const s = E.newMatch({}, () => 0.3); toPlay(s);
  const c = s.contract, base = E.bidBaseTables(c.value);
  E.concedeHand(s, c.team);                                              // declarers give up: pay the "down" amount
  assert.equal(s.phase, 'handover'); assert.equal(s.result.conceded, c.team); assert.equal(s.result.made, false);
  assert.equal(s.result.amount, base.lose * c.mult); assert.equal(s.tables[c.team], 12 - base.lose * c.mult); assert.equal(s.tables[0] + s.tables[1], 24);
  assert.ok(s.log.some((l) => /conceded — pays/.test(l)));
  assert.throws(() => E.concedeHand(s, 0), /during play/);               // not in handover
  E.nextHand(s); assert.throws(() => E.concedeHand(s, 0), /during play/); // not in bidding
  toPlay(s); const c2 = s.contract, b2 = E.bidBaseTables(c2.value), before = s.tables.slice();
  E.concedeHand(s, 1 - c2.team);                                         // defenders give up: pay the "made" amount
  assert.equal(s.result.conceded, 1 - c2.team); assert.equal(s.result.made, true);
  assert.equal(s.tables[c2.team], before[c2.team] + b2.win * c2.mult);
  const t = E.newMatch({}, () => 0.3); toPlay(t); t.tables = [1, 23];
  E.concedeHand(t, 0); assert.equal(t.phase, 'matchover'); assert.equal(t.winner, 1); }
console.log('all tests passed');
