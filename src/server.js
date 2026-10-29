'use strict';
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const E = require('./engine');
const Bot = require('./bot');

const PORT = Number(process.env.PORT) || 3056;
const BOT_DELAY_MS = Number(process.env.BOT_DELAY_MS) || 900;
const BOT_BID_DELAY_MS = Number(process.env.BOT_BID_DELAY_MS) || BOT_DELAY_MS + 1000; // calls read slower than card plays
const TRICK_PAUSE_MS = Number(process.env.TRICK_PAUSE_MS) || 2200;
const AWAY_TAKEOVER_MS = Number(process.env.AWAY_TAKEOVER_MS) || 20000; // bot plays for a disconnected human
const ROOM_IDLE_MS = 1000 * 60 * 60 * 3;

const BOT_NAMES = ['Kuttan', 'Ammini', 'Pappan', 'Chinnu', 'Unni', 'Kunjamma', 'Appu', 'Sarojini', 'Mathai', 'Leela'];

const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }));
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: false } });

/** code -> room */
const rooms = new Map();

function makeCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 5 }, () => alphabet[crypto.randomInt(alphabet.length)]).join('');
  } while (rooms.has(code));
  return code;
}

const clean = (s, n = 18) => String(s || '').replace(/[<>]/g, '').trim().slice(0, n);
const emptySeat = () => ({ kind: 'empty', name: null, token: null, socketId: null, connected: false });

function createRoom(hostToken, players = 6, code = null) {
  const room = {
    code: code || makeCode(),
    hostToken,
    players,
    fixed: !!code,          // permanent lobby table: never deleted, reset when empty
    seats: Array.from({ length: players }, emptySeat),
    game: null,
    botStyle: 'medium',
    chat: [],
    timer: null,
    awaySince: {},
    touched: Date.now(),
    version: 0
  };
  rooms.set(room.code, room);
  return room;
}

// Two permanent tables everyone can walk into from the lobby.
const FIXED = [{ code: 'TABLE6', players: 6 }, { code: 'TABLE8', players: 8 }];
FIXED.forEach((t) => createRoom(null, t.players, t.code));

// The host is the first connected human; when they leave, the next one takes over.
function ensureHost(room) {
  const cur = room.seats.find((s) => s.kind === 'human' && s.token === room.hostToken);
  if (cur && cur.connected) return;
  const next = room.seats.find((s) => s.kind === 'human' && s.connected) || cur;
  if (next && next.token !== room.hostToken) { room.hostToken = next.token; sysChat(room, `${next.name} is now the host.`); }
}

function resetFixed(room) {
  clearTimeout(room.timer);
  room.seats = Array.from({ length: room.players }, emptySeat);
  room.game = null; room.chat = []; room.hostToken = null; room.botStyle = 'medium'; room.touched = Date.now();
}

function lobbyInfo() {
  return FIXED.map((t) => { const r = rooms.get(t.code); return { code: t.code, players: t.players,
    seated: r.seats.filter((s) => s.kind === 'human' && s.connected).length, playing: !!r.game && r.game.phase !== 'matchover', hasGame: !!r.game }; });
}

function seatOfToken(room, token) {
  return room.seats.findIndex((s) => s.kind === 'human' && s.token === token);
}

function publicSeats(room) {
  return room.seats.map((s, i) => ({
    seat: i, team: E.team(i), kind: s.kind, name: s.name,
    connected: s.kind === 'bot' ? true : s.connected
  }));
}

function broadcast(room) {
  room.version++;
  room.touched = Date.now();
  ensureHost(room);
  if (room.fixed) io.emit('lobby', lobbyInfo());
  const sockets = io.sockets.adapter.rooms.get(room.code) || new Set();
  for (const sid of sockets) {
    const sock = io.sockets.sockets.get(sid);
    if (!sock) continue;
    const seat = seatOfToken(room, sock.data.token);
    sock.emit('room', {
      code: room.code,
      players: room.players,
      fixed: room.fixed,
      isHost: sock.data.token === room.hostToken,
      botStyle: room.botStyle,
      mySeat: seat >= 0 ? seat : null,
      seats: publicSeats(room),
      chat: room.chat.slice(-40),
      game: room.game ? E.getView(room.game, seat >= 0 ? seat : null) : null
    });
  }
  schedule(room);
}

function sysChat(room, text) {
  room.chat.push({ from: null, text, at: Date.now() });
}

/** Drive bots, trick pauses, hand transitions and away-player takeovers. */
function schedule(room) {
  clearTimeout(room.timer);
  const g = room.game;
  if (!g) return;
  // Pause the table while no human is connected; resumes on reconnect.
  if (!room.seats.some((s) => s.kind === 'human' && s.connected)) return;

  if (g.phase === 'playing' && g.trick.complete) {
    room.timer = setTimeout(() => { E.collectTrick(g); broadcast(room); }, TRICK_PAUSE_MS);
    return;
  }
  if (g.phase === 'handover') return;   // the host clicks "Next hand" when everyone has seen the result
  if (g.turn === null || (g.phase !== 'bidding' && g.phase !== 'playing')) return;

  const seat = room.seats[g.turn];
  let delay = null;
  if (seat.kind === 'bot') delay = g.phase === 'bidding' ? BOT_BID_DELAY_MS : BOT_DELAY_MS;
  else if (seat.kind === 'human' && !seat.connected) {
    const since = room.awaySince[g.turn] || Date.now();
    delay = Math.max(800, AWAY_TAKEOVER_MS - (Date.now() - since));
  }
  if (delay === null) return;
  const turnAtSchedule = g.turn, version = room.version;
  room.timer = setTimeout(() => {
    if (room.version !== version || g.turn !== turnAtSchedule) return;
    autoAct(room, turnAtSchedule);
  }, delay);
}

function autoAct(room, seat) {
  const g = room.game;
  try {
    const d = Bot.decide(Bot.botView(g, seat), Bot.paramsFor(room.botStyle));
    if (!d) return;
    if (d.kind === 'bid') E.applyBid(g, seat, d.action);
    else E.playCard(g, seat, d.cardId);
  } catch (err) {
    console.error('bot error', err);
  }
  broadcast(room);
}

function startMatch(room) {
  const used = new Set(room.seats.map((s) => s.name));
  const freeNames = BOT_NAMES.filter((n) => !used.has(n));
  room.seats.forEach((s, i) => {
    if (s.kind === 'empty') room.seats[i] = { ...emptySeat(), kind: 'bot', name: freeNames.shift() || `Bot ${i + 1}` };
  });
  room.game = E.newMatch({ players: room.players });
  sysChat(room, 'Match started. Good luck!');
}

// ---------------------------------------------------------------- sockets

io.on('connection', (socket) => {
  socket.data.token = null;
  socket.data.room = null;

  const fail = (msg) => socket.emit('errorMsg', msg);
  const getRoom = () => rooms.get(socket.data.room);

  socket.on('hello', ({ token } = {}) => {
    socket.data.token = typeof token === 'string' && token.length >= 16 ? token.slice(0, 64) : crypto.randomUUID();
    socket.emit('token', socket.data.token);
    socket.emit('lobby', lobbyInfo());
  });

  socket.on('createRoom', ({ name, players } = {}) => {
    if (!socket.data.token) return fail('Not ready');
    if (!clean(name)) return fail('Please type your name first.');
    const room = createRoom(socket.data.token, Number(players) === 8 ? 8 : 6);
    room.seats[0] = { kind: 'human', name: clean(name) || 'Host', token: socket.data.token, socketId: socket.id, connected: true };
    socket.join(room.code);
    socket.data.room = room.code;
    sysChat(room, `${room.seats[0].name} created the table.`);
    broadcast(room);
  });

  socket.on('joinRoom', ({ code, name } = {}) => {
    if (!socket.data.token) return fail('Not ready');
    const room = rooms.get(String(code || '').toUpperCase().trim());
    if (!room) return fail('Room not found. Check the code.');
    if (!clean(name) && seatOfToken(room, socket.data.token) < 0) return fail('Please type your name first.');
    socket.join(room.code);
    socket.data.room = room.code;

    let seat = seatOfToken(room, socket.data.token);
    if (seat >= 0) {                                   // reconnect
      Object.assign(room.seats[seat], { socketId: socket.id, connected: true });
      delete room.awaySince[seat];
      if (name) room.seats[seat].name = clean(name) || room.seats[seat].name;
    } else if (!room.game) {                           // auto-sit in first empty seat
      seat = room.seats.findIndex((s) => s.kind === 'empty');
      if (seat >= 0) {
        room.seats[seat] = { kind: 'human', name: clean(name) || `Player ${seat + 1}`, token: socket.data.token, socketId: socket.id, connected: true };
        sysChat(room, `${room.seats[seat].name} joined.`);
      }
    }
    broadcast(room);
  });

  // Take a specific seat (empty seat before the match, or a bot's seat at any time)
  socket.on('sit', ({ seat, name } = {}) => {
    const room = getRoom();
    if (!room) return;
    seat = Number(seat);
    if (!(seat >= 0 && seat < room.players)) return;
    const target = room.seats[seat];
    const canTake = target.kind === 'empty' ? !room.game : target.kind === 'bot';
    if (!canTake) return fail('That seat is taken.');
    const cur = seatOfToken(room, socket.data.token);
    let myName = clean(name);
    if (cur >= 0) {
      myName = myName || room.seats[cur].name;
      room.seats[cur] = room.game ? { ...emptySeat(), kind: 'bot', name: BOT_NAMES[cur] } : emptySeat();
      if (room.game) sysChat(room, `${BOT_NAMES[cur]} took over ${myName}'s old seat.`);
    }
    room.seats[seat] = { kind: 'human', name: myName || `Player ${seat + 1}`, token: socket.data.token, socketId: socket.id, connected: true };
    if (target.kind === 'bot') sysChat(room, `${room.seats[seat].name} took over from ${target.name}.`);
    broadcast(room);
  });

  socket.on('setBot', ({ seat, on } = {}) => {
    const room = getRoom();
    if (!room || socket.data.token !== room.hostToken || room.game) return;
    seat = Number(seat);
    const s = room.seats[seat];
    if (!s) return;
    if (on && s.kind === 'empty') room.seats[seat] = { ...emptySeat(), kind: 'bot', name: BOT_NAMES[seat] };
    if (!on && s.kind === 'bot') room.seats[seat] = emptySeat();
    broadcast(room);
  });

  socket.on('kick', ({ seat } = {}) => {
    const room = getRoom();
    if (!room) return;
    const s = room.seats[Number(seat)];
    if (!s || s.kind !== 'human' || s.token === socket.data.token) return;
    // any seated player (or the host) may remove another player: small friends-only tables
    if (socket.data.token !== room.hostToken && seatOfToken(room, socket.data.token) < 0) return fail('Sit down first.');
    sysChat(room, `${s.name} was replaced by a bot.`);
    room.seats[Number(seat)] = room.game ? { ...emptySeat(), kind: 'bot', name: BOT_NAMES[Number(seat)] } : emptySeat();
    broadcast(room);
  });

  socket.on('botStyle', ({ style } = {}) => {
    const room = getRoom();
    if (!room || socket.data.token !== room.hostToken) return fail('Only the host can change the bots');
    if (!Bot.STYLES[style]) return fail('Unknown bot style');
    room.botStyle = style;
    sysChat(room, `Bots set to ${style}.`);
    broadcast(room);
  });

  // Lobby: clear a permanent table that still holds an old game but has nobody connected
  socket.on('resetTable', ({ code } = {}) => {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room || !room.fixed) return;
    if (room.seats.some((s) => s.kind === 'human' && s.connected)) return fail('Someone is still at that table.');
    resetFixed(room);
    io.emit('lobby', lobbyInfo());
  });

  socket.on('resetChips', () => {
    const room = getRoom();
    if (!room || socket.data.token !== room.hostToken) return fail('Only the host can reset the chips');
    if (!room.game) return;
    E.resetChips(room.game);
    sysChat(room, 'Chips reset to 12 each.');
    broadcast(room);
  });

  socket.on('nextHand', () => {
    const room = getRoom();
    if (!room || socket.data.token !== room.hostToken) return;
    if (!room.game || room.game.phase !== 'handover') return;
    E.nextHand(room.game);
    broadcast(room);
  });

  socket.on('start', () => {
    const room = getRoom();
    if (!room || socket.data.token !== room.hostToken) return;
    if (room.game && room.game.phase !== 'matchover') return;
    startMatch(room);
    broadcast(room);
  });

  socket.on('bid', (action = {}) => {
    const room = getRoom();
    if (!room || !room.game) return;
    const seat = seatOfToken(room, socket.data.token);
    try { E.applyBid(room.game, seat, action); } catch (e) { return fail(e.message); }
    broadcast(room);
  });

  socket.on('play', ({ cardId } = {}) => {
    const room = getRoom();
    if (!room || !room.game) return;
    const seat = seatOfToken(room, socket.data.token);
    try { E.playCard(room.game, seat, String(cardId)); } catch (e) { return fail(e.message); }
    broadcast(room);
  });

  socket.on('chat', ({ text } = {}) => {
    const room = getRoom();
    if (!room) return;
    const seat = seatOfToken(room, socket.data.token);
    const t = clean(text, 200);
    if (!t) return;
    room.chat.push({ from: seat >= 0 ? room.seats[seat].name : 'Guest', seat: seat >= 0 ? seat : null, text: t, at: Date.now() });
    broadcast(room);
  });

  socket.on('leave', () => {
    const room = getRoom();
    if (!room) return;
    const seat = seatOfToken(room, socket.data.token);
    if (seat >= 0) {
      const name = room.seats[seat].name;
      room.seats[seat] = room.game ? { ...emptySeat(), kind: 'bot', name: BOT_NAMES[seat] } : emptySeat();
      sysChat(room, `${name} left${room.game ? ' — a bot took the seat' : ''}.`);
    }
    socket.leave(room.code);
    socket.data.room = null;
    broadcast(room);
  });

  socket.on('disconnect', () => {
    const room = getRoom();
    if (!room) return;
    const seat = seatOfToken(room, socket.data.token);
    if (seat >= 0 && room.seats[seat].socketId === socket.id) {
      room.seats[seat].connected = false;
      room.awaySince[seat] = Date.now();
      broadcast(room);
    }
  });
});

// Clean up idle rooms
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const anyone = room.seats.some((s) => s.kind === 'human' && s.connected);
    if (!anyone && now - room.touched > ROOM_IDLE_MS) {
      clearTimeout(room.timer);
      if (room.fixed) resetFixed(room);   // the permanent table is cleared for the next group
      else rooms.delete(code);
    }
  }
}, 60 * 1000).unref();

if (require.main === module) {
  server.listen(PORT, () => console.log(`56 server listening on http://localhost:${PORT}`));
}

module.exports = { server, io, rooms };
