// End-to-end: one human socket + 5 bots plays a full hand through the real server.
process.env.PORT = 0; process.env.BOT_DELAY_MS = 5; process.env.BOT_BID_DELAY_MS = 5; process.env.TRICK_PAUSE_MS = 5;
const { server } = require('../src/server');
const { io } = require('socket.io-client');
server.listen(0, () => {
  const url = `http://localhost:${server.address().port}`;
  const s = io(url, { transports: ['websocket'] });
  let started = false, hands = 0, guest;
  s.on('connect', () => s.emit('hello', {}));
  s.on('token', () => s.emit('createRoom', { name: 'Tester' }));
  s.on('errorMsg', (m) => { console.error('server error:', m); process.exit(1); });
  s.on('room', (r) => {
    if (!guest) {                         // a second human joins via code
      guest = io(url, { transports: ['websocket'] });
      guest.on('connect', () => guest.emit('hello', {}));
      guest.on('token', () => guest.emit('joinRoom', { code: r.code, name: 'Guest' }));
      guest.on('room', (gr) => { if (gr.game && gr.game.turn === gr.mySeat) act(guest, gr); });
    }
    if (!started && r.seats.filter((x) => x.kind === 'human').length === 2) {
      if (r.botStyle !== 'aggressive') { s.emit('botStyle', { style: 'aggressive' }); return; }
      started = true; s.emit('start'); return;
    }
    const g = r.game; if (!g) return;
    if (g.phase === 'handover' || g.phase === 'matchover') {
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
    } else if (g.phase === 'playing' && g.legal.cards.length) sock.emit('play', { cardId: g.legal.cards[0] });
  }
  setTimeout(() => { console.error('timeout'); process.exit(1); }, 20000);
});
