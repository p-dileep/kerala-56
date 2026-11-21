'use strict';
// End-to-end: a 6-player table plays one hand through the real server; the card review arrives in the room
// payload (own number for the seated player, none for a watcher) and is stored with the hand in the local log.
// A second human sits down and drops out: the bot plays their cards, and the log marks those cards `auto`.
process.env.PORT = 0; process.env.HAND_LOG = require('path').join(require('os').tmpdir(), `g56_review_test_${process.pid}.jsonl`);
process.env.PLAYERS_FILE = 'off'; process.env.BOT_DELAY_MS = 5; process.env.BOT_BID_DELAY_MS = 5; process.env.TRICK_PAUSE_MS = 5;
process.env.AWAY_TAKEOVER_MS = 50; process.env.REVIEW = 'on'; process.env.REVIEW_NODES = '20000000';
const fs = require('fs');
const { server } = require('../src/server');
const { io } = require('socket.io-client');

const fail = (m) => { console.error('review e2e:', m); process.exit(1); };
const hasKey = (o, k) => JSON.stringify(o).includes(`"${k}"`);
server.listen(0, () => {
  const url = `http://localhost:${server.address().port}`;
  const s = io(url, { transports: ['websocket'] });
  let started = false, mate = null, mateSeat = null, watcher = null, key = null, target = null, sawPending = false, mineDone = false, watchDone = false, sat = false, retries = 0;
  const done = (tries = 0) => {
    if (!mineDone || !watchDone) return;
    if (!sat) {                                        // the watcher takes a bot's seat after the hand: still no number
      const bot = lastRoom.seats.findIndex((x) => x.kind === 'bot');
      watcher.emit('sit', { seat: bot, name: 'Watcher' });
      return;
    }
    const lines = fs.readFileSync(process.env.HAND_LOG, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const hand = lines.find((l) => l.hand_no === target && l.dealt), stored = lines.find((l) => l.review_of === hand.id);
    const mates = hand.played.filter((p) => p.seat === mateSeat);
    if (!mates.length || !mates.every((p) => p.auto) || hand.played.some((p) => p.seat !== mateSeat && p.auto)) fail('takeover cards not marked auto');
    if (!stored && tries < 30) return setTimeout(() => done(tries + 1), 100);   // stored just after it is shown
    if (!stored || !(Array.isArray(stored.review.given) || stored.review.none)) fail('review not stored with the hand ' + JSON.stringify(stored));
    fs.rmSync(process.env.HAND_LOG, { force: true });
    console.log('review e2e passed'); process.exit(0);
  };
  const reviewed = (rv) => rv && rv.key === key && !rv.pending;
  const shapeOk = (rv, seated) => {
    if (rv.none) return ['budget', 'timeout', 'busy'].includes(rv.none);
    return ['best', 'playedOut', 'avg'].every((k) => typeof rv[k] === 'number') && typeof rv.stopped === 'boolean'
      && (seated ? typeof rv.mine === 'number' : !('mine' in rv));
  };
  s.on('connect', () => s.emit('hello', {}));
  s.on('token', () => s.emit('createRoom', { name: 'Tester', players: 6 }));
  s.on('errorMsg', (m) => fail('server error: ' + m));
  let lastRoom = null;
  s.on('room', (r) => {
    lastRoom = r;
    if (hasKey(r, 'given') || hasKey(r, 'autoGiven')) fail('other seats\' numbers leaked');
    if (!mate) {                                       // a second human sits down, then leaves once play starts
      mate = io(url, { transports: ['websocket'] });
      mate.on('connect', () => mate.emit('hello', {}));
      mate.on('token', () => mate.emit('joinRoom', { code: r.code, name: 'Mate' }));
      mate.on('room', (mr) => {
        if (mr.mySeat !== null) mateSeat = mr.mySeat;
        if (mateSeat !== null && !started) { started = true; s.emit('start'); } if (mr.game && !mate.left) { mate.left = true; mate.disconnect(); } });
      return;
    }
    const g = r.game; if (!g) return;
    if (!watcher && g.phase === 'playing') {          // a second socket walks in to watch
      watcher = io(url, { transports: ['websocket'] });
      watcher.on('connect', () => watcher.emit('hello', {}));
      watcher.on('token', () => watcher.emit('joinRoom', { code: r.code, name: 'Watcher' }));
      watcher.on('room', (wr) => {
        if (hasKey(wr, 'given')) fail('watcher saw seat numbers');
        if (wr.mySeat !== null) {
          if (wr.review && wr.review.key === key && 'mine' in wr.review) fail('a newcomer in the seat saw the last player number');
          if (!sat && wr.review && wr.review.key === key) { sat = true; done(); }
          return;
        }
        if (reviewed(wr.review) && !watchDone) {
          if (!shapeOk(wr.review, false)) fail('watcher review shape ' + JSON.stringify(wr.review));
          watchDone = true; done();
        }
      });
    }
    if ((g.phase === 'handover' || g.phase === 'matchover') && (target === null || g.handNo === target)) {
      if (g.result.void) { if (g.phase === 'handover') s.emit('nextHand'); return; }   // void hands get no review: wait for the next deal
      target = g.handNo;
      if (!r.review) fail('no review field at hand end');
      key = key || r.review.key;
      if (r.review.handNo !== g.handNo || r.review.key !== key) fail('review for the wrong hand ' + JSON.stringify(r.review));
      if (r.review.pending) sawPending = true;
      if (process.env.E2E_TRACE && reviewed(r.review)) console.log('review', JSON.stringify(r.review));
      if (reviewed(r.review) && !mineDone) {
        if (!shapeOk(r.review, true)) fail('seated review shape ' + JSON.stringify(r.review));
        if (r.review.none && g.phase === 'handover' && ++retries < 8) {   // over budget: try the next hand, to get numbers
          key = null; target = null; sawPending = false; watchDone = false;
          s.emit('nextHand');
          return;
        }
        if (!sawPending) fail('no pending state before the review');
        mineDone = true; done();
      }
      return;
    }
    if (g.turn !== r.mySeat) return;
    const at = [g.handNo, g.phase, g.bidding && g.bidding.actions.length, g.trickNo, g.trick && g.trick.cards.length].join(':');
    if (s.actedAt === at) return;   // the same turn can arrive in several updates
    s.actedAt = at;
    if (g.phase === 'bidding') s.emit('bid', g.legal.bid.pass ? { type: 'pass' } : { type: 'bid', value: g.legal.bid.minBid, suit: g.legal.bid.suits[0] });
    else if (g.phase === 'selfraise' && g.legal.bid.keep) s.emit('bid', { type: 'keep' });
    else if (g.phase === 'playing' && g.legal.cards.length) s.emit('play', { cardId: g.legal.cards[0] });
  });
  setTimeout(() => fail(`timeout (mine ${mineDone}, watcher ${watchDone}, pending seen ${sawPending})`), 90000).unref();
});
