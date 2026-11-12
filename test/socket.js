// End-to-end: one human socket + 5 bots plays a full hand through the real server.
process.env.RESERVED_TABLES = 'HIDE6:6, hide8:8, bad';
process.env.PORT = 0; process.env.BOT_DELAY_MS = 5; process.env.BOT_BID_DELAY_MS = 5; process.env.TRICK_PAUSE_MS = 5;
const { server } = require('../src/server');
const { io } = require('socket.io-client');
const { HUMAN_TUNED_BOTS } = require('../src/bot');
{ // kunukku: loser of a match wears it; off for the team on a first-hand win, else per bidder
  const { updateKunukku } = require('../src/server');
  const assert = require('assert');
  const room = { seats: [0, 1, 2, 3, 4, 5].map((i) => ({ name: 'P' + i })), teamNames: ['A', 'B'], chat: [], kunukku: [], kunukkuFresh: [false, false] };
  const hand = (phase, seat, made, extra = {}) => { room.game = { phase, winner: extra.winner, result: { made, contract: { seat, team: seat % 2 }, ...extra } }; updateKunukku(room); };
  const worn = () => room.kunukku.map((k, i) => (k ? i : '')).join('');
  hand('matchover', 0, true, { winner: 0 }); assert.equal(worn(), '135');           // team B lost the match
  hand('handover', 1, true, { void: true }); assert.equal(worn(), '135');            // a void hand does not count
  hand('handover', 1, true); assert.equal(worn(), '');                               // B bids and wins the first hand: all off
  hand('matchover', 0, true, { winner: 0 }); hand('handover', 0, true); assert.equal(worn(), '135');   // first hand went to A
  hand('handover', 3, false); assert.equal(worn(), '135');                           // a failed bid sheds nothing
  hand('handover', 3, true); assert.equal(worn(), '15');                             // only the bidder sheds
  hand('matchover', 5, false, { winner: 0 }); assert.equal(worn(), '135');           // lost again: everyone wears it
  hand('matchover', 1, true, { winner: 1 }); assert.equal(worn(), '024');            // B bids and wins its first hand (all off); A now wears it
  console.log('kunukku rules passed');
}
server.listen(0, () => {
  const url = `http://localhost:${server.address().port}`;
  const s = io(url, { transports: ['websocket'] });
  let started = false, hands = 0, guest, mate;
  const concede = { proposed: false, declined: false, agreed: false };
  { // reserved tables: joinable by code, absent from the lobby list (checked below), shown with their code
    const h = io(url, { transports: ['websocket'] });
    h.on('connect', () => h.emit('hello', {}));
    h.on('token', () => h.emit('joinRoom', { code: 'hide8', name: 'Hidden' }));
    h.on('errorMsg', (m) => { console.error('reserved table join failed', m); process.exit(1); });
    h.on('room', (r) => { if (r.code !== 'HIDE8' || r.players !== 8 || r.fixed) { console.error('reserved table wrong', r.code, r.players, r.fixed); process.exit(1); }
      if (!h.done) { h.done = true; console.log('reserved table passed'); h.disconnect(); } });
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
      mate.on('token', () => mate.emit('joinRoom', { code: r.code, name: 'Mate', team: 0 }));
      mate.on('room', (mr) => {
        if (mr.mySeat !== null && mr.mySeat % 2 !== 0) { console.error('Mate should sit on team A'); process.exit(1); }
        if (mr.mySeat !== null) mate.ready = true;
        if (mr.concede && mr.game && mr.game.phase === 'playing') {
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
      if (g.handNo > hands) { hands = g.handNo; console.log(`hand ${g.handNo}:`, g.log.slice(-1)[0], 'tables', g.tables); }
      if (hands >= 3) { console.log('socket e2e passed'); process.exit(0); }
      if (g.phase === 'handover') s.emit('nextHand');   // host clicks Next hand
    }
    if (g.turn === r.mySeat) act(s, r);
  });
  function act(sock, r) {
    const g = r.game;
    if (g.phase === 'bidding') {
      const L = g.legal.bid;
      sock.emit('bid', L.pass ? { type: 'pass' } : { type: 'bid', value: L.minBid, suit: L.suits[0] });
    } else if (g.phase === 'selfraise' && g.legal.bid.keep) sock.emit('bid', { type: 'keep' });
    else if (g.phase === 'playing' && g.legal.cards.length) sock.emit('play', { cardId: g.legal.cards[0] });
  }
  setTimeout(() => { console.error('timeout'); process.exit(1); }, 20000);
});
