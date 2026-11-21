// End-to-end: one human socket + 5 bots plays a full hand through the real server.
process.env.RESERVED_TABLES = 'HIDE6:6, hide8:8, bad';
process.env.PORT = 0; process.env.HAND_LOG = require('path').join(require('os').tmpdir(), `g56_socket_test_${process.pid}.jsonl`);   // replays read it back
process.env.PLAYERS_FILE = 'off'; process.env.BOT_DELAY_MS = 5; process.env.BOT_BID_DELAY_MS = 5; process.env.TRICK_PAUSE_MS = 5;
const { server, accounts } = require('../src/server');
const { io } = require('socket.io-client');
const { HUMAN_TUNED_BOTS } = require('../src/bot');
{ // kunukku: loser of a match wears it; off for the team if it bids and makes the first hand after that (or wins the match); else a bidder who makes a contract sheds their own
  const { updateKunukku } = require('../src/server');
  const assert = require('assert');
  const room = { seats: [0, 1, 2, 3, 4, 5].map((i) => ({ name: 'P' + i })), teamNames: ['A', 'B'], chat: [], kunukku: [], kunukkuFresh: [false, false] };
  const hand = (phase, seat, made, extra = {}) => { room.game = { phase, winner: extra.winner, result: { made, contract: { seat, team: seat % 2 }, ...extra } }; updateKunukku(room); };
  const worn = () => room.kunukku.map((k, i) => (k ? i : '')).join('');
  hand('matchover', 0, true, { winner: 0 }); assert.equal(worn(), '135');           // team B lost the match
  hand('handover', 1, true, { void: true }); assert.equal(worn(), '135');            // a void hand does not count
  hand('handover', 0, false); assert.equal(worn(), '135');                           // the first hand is A's bid (down): B's chance for the whole team is gone
  hand('handover', 1, true); assert.equal(worn(), '35');                             // B bids and makes a later hand: only the bidder sheds
  hand('handover', 3, false); assert.equal(worn(), '35');                            // a failed bid sheds nothing
  hand('matchover', 5, false, { winner: 0 }); assert.equal(worn(), '135');           // B loses the next match too: everyone wears it again
  hand('handover', 3, true); assert.equal(worn(), '');                               // B bids and makes the first hand: off the whole team
  hand('matchover', 0, false, { winner: 1 }); assert.equal(worn(), '024');           // A loses a match: A wears it
  hand('handover', 2, false); assert.equal(worn(), '024');                           // A bids the first hand and goes down: stays on
  hand('matchover', 2, true, { winner: 0 }); assert.equal(worn(), '135');            // A wins that match on its own bid: all off A, B wears it
  console.log('kunukku rules passed');
}
{ // the rating rule: step 24 for the first 30 hands then 12, weight 1 under 40 and 2 from 40, doubles add nothing
  const assert = require('assert');
  const { handDelta } = require('../src/accounts');
  assert.equal(handDelta(0, 1000, 1000, true, 28), 12);
  assert.equal(handDelta(0, 1000, 1000, true, 40), 24);
  assert.equal(handDelta(29, 1000, 1000, false, 40), -24);
  assert.equal(handDelta(30, 1000, 1000, true, 28), 6);
  assert.equal(handDelta(30, 1000, 1000, true, undefined), 6);
  assert.ok(handDelta(0, 900, 1100, true, 28) > 12 && handDelta(0, 1100, 900, true, 28) < 12);
}
{ // records: Elo per hand (team average, guests and bots 1000), bids, matches; void hands count for nothing
  const assert = require('assert');
  const { makeAccounts } = require('../src/accounts');
  const acc = makeAccounts({ reserved: ['Kuttan'] });
  acc.loaded.then(async () => {
    const { id } = await acc.register('Rec One', '1234');
    assert.equal((await acc.register('rec one', '9999')).err, 'That name is already registered. Sign in instead.');
    assert.equal((await acc.register('Kuttan', '1234')).err, 'That name cannot be registered.');
    assert.equal((await acc.register('Rec Two', '12')).err, 'The PIN must be 4 to 8 digits.');
    const seats = [{ pid: id }, {}, {}, {}, {}, {}];
    acc.recordHand(seats, { void: true, receiver: null });
    assert.equal(acc.get(id).rating, 1000);
    acc.recordHand(seats, { receiver: 0, made: true, contract: { seat: 0, value: 28 } }, 0);
    let a = acc.get(id);
    assert.deepEqual([a.rating, a.hands, a.hands_won, a.bids, a.bids_made, a.matches, a.matches_won], [1012, 1, 1, 1, 1, 1, 1]);
    acc.recordHand(seats, { receiver: 1, made: false, contract: { seat: 2, value: 30 } });
    a = acc.get(id);
    assert.deepEqual([a.hands, a.hands_won, a.bids], [2, 1, 1]);
    assert.ok(a.rating < 1012 && a.rating > 990);
    { // the stake weight comes from the bid value; a redouble moves the rating no more than the plain bid
      const { id: w } = await acc.register('Rec Stake', '1234');
      const { id: v } = await acc.register('Rec Plain', '1234');
      acc.recordHand([{}, { pid: w }, {}, {}, {}, {}], { receiver: 1, made: true, amount: 8, contract: { seat: 1, value: 28, mult: 4 } });
      acc.recordHand([{}, { pid: v }, {}, {}, {}, {}], { receiver: 1, made: true, amount: 2, contract: { seat: 1, value: 28, mult: 1 } });
      assert.equal(acc.get(w).rating, 1012);
      assert.equal(acc.get(v).rating, 1012);
      const { id: x } = await acc.register('Rec Forty', '1234');
      acc.recordHand([{ pid: x }, {}, {}, {}, {}, {}], { receiver: 1, made: false, amount: 3, contract: { seat: 0, value: 40 } });
      assert.equal(acc.get(x).rating, 976);                            // 40 down: weight 2
      const { id: c } = await acc.register('Rec Concede', '1234');
      acc.recordHand([{}, { pid: c }, {}, {}, {}, {}], { receiver: 0, made: false, conceded: 1, amount: 2, contract: { seat: 1, value: 32 } });
      assert.equal(acc.get(c).rating, 988);                            // conceding side loses at the bid's weight
    }
    const s1 = (await acc.login('REC ONE', '1234')).session;
    assert.equal(acc.resume(s1), id);
    assert.equal(acc.resume(s1.slice(0, -1) + 'x'), null);
    for (let i = 0; i < 5; i++) assert.equal((await acc.login('Rec One', '0000')).err, 'Wrong PIN.');
    assert.equal((await acc.login('Rec One', '1234')).err, 'Too many wrong PINs. Try again in 15 minutes.');
    console.log('records passed');
  }).catch((e) => { console.error(e); process.exit(1); });
}
{ // two servers on one store (play56.in and the Render copy on Supabase): names and records stay in step
  const assert = require('assert');
  const { makeAccounts } = require('../src/accounts');
  const store = [];
  const copy = (r) => (r ? { ...r } : null);
  const fake = {   // stands in for the Supabase table
    all: async () => store.map(copy),
    keys: async () => store.map((r) => ({ id: r.id, name_key: r.name_key })),
    one: async (col, val) => copy(store.find((r) => String(r[col]) === String(val))),
    insert: async (rec) => (store.some((r) => r.name_key === rec.name_key) ? { conflict: true } : (store.push({ ...rec, id: store.length + 1 }), { row: copy(store[store.length - 1]) })),
    patch: async (id, body) => { Object.assign(store.find((r) => r.id === id), body); }
  };
  const tick = (ms = 0) => new Promise((ok) => setTimeout(ok, ms));
  const A = makeAccounts({ remote: fake, namesEveryMs: 20 }), B = makeAccounts({ remote: fake, namesEveryMs: 20 });
  Promise.all([A.loaded, B.loaded]).then(async () => {
    const { id } = await A.register('Both Sites', '1357');
    assert.equal(B.isHeld('both sites'), false);                     // B has not heard of it yet
    assert.equal((await B.register('both sites', '2468')).err, 'That name is already registered. Sign in instead.');
    assert.equal((await B.login('Both Sites', '1357')).id, id);       // B looks the name up instead of "no player"
    await A.register('Later', '1111');
    await tick(60);
    assert.equal(B.isHeld('later'), true);                            // the names list is re-read
    const seats = [{ pid: id }, {}, {}, {}, {}, {}], won = { receiver: 0, made: true, contract: { seat: 2 } };
    A.recordHand(seats, won); await tick();                           // a hand on A
    assert.equal((await B.refresh(id)).hands, 1);                     // B re-reads on reconnect
    B.recordHand(seats, won); await tick();                           // then a hand on B
    assert.equal(store.find((r) => r.id === id).hands, 2);            // nothing overwritten
    console.log('two servers passed');
  }).catch((e) => { console.error(e); process.exit(1); });
}
server.listen(0, () => {
  const url = `http://localhost:${server.address().port}`;
  const s = io(url, { transports: ['websocket'] });
  let started = false, hands = 0, counted = 0, guest, mate;
  const concede = { proposed: false, declined: false, agreed: false };
  { // reserved tables: joinable by code, absent from the lobby list (checked below), shown with their code
    const h = io(url, { transports: ['websocket'] });
    h.on('connect', () => h.emit('hello', {}));
    h.on('token', () => h.emit('joinRoom', { code: 'hide8', name: 'Hidden' }));
    h.on('errorMsg', (m) => { console.error('reserved table join failed', m); process.exit(1); });
    h.on('room', (r) => { if (r.code !== 'HIDE8' || r.players !== 8 || r.fixed) { console.error('reserved table wrong', r.code, r.players, r.fixed); process.exit(1); }
      if (!h.done) { h.done = true; console.log('reserved table passed'); h.disconnect(); } });
  }
  { // registered players over the socket (reserved table HIDE6: no lobby broadcasts)
    const fail = (m) => { console.error('login test:', m); process.exit(1); };
    const sock = (hello) => { const x = io(url, { transports: ['websocket'] }); x.on('connect', () => x.emit('hello', hello)); return x; };
    const once = (x, ev) => new Promise((ok) => x.once(ev, (...a) => ok(a)));
    (async () => {
      const a = sock({});
      await once(a, 'token');
      a.emit('register', { name: 'Regd', pin: '4321' });
      const [{ session, account }] = await once(a, 'login');
      if (account.name !== 'Regd' || account.rating !== 1000) fail('bad account ' + JSON.stringify(account));
      const g = sock({});
      await once(g, 'token');
      g.emit('joinRoom', { code: 'HIDE6', name: 'regd' });
      const [m] = await once(g, 'errorMsg');
      if (!/registered player/.test(m)) fail('a guest took a registered name: ' + m);
      g.emit('login', { name: 'Regd', pin: '1111' });
      if ((await once(g, 'errorMsg'))[0] !== 'Wrong PIN.') fail('wrong PIN accepted');
      const b = sock({ login: session });                      // first device, signed in
      const [acct] = await once(b, 'account');
      if (!acct || acct.name !== 'Regd') fail('session not resumed');
      b.emit('joinRoom', { code: 'HIDE6', name: 'Someone' });
      const [rb] = await once(b, 'room');
      const seat = rb.mySeat;
      if (seat === null || rb.seats[seat].name !== 'Regd' || !rb.seats[seat].verified) fail('signed-in seat wrong ' + JSON.stringify(rb.seats[seat]));
      const c = sock({ login: session, token: 'another-device-token-0123456789' });   // second device, same account
      await once(c, 'token');
      c.emit('joinRoom', { code: 'HIDE6' });
      const [rc] = await once(c, 'room');
      if (rc.mySeat !== seat) fail('second device did not get the same seat');
      const d = sock({ login: session.slice(0, -2) + 'zz' });  // forged session: a guest
      if ((await once(d, 'account'))[0] !== null) fail('forged session accepted');
      [a, g, b, c, d].forEach((x) => x.disconnect());
      console.log('logins passed');
    })().catch((e) => fail(e.message));
  }
  s.on('connect', () => s.emit('hello', {}));
  s.on('token', () => s.emit('createRoom', { name: 'Tester', players: 8 }));
  s.on('lobby', (t) => { if (!s.lobbySeen) { s.lobbySeen = true; const codes = t.map((x) => x.code).sort(); if (codes.join() !== 'TABLE6,TABLE8') { console.error('lobby tables missing', codes); process.exit(1); }
    if (t.some((x) => x.seated !== 0 || x.hasGame)) { console.error('fixed tables should start empty', t); process.exit(1); } } });
  s.on('errorMsg', (m) => {
    if (/wants to play on/.test(m)) { concede.proposed = false; return; }   // Mate declined: ask again
    console.error('server error:', m); process.exit(1);
  });
  s.on('room', (r) => {
    if (!guest) {                         // a second human joins via code
      guest = io(url, { transports: ['websocket'] });
      guest.on('connect', () => guest.emit('hello', {}));
      guest.on('token', () => guest.emit('joinRoom', { code: r.code, name: 'Guest' }));
      guest.on('room', (gr) => {
        if (gr.concede) { console.error('an opponent must not see the concede request'); process.exit(1); }
        if (gr.game && gr.game.turn === gr.mySeat) act(guest, gr);
      });
      mate = io(url, { transports: ['websocket'] });     // third human, on the host's team (even seat)
      mate.on('connect', () => mate.emit('hello', {}));
      mate.on('token', () => mate.emit('register', { name: 'Mate', pin: '5678' }));
      mate.on('login', ({ account }) => { mate.pid = account.id; mate.emit('joinRoom', { code: r.code, team: 0 }); });
      mate.on('room', (mr) => {
        if (mr.mySeat !== null && mr.mySeat % 2 !== 0) { console.error('Mate should sit on team A'); process.exit(1); }
        if (mr.mySeat !== null) mate.ready = true;
        // one answer per request: the bots keep playing, so the same request arrives in several room updates
        // before the server has handled the answer (a second answer used to burn the "agree" on the first request)
        if (!mr.concede) mate.answered = false;
        else if (mr.game && mr.game.phase === 'playing' && !mate.answered) {
          mate.answered = true;
          if (mr.concede.by !== r.mySeat || mr.concede.team !== 0) { console.error('bad concede payload', mr.concede); process.exit(1); }
          if (!concede.declined) { concede.declined = true; mate.emit('concede', { action: 'decline' }); }
          else if (!concede.agreed) { concede.agreed = true; mate.emit('concede', { action: 'agree' }); }
        }
        if (mr.game && mr.game.turn === mr.mySeat) act(mate, mr);
      });
    }
    if (r.players !== 8 || r.seats.length !== 8) { console.error('expected an 8-seat room'); process.exit(1); }
    if (!started && r.seats.filter((x) => x.kind === 'human').length === 3) {
      if (r.botStyle !== 'aggressive') { s.emit('botStyle', { style: 'aggressive' }); return; }
      started = true; s.emit('start'); return;
    }
    const g = r.game; if (!g) return;
    for (const team of [0, 1]) {            // a team with a human has exactly one human-tuned bot
      const bots = r.seats.filter((x, i) => i % 2 === team && x.kind === 'bot');
      const tuned = bots.filter((x) => HUMAN_TUNED_BOTS.has(x.name)).length;
      if (bots.length && tuned !== 1) { console.error('team', team, 'should have one human-tuned bot', bots.map((x) => x.name)); process.exit(1); }
    }
    if (g.phase === 'playing' && g.handNo === 2 && mate && mate.ready && !concede.proposed) {   // host proposes a concede
      concede.proposed = true; s.emit('concede', { action: 'propose' });
    }
    if (g.phase === 'handover' || g.phase === 'matchover') {
      if (g.handNo === 2 && !(g.result.conceded === 0 && concede.declined && concede.agreed)) { console.error('hand 2 should end by concede after a decline then an agree', g.result, concede); process.exit(1); }
      if (g.handNo > hands) { hands = g.handNo; if (!g.result.void) counted++; console.log(`hand ${g.handNo}:`, g.log.slice(-1)[0], 'tables', g.tables); }
      if (hands >= 3) {
        const m = accounts.get(mate.pid), ms = r.seats.find((x) => x.name === 'Mate');
        if (!ms || !ms.verified || m.hands !== counted) { console.error('Mate record wrong', m, counted, ms); process.exit(1); }
        console.log('records in play passed', m);
        mate.once('myHands', (rows) => {      // replay: Mate's logged hands, newest first, Mate's seat marked
          require('fs').rmSync(process.env.HAND_LOG, { force: true });
          const ok = rows.length === 3 && rows[0].handNo === 3 && rows.every((h) => h.seats[h.me].name === 'Mate' && h.dealt.length === 8 && !h.seats.some((x) => 'pid' in x));
          if (!ok) { console.error('replay rows wrong', rows.map((h) => [h.handNo, h.me])); process.exit(1); }
          console.log('replays passed');
          console.log('socket e2e passed'); process.exit(0);
        });
        mate.emit('myHands');
        return;
      }
      if (g.phase === 'handover') s.emit('nextHand');   // host clicks Next hand
    }
    if (g.turn === r.mySeat) act(s, r);
  });
  function act(sock, r) {
    const g = r.game;
    // act once per position: other updates (a concede request, a chat line) repeat the same turn
    const at = [g.handNo, g.phase, g.bidding && g.bidding.actions.length, g.trickNo, g.trick && g.trick.cards.length].join(':');
    if (sock.actedAt === at) return;
    sock.actedAt = at;
    if (g.phase === 'bidding') {
      const L = g.legal.bid;
      sock.emit('bid', L.pass ? { type: 'pass' } : { type: 'bid', value: L.minBid, suit: L.suits[0] });
    } else if (g.phase === 'selfraise' && g.legal.bid.keep) sock.emit('bid', { type: 'keep' });
    else if (g.phase === 'playing' && g.legal.cards.length) sock.emit('play', { cardId: g.legal.cards[0] });
  }
  setTimeout(() => { console.error('timeout'); process.exit(1); }, 20000);
});
