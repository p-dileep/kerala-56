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
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const GAME_VERSION = process.env.GAME_VERSION || process.env.RENDER_GIT_COMMIT || null;

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
    botStyle: 'mixed',
    teamNames: ['Team A', 'Team B'],
    chat: [],
    timer: null,
    awaySince: {},
    touched: Date.now(),
    version: 0,
    loggedHand: 0,
    concede: null           // pending concede request: { team, by } (seat index), humans of that team only
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
  room.game = null; room.chat = []; room.hostToken = null; room.botStyle = 'mixed'; room.teamNames = ['Team A', 'Team B']; room.touched = Date.now();
}

function lobbyInfo() {
  return FIXED.map((t) => { const r = rooms.get(t.code); return { code: t.code, players: t.players,
    seated: r.seats.filter((s) => s.kind === 'human' && s.connected).length, watching: watchers(r).length, playing: !!r.game && r.game.phase !== 'matchover', hasGame: !!r.game }; });
}

// Connected people in the room who hold no seat (one entry per browser token).
function watchers(room) {
  const out = [], seen = new Set();
  for (const sid of io.sockets.adapter.rooms.get(room.code) || []) {
    const sock = io.sockets.sockets.get(sid);
    if (!sock || seatOfToken(room, sock.data.token) >= 0 || seen.has(sock.data.token)) continue;
    seen.add(sock.data.token);
    out.push(sock.data.name || 'Guest');
  }
  return out;
}

function seatOfToken(room, token) {
  return room.seats.findIndex((s) => s.kind === 'human' && s.token === token);
}

function publicSeats(room) {
  return room.seats.map((s, i) => ({
    seat: i, team: E.team(i), kind: s.kind, name: s.name,
    connected: s.kind === 'bot' ? true : s.connected,
    tuned: s.kind === 'bot' && Bot.HUMAN_TUNED_BOTS.has(s.name)
  }));
}

// Fire-and-forget: one row per finished hand. Never blocks or throws into the game loop.
function logHand(room) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  const g = room.game;
  const row = {
    room: room.code,
    players: room.players,
    hand_no: g.handNo,
    dealer: g.dealer,
    bot_style: room.botStyle,
    seats: room.seats.map((s) => ({ kind: s.kind, name: s.name })),
    dealt: g.dealt.map((h) => h.map((c) => c.id)),
    auction: g.bidding.actions,
    contract: g.contract,
    played: g.played,
    result: g.result,
    tables_after: g.tables,
    game_version: GAME_VERSION
  };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  fetch(`${SUPABASE_URL}/rest/v1/hands`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(row),
    signal: ctrl.signal
  }).then((r) => { if (!r.ok) console.error('hand log failed', r.status); })
    .catch((err) => console.error('hand log error', err.message))
    .finally(() => clearTimeout(t));
}

function broadcast(room) {
  room.version++;
  const g = room.game;
  if (room.concede && (!g || g.phase !== 'playing')) room.concede = null;   // the hand ended on its own
  if (g && (g.phase === 'handover' || g.phase === 'matchover') && room.loggedHand !== g.handNo) {
    room.loggedHand = g.handNo;
    logHand(room);
  }
  room.touched = Date.now();
  ensureHost(room);
  if (room.fixed) io.emit('lobby', lobbyInfo());
  const sockets = io.sockets.adapter.rooms.get(room.code) || new Set();
  const watching = watchers(room);
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
      teamNames: room.teamNames,
      botPersonality: Bot.BOT_PERSONALITY,
      mySeat: seat >= 0 ? seat : null,
      concede: room.concede && seat >= 0 && E.team(seat) === room.concede.team ? room.concede : null,
      seats: publicSeats(room),
      watchers: watching,
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
  if (g.turn === null || (g.phase !== 'bidding' && g.phase !== 'selfraise' && g.phase !== 'playing')) return;

  const seat = room.seats[g.turn];
  let delay = null;
  if (seat.kind === 'bot') delay = g.phase === 'playing' ? BOT_DELAY_MS : BOT_BID_DELAY_MS;
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
    const d = Bot.decide(Bot.botView(g, seat), Bot.paramsFor(room.botStyle, room.seats[seat].name));
    if (!d) return;
    if (d.kind === 'bid') E.applyBid(g, seat, d.action);
    else E.playCard(g, seat, d.cardId);
  } catch (err) {
    console.error('bot error', err);
  }
  broadcast(room);
}

// Name for a bot at `seat`. A team with a human on it gets exactly one human-tuned bot
// (Bot.HUMAN_TUNED_BOTS); its other bots come from the self-play half. All-bot teams: any free name.
function botName(room, seat) {
  const used = new Set(room.seats.filter((s, i) => i !== seat).map((s) => s.name));
  const free = BOT_NAMES.filter((n) => !used.has(n));
  const mates = room.seats.filter((s, i) => i !== seat && i % 2 === seat % 2);
  let pool = free;
  if (mates.some((s) => s.kind === 'human')) {
    const wantTuned = !mates.some((s) => s.kind === 'bot' && Bot.HUMAN_TUNED_BOTS.has(s.name));
    const fit = free.filter((n) => Bot.HUMAN_TUNED_BOTS.has(n) === wantTuned);
    if (fit.length) pool = fit;
  }
  return pool.includes(BOT_NAMES[seat]) ? BOT_NAMES[seat] : pool[0] || `Bot ${seat + 1}`;
}

function startMatch(room) {
  // every bot (pre-set by the host or filling an empty seat) is named afresh, now that the teams are known
  room.seats.forEach((s, i) => {
    if (s.kind !== 'human') room.seats[i] = { ...emptySeat(), kind: 'bot' };
  });
  room.seats.forEach((s, i) => {
    if (s.kind === 'bot') s.name = botName(room, i);
  });
  room.game = E.newMatch({ players: room.players });
  room.loggedHand = 0;
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

  socket.on('createRoom', ({ name, players, team } = {}) => {
    if (!socket.data.token) return fail('Not ready');
    if (!clean(name)) return fail('Please type your name first.');
    const room = createRoom(socket.data.token, Number(players) === 8 ? 8 : 6);
    socket.data.name = clean(name);
    const hostSeat = Number(team) === 1 ? 1 : 0;       // seat parity is the team (even = A, odd = B)
    room.seats[hostSeat] = { kind: 'human', name: clean(name) || 'Host', token: socket.data.token, socketId: socket.id, connected: true };
    socket.join(room.code);
    socket.data.room = room.code;
    sysChat(room, `${room.seats[hostSeat].name} created the table.`);
    broadcast(room);
  });

  socket.on('joinRoom', ({ code, name, team } = {}) => {
    if (!socket.data.token) return fail('Not ready');
    const room = rooms.get(String(code || '').toUpperCase().trim());
    if (!room) return fail('Room not found. Check the code.');
    if (!clean(name) && seatOfToken(room, socket.data.token) < 0) return fail('Please type your name first.');
    socket.join(room.code);
    socket.data.room = room.code;
    if (clean(name)) socket.data.name = clean(name);

    let seat = seatOfToken(room, socket.data.token);
    if (seat >= 0) {                                   // reconnect
      Object.assign(room.seats[seat], { socketId: socket.id, connected: true });
      delete room.awaySince[seat];
      if (name) room.seats[seat].name = clean(name) || room.seats[seat].name;
    } else if (!room.game) {                           // auto-sit: first empty seat on the chosen team, else any
      const want = team === 0 || team === 1 ? team : null;
      if (want !== null) seat = room.seats.findIndex((s, i) => s.kind === 'empty' && E.team(i) === want);
      if (seat < 0) seat = room.seats.findIndex((s) => s.kind === 'empty');
      if (want !== null && seat >= 0 && E.team(seat) !== want) fail(`${room.teamNames[want]} is full, so you are on ${room.teamNames[1 - want]}.`);
      if (seat >= 0) {
        room.seats[seat] = { kind: 'human', name: clean(name) || `Player ${seat + 1}`, token: socket.data.token, socketId: socket.id, connected: true };
        sysChat(room, `${room.seats[seat].name} joined.`);
      }
    }
    if (seat < 0) sysChat(room, `${socket.data.name || 'Guest'} is watching.`);
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
    if (myName) socket.data.name = myName;
    if (cur >= 0) {
      myName = myName || room.seats[cur].name;
      room.seats[cur] = emptySeat();
    }
    room.seats[seat] = { kind: 'human', name: myName || `Player ${seat + 1}`, token: socket.data.token, socketId: socket.id, connected: true };
    if (cur >= 0 && room.game) {
      room.seats[cur] = { ...emptySeat(), kind: 'bot', name: botName(room, cur) };
      sysChat(room, `${room.seats[cur].name} took over ${myName}'s old seat.`);
    }
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
    room.seats[Number(seat)] = room.game ? { ...emptySeat(), kind: 'bot', name: botName(room, Number(seat)) } : emptySeat();
    broadcast(room);
  });

  socket.on('botStyle', ({ style } = {}) => {
    const room = getRoom();
    if (!room || socket.data.token !== room.hostToken) return fail('Only the host can change the bots');
    if (!Bot.STYLES[style] && style !== 'mixed') return fail('Unknown bot style');
    room.botStyle = style;
    sysChat(room, `Bots set to ${style}.`);
    broadcast(room);
  });

  // Any seated player may rename a team; the name is shared by everyone at the table.
  socket.on('teamName', ({ team, name } = {}) => {
    const room = getRoom();
    if (!room) return;
    if (socket.data.token !== room.hostToken && seatOfToken(room, socket.data.token) < 0) return fail('Sit down first.');
    team = Number(team);
    if (team !== 0 && team !== 1) return;
    const n = clean(name, 14) || ['Team A', 'Team B'][team];
    if (n === room.teamNames[team]) return;
    sysChat(room, `${room.teamNames[team]} is now called ${n}.`);
    room.teamNames[team] = n;
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

  // Concede the hand: a seated human proposes; one other connected human on the same team must agree
  // (if there is none, the proposer's word is enough). Bots take no part. Opponents never see the request.
  socket.on('concede', ({ action } = {}) => {
    const room = getRoom();
    if (!room || !room.game) return;
    const g = room.game;
    const seat = seatOfToken(room, socket.data.token);
    if (seat < 0) return fail('Only seated players can concede');
    const team = E.team(seat), name = room.seats[seat].name;
    const doConcede = () => {
      room.concede = null;
      E.concedeHand(g, team);
      sysChat(room, `${room.teamNames[team]} conceded the hand.`);
    };
    if (action === 'propose') {
      if (g.phase !== 'playing') return fail('You can only concede during play');
      if (room.concede) return fail('A concede request is already waiting');
      const mates = room.seats.filter((s, i) => i !== seat && E.team(i) === team && s.kind === 'human' && s.connected);
      if (mates.length) room.concede = { team, by: seat };
      else doConcede();
      return broadcast(room);
    }
    if (!room.concede || room.concede.team !== team) return;
    const proposer = room.seats[room.concede.by];
    if (action === 'withdraw' && room.concede.by === seat) { room.concede = null; return broadcast(room); }
    if (action === 'agree' && room.concede.by !== seat) {
      if (g.phase === 'playing') doConcede(); else room.concede = null;
      return broadcast(room);
    }
    if (action === 'decline' && room.concede.by !== seat) {
      room.concede = null;
      if (proposer.socketId) io.to(proposer.socketId).emit('errorMsg', `${name} wants to play on.`);
      return broadcast(room);
    }
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
      room.seats[seat] = room.game ? { ...emptySeat(), kind: 'bot', name: botName(room, seat) } : emptySeat();
      sysChat(room, `${name} left${room.game ? ' — a bot took the seat' : ''}.`);
    } else sysChat(room, `${socket.data.name || 'Guest'} stopped watching.`);
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
    } else if (seat < 0) broadcast(room);   // a watcher left: refresh the watcher list
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
