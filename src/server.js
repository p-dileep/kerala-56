'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const E = require('./engine');
const Bot = require('./bot');
const NetPlay = require('./netplay');
const { makeAccounts } = require('./accounts');
const { personal } = require('./review');
const { makeReviewQueue, reviewEnabled } = require('./reviewWorker');

const PORT = Number(process.env.PORT) || 3056;
const BOT_DELAY_MS = Number(process.env.BOT_DELAY_MS) || 900;
const BOT_BID_DELAY_MS = Number(process.env.BOT_BID_DELAY_MS) || BOT_DELAY_MS + 1000; // calls read slower than card plays
const TRICK_PAUSE_MS = Number(process.env.TRICK_PAUSE_MS) || 2200;
const AWAY_TAKEOVER_MS = Number(process.env.AWAY_TAKEOVER_MS) || 20000; // bot plays for a disconnected human
// Connection diary (stdout -> logs/play56.out.log): who dropped, when they came back, when a bot had to step in.
const glog = (room, msg) => console.log(`${new Date().toISOString()} [${room ? room.code : '-'}] ${msg}`);
const ROOM_IDLE_MS = 1000 * 60 * 60 * 3;
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
// Without Supabase (a local server) every finished hand goes to a local file instead, same row format.
// HAND_LOG=<file> chooses the file, HAND_LOG=off turns it off (the socket test).
const LOCAL_HAND_LOG = process.env.HAND_LOG === 'off' ? '' :
  process.env.HAND_LOG || (SUPABASE_URL ? '' : path.join(__dirname, '..', 'data', 'local_hands.jsonl'));
// "<site>@<commit>": both sites log to the same Supabase table, the prefix says which one the hand came from
const COMMIT = process.env.GAME_VERSION || process.env.RENDER_GIT_COMMIT || null;
const GAME_VERSION = COMMIT && `${process.env.RENDER ? 'render' : 'play56.in'}@${COMMIT}`;

const BOT_NAMES = ['Kuttan', 'Ammini', 'Pappan', 'Chinnu', 'Unni', 'Kunjamma', 'Navratilova', 'Buffett', 'Chamberlain', 'Eisenhower'];
// Neural-net bots (card play by src/netplay.js, 6 players only). A 6-player match always gets at least one.
const PICK_ONLY = NetPlay.NAMES;
const pickRandom = (a) => a[crypto.randomInt(a.length)];

// Player accounts (name + PIN) that keep a record per player. Supabase table `players` when Supabase is set,
// else a local file; PLAYERS_FILE=<file> chooses the file, PLAYERS_FILE=off keeps them in memory (the socket test).
const accounts = makeAccounts({
  url: SUPABASE_URL && SUPABASE_KEY ? SUPABASE_URL : '', key: SUPABASE_KEY, secret: process.env.LOGIN_SECRET || '',
  file: process.env.PLAYERS_FILE === 'off' ? '' : process.env.PLAYERS_FILE || path.join(__dirname, '..', 'data', 'local_players.json'),
  reserved: [...BOT_NAMES, ...PICK_ONLY]
});

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
    kunukku: [],                    // seat index -> true while that seat wears the loser's kunukku
    kunukkuFresh: [false, false],   // team got it at the last match end and no hand has been finished since
    concede: null          // pending concede request: { team, by } (seat index), humans of that team only
  };
  rooms.set(room.code, room);
  return room;
}

// Two permanent tables everyone can walk into from the lobby.
const FIXED = [{ code: 'TABLE6', players: 6 }, { code: 'TABLE8', players: 8 }];
FIXED.forEach((t) => createRoom(null, t.players, t.code));
// Reserved tables: permanent like the two above but not shown in the lobby; whoever knows the code
// walks in by link (?room=CODE) or by typing it. RESERVED_TABLES="CODE:6,OTHER:8" (5-6 letters or digits).
(process.env.RESERVED_TABLES || '').split(',').map((x) => x.trim().toUpperCase().split(':')).forEach(([code, n]) => {
  if (/^[A-Z0-9]{5,6}$/.test(code || '') && !rooms.has(code)) createRoom(null, Number(n) === 8 ? 8 : 6, code).reserved = true;
});

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
  room.kunukku = []; room.kunukkuFresh = [false, false];
  room.review = null;
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
    tuned: s.kind === 'bot' && Bot.HUMAN_TUNED_BOTS.has(s.name),
    picked: s.kind === 'bot' && !!s.picked,
    verified: s.kind === 'human' && !!s.pid,     // a registered player (name held by the account)
    kunukku: !!room.kunukku[i]
  }));
}

// One row per finished hand. Never blocks or throws into the game loop. Returns the row and a promise of its id
// (null on failure), so the card review can be stored on it later.
function logHand(room) {
  const g = room.game;
  const row = {
    room: room.code,
    players: room.players,
    hand_no: g.handNo,
    dealer: g.dealer,
    bot_style: room.botStyle,
    seats: room.seats.map((s) => ({ kind: s.kind, name: s.name, pid: s.pid || null })),
    dealt: g.dealt.map((h) => h.map((c) => c.id)),
    auction: g.bidding.actions,
    contract: g.contract,
    played: g.played,
    result: g.result,
    tables_after: g.tables,
    game_version: GAME_VERSION
  };
  let localId = null;
  if (LOCAL_HAND_LOG) {
    localId = Date.now();
    appendLocal({ id: localId, created_at: new Date().toISOString(), ...row });
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) return { row, id: Promise.resolve(localId) };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  const id = fetch(`${SUPABASE_URL}/rest/v1/hands?select=id`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(row),
    signal: ctrl.signal
  }).then(async (r) => {
    if (!r.ok) { console.error('hand log failed', r.status); return null; }
    const [x] = await r.json();
    return x ? x.id : null;
  }).catch((err) => { console.error('hand log error', err.message); return null; })
    .finally(() => clearTimeout(t));
  return { row, id };
}

// Local hand log lines are appended in order (a review line after its hand).
let localWrite = Promise.resolve();
function appendLocal(obj) {
  localWrite = localWrite.then(() => fs.promises.mkdir(path.dirname(LOCAL_HAND_LOG), { recursive: true }))
    .then(() => fs.promises.appendFile(LOCAL_HAND_LOG, JSON.stringify(obj) + '\n')).catch(() => {});
}

// ---------------------------------------------------------------- card review (with all cards visible)
// After each 6-player hand a worker thread solves the deal; the review is stored with the hand and shown to the
// table. Each player sees only their own points given away (personal()), next to the table average.
const reviews = reviewEnabled() ? makeReviewQueue() : null;
function queueReview(room, logged) {
  const g = room.game, r = g.result;
  room.handSeq = (room.handSeq || 0) + 1;
  const key = `${room.code}:${room.handSeq}`;
  if (!reviews || r.void || !g.played.length) { room.review = null; return; }
  // who held each seat when the hand ended: only they see that seat's number (a newcomer in the seat does not)
  const tokens = room.seats.map((x) => (x.kind === 'human' ? x.token : null));
  room.review = { key, handNo: g.handNo, players: room.players, tokens };
  if (room.players !== 6) { room.review.none = 'players'; return; }
  room.review.pending = true;
  reviews.enqueue(logged.row).then(async (review) => {
    if (room.review && room.review.key === key) {
      room.review = { key, handNo: g.handNo, players: room.players, tokens, stored: review };
      broadcast(room);
    }
    const id = await logged.id;
    if (id === null) return;
    if (LOCAL_HAND_LOG) appendLocal({ review_of: id, review });
    if (!SUPABASE_URL || !SUPABASE_KEY) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    fetch(`${SUPABASE_URL}/rest/v1/hands?id=eq.${id}`, {
      method: 'PATCH',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ review }),
      signal: ctrl.signal
    }).then((x) => { if (!x.ok) console.error('review store failed', x.status); })
      .catch((err) => console.error('review store error', err.message))
      .finally(() => clearTimeout(t));
  }).catch((err) => console.error('review apply error', err));
}
// The review as one socket sees it: the personal number only for the player who held the seat at the hand's end.
function reviewFor(room, seat) {
  const rv = room.review;
  if (!rv) return null;
  const out = { key: rv.key, handNo: rv.handNo, players: rv.players };
  if (rv.pending) out.pending = true;
  if (rv.none) out.none = rv.none;
  const own = seat >= 0 && rv.tokens && rv.tokens[seat] && room.seats[seat].token === rv.tokens[seat];
  if (rv.stored) Object.assign(out, personal(rv.stored, own ? seat : null));
  return out;
}

// A registered player's last `n` logged hands, newest first, from the same store logHand writes to.
// Only hands logged since accounts exist carry `pid` in their seats.
async function recentHands(pid, n = 5) {
  if (SUPABASE_URL && SUPABASE_KEY) {
    const cols = 'id,created_at,players,hand_no,dealer,seats,dealt,auction,contract,played,result,review';
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(`${SUPABASE_URL}/rest/v1/hands?select=${cols}&seats=cs.${encodeURIComponent(JSON.stringify([{ pid }]))}&order=id.desc&limit=${n}`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, signal: ctrl.signal }).finally(() => clearTimeout(t));
    if (!r.ok) throw new Error(`hands ${r.status}`);
    return r.json();
  }
  if (!LOCAL_HAND_LOG || !fs.existsSync(LOCAL_HAND_LOG)) return [];
  const lines = (await fs.promises.readFile(LOCAL_HAND_LOG, 'utf8')).split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  const review = new Map(lines.filter((l) => l.review_of != null).map((l) => [l.review_of, l.review]));
  return lines.filter((h) => h.seats && h.seats.some((x) => x.pid === pid)).slice(-n).reverse()
    .map((h) => ({ ...h, review: review.get(h.id) || null }));
}

// Kunukku: the team that loses a match wears it (every seat of that team) into the next match.
// If that team bids and makes the first hand after getting it, the whole team takes it off. After that a
// player sheds only their own, by being the bidder of a contract that is made. Void hands do not count.
// Winning that next match also takes it off the whole team; losing it puts it back on every seat.
function updateKunukku(room) {
  const g = room.game, r = g.result;
  if (r && !r.void) {
    const c = r.contract;
    if (r.made && room.kunukkuFresh[c.team] && room.kunukku.some((k, i) => k && E.team(i) === c.team)) {
      room.seats.forEach((s, i) => { if (E.team(i) === c.team) room.kunukku[i] = false; });
      sysChat(room, `${room.teamNames[c.team]} bid and won the first hand: the kunukku comes off the whole team!`);
    } else if (r.made && room.kunukku[c.seat]) {
      room.kunukku[c.seat] = false;
      sysChat(room, `${room.seats[c.seat].name} made the bid and takes off the kunukku.`);
    }
    room.kunukkuFresh = [false, false];
  }
  if (g.phase === 'matchover') {
    const loser = 1 - g.winner;
    if (room.kunukku.some((k, i) => k && E.team(i) === g.winner)) {
      room.seats.forEach((s, i) => { if (E.team(i) === g.winner) room.kunukku[i] = false; });
      sysChat(room, `${room.teamNames[g.winner]} won the match: the kunukku comes off the whole team!`);
    }
    room.seats.forEach((s, i) => { if (E.team(i) === loser) room.kunukku[i] = true; });
    room.kunukkuFresh[loser] = true;
    sysChat(room, `${room.teamNames[loser]} wears the kunukku!`);
  }
}

function broadcast(room) {
  room.version++;
  const g = room.game;
  if (room.concede && (!g || g.phase !== 'playing')) room.concede = null;   // the hand ended on its own
  if (g && (g.phase === 'handover' || g.phase === 'matchover') && room.loggedHand !== g.handNo) {
    room.loggedHand = g.handNo;
    updateKunukku(room);
    queueReview(room, logHand(room));
    // records of the registered players at the table; their lobby card updates at once
    const ids = accounts.recordHand(room.seats.map((s) => ({ pid: s.kind === 'human' ? s.pid || null : null })), g.result, g.phase === 'matchover' ? g.winner : null);
    for (const sid of io.sockets.adapter.rooms.get(room.code) || []) {
      const sock = io.sockets.sockets.get(sid);
      if (sock && ids.includes(sock.data.pid)) sock.emit('account', accounts.get(sock.data.pid), true);
    }
  }
  room.touched = Date.now();
  ensureHost(room);
  if (room.fixed && !room.reserved) io.emit('lobby', lobbyInfo());
  const sockets = io.sockets.adapter.rooms.get(room.code) || new Set();
  const watching = watchers(room);
  for (const sid of sockets) {
    const sock = io.sockets.sockets.get(sid);
    if (!sock) continue;
    const seat = seatOfToken(room, sock.data.token);
    sock.emit('room', {
      code: room.code,
      players: room.players,
      fixed: room.fixed && !room.reserved,   // a reserved table shows its code like a private one
      isHost: sock.data.token === room.hostToken,
      botStyle: room.botStyle,
      teamNames: room.teamNames,
      botPersonality: Bot.BOT_PERSONALITY,
      mySeat: seat >= 0 ? seat : null,
      concede: room.concede && seat >= 0 && E.team(seat) === room.concede.team ? room.concede : null,
      seats: publicSeats(room),
      watchers: watching,
      chat: room.chat.slice(-40),
      game: room.game ? E.getView(room.game, seat >= 0 ? seat : null) : null,
      review: reviewFor(room, seat)
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
  const s = room.seats[seat];
  if (s.kind === 'human') glog(room, `bot takes over for ${s.name} seat ${seat} after ${Math.round((Date.now() - (room.awaySince[seat] || Date.now())) / 1000)}s away (${g.phase})`);
  try {
    const view = Bot.botView(g, seat), name = room.seats[seat].name;
    const netCard = NetPlay.NAMES.includes(name) && s.kind === 'bot' && g.phase === 'playing' ? NetPlay.choose(view) : null;
    const d = netCard ? { kind: 'play', cardId: netCard } : Bot.decide(view, Bot.paramsFor(room.botStyle, name));
    if (!d) return;
    if (d.kind === 'bid') {
      const n = g.bidding.actions.length;
      E.applyBid(g, seat, d.action);
      // a call the bot made for an away human: the coach notes charge it to nobody
      if (s.kind === 'human') g.bidding.actions.slice(n).forEach((a) => { if (a.seat === seat) a.auto = true; });
    } else {
      E.playCard(g, seat, d.cardId);
      if (s.kind === 'human') g.played[g.played.length - 1].auto = true;   // the review charges these to nobody
    }
  } catch (err) {
    console.error('bot error', err);
  }
  broadcast(room);
}

// Name for a bot at `seat`. A team with a human on it gets exactly one human-tuned bot
// (Bot.HUMAN_TUNED_BOTS); its other bots come from the self-play half and the neural bots. All-bot teams:
// any free name. The name is drawn at random; neural bots only at 6 players (at 8 the net steps aside).
function botName(room, seat) {
  const used = new Set(room.seats.filter((s, i) => i !== seat).map((s) => s.name));
  const free = [...BOT_NAMES, ...(room.players === 6 ? PICK_ONLY : [])].filter((n) => !used.has(n));
  const mates = room.seats.filter((s, i) => i !== seat && i % 2 === seat % 2);
  let pool = free;
  if (mates.some((s) => s.kind === 'human')) {
    const wantTuned = !mates.some((s) => s.kind === 'bot' && Bot.HUMAN_TUNED_BOTS.has(s.name));
    const fit = free.filter((n) => Bot.HUMAN_TUNED_BOTS.has(n) === wantTuned);
    if (fit.length) pool = fit;
  }
  return pool.length ? pickRandom(pool) : `Bot ${seat + 1}`;
}

function startMatch(room) {
  // A bot the host picked by name keeps it (the one-human-tuned-bot rule does not apply to picked bots).
  // Every other bot (added without a name, or filling an empty seat) is named afresh at random, now that the teams are known.
  room.seats.forEach((s, i) => {
    if (s.kind !== 'human' && !s.picked) room.seats[i] = { ...emptySeat(), kind: 'bot' };
  });
  const open = room.seats.map((s, i) => i).filter((i) => room.seats[i].kind === 'bot' && !room.seats[i].picked);
  for (let i = open.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [open[i], open[j]] = [open[j], open[i]]; }
  // 6 players: at least one neural bot unless the host picked every bot. It goes on a random open seat, preferring
  // one that leaves its team room for the human-tuned bot a team with a human gets.
  const names = new Set(room.seats.map((s) => s.name));
  const freeNet = PICK_ONLY.filter((n) => !names.has(n));
  if (room.players === 6 && open.length && !room.seats.some((s) => s.kind === 'bot' && PICK_ONLY.includes(s.name)) && freeNet.length) {
    const mates = (i) => room.seats.filter((s, k) => k !== i && k % 2 === i % 2);
    const roomy = open.filter((i) => !mates(i).some((s) => s.kind === 'human')
      || open.some((k) => k !== i && k % 2 === i % 2)
      || mates(i).some((s) => s.picked && Bot.HUMAN_TUNED_BOTS.has(s.name)));
    room.seats[pickRandom(roomy.length ? roomy : open)].name = pickRandom(freeNet);
  }
  // teams with a human are named first, so the all-bot team cannot use up the self-play names they need
  const withHuman = (i) => room.seats.some((s, k) => k % 2 === i % 2 && s.kind === 'human');
  open.sort((a, b) => withHuman(b) - withHuman(a));
  open.forEach((i) => { if (!room.seats[i].name) room.seats[i].name = botName(room, i); });
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
  // The name this socket sits under: a registered player always uses the account's name; a guest may not take one.
  const nameFor = (name) => {
    if (socket.data.pid) return { name: socket.data.name };
    const n = clean(name);
    return n && accounts.isHeld(n) ? { err: 'That name belongs to a registered player. Sign in, or pick another name.' } : { name: n };
  };
  // Signed in: the seat, host role and reconnects follow the account ('p:<id>') on any device.
  const signIn = (id) => { socket.data.pid = id; socket.data.token = 'p:' + id; socket.data.name = accounts.get(id).name; };

  socket.on('hello', ({ token, login } = {}) => {
    socket.data.guest = typeof token === 'string' && token.length >= 16 && !token.startsWith('p:') ? token.slice(0, 64) : crypto.randomUUID();
    socket.data.token = socket.data.guest;
    const pid = accounts.resume(login);
    if (pid) signIn(pid);
    socket.emit('token', socket.data.guest);
    socket.emit('account', pid ? accounts.get(pid) : null, accounts.ready());   // ready: a null means the session is gone
    socket.emit('lobby', lobbyInfo());
    // the record may have grown on the other server (Render / play56.in) since this one read it
    if (pid) accounts.refresh(pid).then((a) => { if (a && socket.connected && socket.data.pid === pid) socket.emit('account', a, true); });
  });

  // Register (new name) or sign in (existing name) with a PIN; lobby only.
  const account = (fn) => async ({ name, pin } = {}) => {
    if (!socket.data.guest) return fail('Not ready');
    if (socket.data.room) return fail('Leave the table first.');
    const r = await fn(name, pin).catch((err) => { console.error('account error', err.message); return { err: 'Sign-in is not available right now.' }; });
    if (r.err) return fail(r.err);
    signIn(r.id);
    socket.emit('login', { session: r.session, account: r.account });
  };
  socket.on('register', account(accounts.register));
  socket.on('login', account(accounts.login));
  // The signed-in player's last 5 hands, for the replay on the record card. Player ids stay on the server.
  socket.on('myHands', async () => {
    const pid = socket.data.pid;
    if (!pid) return fail('Sign in first.');
    const rows = await recentHands(pid).catch((err) => { console.error('replay error', err.message); return null; });
    if (!rows) return fail('Replays are not available right now.');
    socket.emit('myHands', rows.map((h) => ({
      id: h.id, at: h.created_at, players: h.players, handNo: h.hand_no, dealer: h.dealer,
      me: h.seats.findIndex((x) => x.pid === pid), seats: h.seats.map((x) => ({ kind: x.kind, name: x.name })),
      dealt: h.dealt, auction: h.auction, contract: h.contract, played: h.played, result: h.result,
      review: personal(h.review, h.seats.findIndex((x) => x.pid === pid))
    })));
  });
  // The signed-in player's coach note (written on the owner's laptop, test/coach_facts.js + coach_upload.js): one
  // row read from Supabase on request, nothing worked out here.
  socket.on('coachNote', async () => {
    const pid = socket.data.pid;
    if (!pid) return fail('Sign in first.');
    if (!SUPABASE_URL || !SUPABASE_KEY) return socket.emit('coachNote', null);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/coach_notes?player_id=eq.${Number(pid)}&select=updated_at,hand_ids,note_en,note_ml`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, signal: ctrl.signal });
      if (!r.ok) throw new Error(`coach_notes ${r.status}`);
      socket.emit('coachNote', (await r.json())[0] || null);
    } catch (err) {
      console.error('coach note error', err.message);
      fail('Notes are not available right now.');
    } finally { clearTimeout(t); }
  });
  socket.on('logout', () => {
    if (socket.data.room) return fail('Leave the table first.');
    socket.data.pid = null;
    socket.data.token = socket.data.guest;
    socket.emit('account', null, true);
  });

  socket.on('createRoom', ({ name, players, team } = {}) => {
    if (!socket.data.token) return fail('Not ready');
    const nm = nameFor(name);
    if (nm.err) return fail(nm.err);
    if (!nm.name) return fail('Please type your name first.');
    const room = createRoom(socket.data.token, Number(players) === 8 ? 8 : 6);
    socket.data.name = nm.name;
    const hostSeat = Number(team) === 1 ? 1 : 0;       // seat parity is the team (even = A, odd = B)
    room.seats[hostSeat] = { kind: 'human', name: nm.name, pid: socket.data.pid || null, token: socket.data.token, socketId: socket.id, connected: true };
    socket.join(room.code);
    socket.data.room = room.code;
    sysChat(room, `${room.seats[hostSeat].name} created the table.`);
    broadcast(room);
  });

  socket.on('joinRoom', ({ code, name, team } = {}) => {
    if (!socket.data.token) return fail('Not ready');
    const room = rooms.get(String(code || '').toUpperCase().trim());
    if (!room) return fail('Room not found. Check the code.');
    const nm = nameFor(name);
    if (nm.err) return fail(nm.err);
    if (!nm.name && seatOfToken(room, socket.data.token) < 0) return fail('Please type your name first.');
    socket.join(room.code);
    socket.data.room = room.code;
    if (nm.name) socket.data.name = nm.name;

    let seat = seatOfToken(room, socket.data.token);
    if (seat >= 0) {                                   // reconnect
      if (!room.seats[seat].connected) glog(room, `${room.seats[seat].name} seat ${seat} reconnected after ${Math.round((Date.now() - (room.awaySince[seat] || Date.now())) / 1000)}s`);
      Object.assign(room.seats[seat], { socketId: socket.id, connected: true });
      delete room.awaySince[seat];
      if (nm.name) room.seats[seat].name = nm.name;
    } else if (!room.game) {                           // auto-sit: first empty seat on the chosen team, else any
      const want = team === 0 || team === 1 ? team : null;
      if (want !== null) seat = room.seats.findIndex((s, i) => s.kind === 'empty' && E.team(i) === want);
      if (seat < 0) seat = room.seats.findIndex((s) => s.kind === 'empty');
      if (want !== null && seat >= 0 && E.team(seat) !== want) fail(`${room.teamNames[want]} is full, so you are on ${room.teamNames[1 - want]}.`);
      if (seat >= 0) {
        room.seats[seat] = { kind: 'human', name: nm.name || `Player ${seat + 1}`, pid: socket.data.pid || null, token: socket.data.token, socketId: socket.id, connected: true };
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
    const nm = nameFor(name);
    if (nm.err) return fail(nm.err);
    let myName = nm.name;
    if (myName) socket.data.name = myName;
    if (cur >= 0) {
      myName = myName || room.seats[cur].name;
      room.seats[cur] = emptySeat();
    }
    room.seats[seat] = { kind: 'human', name: myName || `Player ${seat + 1}`, pid: socket.data.pid || null, token: socket.data.token, socketId: socket.id, connected: true };
    if (cur >= 0 && room.game) {
      room.seats[cur] = { ...emptySeat(), kind: 'bot', name: botName(room, cur) };
      sysChat(room, `${room.seats[cur].name} took over ${myName}'s old seat.`);
    }
    if (target.kind === 'bot') sysChat(room, `${room.seats[seat].name} took over from ${target.name}.`);
    broadcast(room);
  });

  socket.on('setBot', ({ seat, on, name } = {}) => {
    const room = getRoom();
    if (!room || socket.data.token !== room.hostToken || room.game) return;
    seat = Number(seat);
    const s = room.seats[seat];
    if (!s) return;
    // with a name: that bot sits here and stays (picked); without: any bot, named when the match starts
    if (on && s.kind !== 'human' && (BOT_NAMES.includes(name) || PICK_ONLY.includes(name)) && !room.seats.some((x, i) => i !== seat && x.picked && x.name === name))
      room.seats[seat] = { ...emptySeat(), kind: 'bot', name, picked: true };
    else if (on && !name && s.kind !== 'human') room.seats[seat] = { ...emptySeat(), kind: 'bot', name: BOT_NAMES[seat] };
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
    sysChat(room, `Chips reset to ${room.game.settings.startingTables} each.`);
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

  socket.on('disconnect', (reason) => {
    const room = getRoom();
    if (!room) return;
    const seat = seatOfToken(room, socket.data.token);
    if (seat >= 0 && room.seats[seat].socketId === socket.id) {
      room.seats[seat].connected = false;
      room.awaySince[seat] = Date.now();
      const g = room.game;
      glog(room, `${room.seats[seat].name} seat ${seat} disconnected (${reason})${g ? ` phase=${g.phase} turn=${g.turn}` : ''}`);
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

module.exports = { server, io, rooms, updateKunukku, accounts };
