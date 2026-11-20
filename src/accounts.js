'use strict';
// Player accounts: a name + PIN, kept so a player's record (rating, hands, matches) follows them across devices.
// Not a strict login: no email, no recovery (the owner resets a forgotten PIN in the table editor).
// Store: Supabase table `players` (see docs/claude-plans/2026-11-20_site-logins.md) when SUPABASE_URL is set,
// else a JSON file (local server), else memory only (file '' = the socket test).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STATS = ['rating', 'hands', 'hands_won', 'bids', 'bids_made', 'matches', 'matches_won'];
// Elo per hand, weighted by the stake: K points per chip the hand was played for (a 28 made = 1 chip,
// a 56 down = 5, doubles included), capped at ELO_MAX_CHIPS so a redoubled 56 cannot swing a rating by hundreds.
const ELO_K = 16, ELO_MAX_CHIPS = 5, BASE = 1500;
const LOCK_FAILS = 5, LOCK_MS = 15 * 60 * 1000;

const nameKey = (n) => String(n || '').trim().replace(/\s+/g, ' ').toLowerCase();

function scryptHash(pin, salt = crypto.randomBytes(16)) {
  return new Promise((ok, bad) => crypto.scrypt(String(pin), salt, 32, (err, key) =>
    (err ? bad(err) : ok(`s1$${salt.toString('base64')}$${key.toString('base64')}`))));
}
async function pinMatches(pin, stored) {
  const [, salt, hash] = String(stored || '').split('$');
  if (!salt || !hash) return false;
  const again = (await scryptHash(pin, Buffer.from(salt, 'base64'))).split('$')[2];
  return crypto.timingSafeEqual(Buffer.from(again), Buffer.from(hash));
}

// The shared store when more than one server keeps accounts (play56.in and the Render copy): Supabase table `players`.
function supabaseRemote(url, key) {
  const rest = async (q, opts = {}) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    try {
      return await fetch(`${url}/rest/v1/players${q}`, {
        ...opts, signal: ctrl.signal,
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(opts.headers || {}) }
      });
    } finally { clearTimeout(t); }
  };
  const rows = async (q) => { const r = await rest(q); if (!r.ok) throw new Error(`players ${r.status}`); return r.json(); };
  return {
    all: () => rows('?select=*'),
    keys: () => rows('?select=id,name_key'),
    one: async (col, val) => (await rows(`?${col}=eq.${encodeURIComponent(val)}&select=*`))[0] || null,
    async insert(rec) {
      const r = await rest('', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(rec) });
      if (r.status === 409) return { conflict: true };
      if (!r.ok) throw new Error(`players insert ${r.status}`);
      return { row: (await r.json())[0] };
    },
    async patch(id, body) {
      const r = await rest(`?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(`players save ${r.status}`);
    }
  };
}

// remote: the shared store (Supabase, or a fake in the tests); without one, `file` (local server) or memory.
// With a remote this server's copy is only a cache: unknown names are looked up, a player's record is
// re-read when they sign in or reconnect, and the list of registered names is re-read every few minutes.
function makeAccounts({ url = '', key = '', file = '', secret = '', reserved = [], remote = null, namesEveryMs = 5 * 60 * 1000 } = {}) {
  remote = remote || (url ? supabaseRemote(url, key) : null);
  const byId = new Map(), byKey = new Map();
  const heldKeys = new Set();   // names registered elsewhere that this server has not loaded yet
  const fails = new Map();      // name_key -> { n, until }
  const reservedKeys = new Set(reserved.map(nameKey));
  const hmacKey = secret || (key ? crypto.createHash('sha256').update('play56-login:' + key).digest() : crypto.randomBytes(32));
  let ready = false;

  // a row from the store: update the cached record in place (callers may hold it), or add it
  const keep = (row) => {
    const rec = byId.has(row.id) ? Object.assign(byId.get(row.id), row) : row;
    byId.set(rec.id, rec); byKey.set(rec.name_key, rec); heldKeys.delete(rec.name_key);
    return rec;
  };
  const saveFile = () => {
    if (!file) return;
    fs.mkdir(path.dirname(file), { recursive: true }, () =>
      fs.writeFile(file, JSON.stringify([...byId.values()], null, 1), () => {}));
  };
  const fetchOne = (col, val) => (remote ? remote.one(col, val).then((row) => (row ? keep(row) : null)).catch(() => null) : Promise.resolve(null));
  const loadNames = () => remote.keys().then((ks) => ks.forEach((x) => { if (!byKey.has(x.name_key)) heldKeys.add(x.name_key); })).catch(() => {});

  async function load() {
    try {
      if (remote) (await remote.all()).forEach(keep);
      else if (file && fs.existsSync(file)) JSON.parse(fs.readFileSync(file, 'utf8')).forEach(keep);
      ready = true;
      if (remote) setInterval(loadNames, namesEveryMs).unref();
    } catch (err) {
      console.error('accounts unavailable:', err.message);
      setTimeout(load, 60 * 1000).unref();
    }
  }
  const loaded = load();

  const sign = (rec) => `${rec.id}.${crypto.createHmac('sha256', hmacKey).update(`${rec.id}.${rec.pin_hash}`).digest('base64url').slice(0, 32)}`;
  const publicView = (rec) => ({ id: rec.id, name: rec.name, ...Object.fromEntries(STATS.map((s) => [s, s === 'rating' ? Math.round(rec[s]) : rec[s]])) });

  function checkName(name) {
    const n = String(name || '').replace(/[<>]/g, '').trim().replace(/\s+/g, ' ');
    if (n.length < 2 || n.length > 18) return { err: 'A player name needs 2 to 18 letters.' };
    if (reservedKeys.has(nameKey(n)) || /^(guest|player \d+|seat \d+|bot( \d+)?|any bot)$/i.test(n)) return { err: 'That name cannot be registered.' };
    return { name: n };
  }

  // name + PIN -> account (new or existing). Returns { account, session } or { err }.
  async function register(name, pin) {
    if (!ready) return { err: 'Sign-in is not available right now.' };
    const c = checkName(name);
    if (c.err) return c;
    if (!/^\d{4,8}$/.test(String(pin || ''))) return { err: 'The PIN must be 4 to 8 digits.' };
    const k = nameKey(c.name);
    const taken = { err: 'That name is already registered. Sign in instead.' };
    if (byKey.has(k)) return taken;
    const rec = { name: c.name, name_key: k, pin_hash: await scryptHash(pin), rating: BASE, hands: 0, hands_won: 0, bids: 0, bids_made: 0, matches: 0, matches_won: 0 };
    let out;
    if (remote) {
      const r = await remote.insert(rec).catch(() => null);
      if (!r) return { err: 'Sign-in is not available right now.' };
      if (r.conflict) { await fetchOne('name_key', k); return taken; }   // registered on the other server
      out = keep(r.row);
    } else {
      rec.id = byId.size ? Math.max(...byId.keys()) + 1 : 1;
      rec.created_at = new Date().toISOString();
      out = keep(rec);
      saveFile();
    }
    return { account: publicView(out), session: sign(out), id: out.id };
  }

  async function login(name, pin) {
    if (!ready) return { err: 'Sign-in is not available right now.' };
    const k = nameKey(name);
    const f = fails.get(k);
    if (f && f.until > Date.now()) return { err: 'Too many wrong PINs. Try again in 15 minutes.' };
    // a fresh copy from the store: the other server (or the table editor) may have changed it, or created it
    let rec = byKey.get(k);
    if (remote) rec = (await fetchOne(rec ? 'id' : 'name_key', rec ? rec.id : k)) || rec;
    if (!rec || !(await pinMatches(pin, rec.pin_hash))) {
      const n = (f && !(f.until && f.until <= Date.now()) ? f.n : 0) + 1;   // a lock that ran out starts a new count
      fails.set(k, { n, until: n >= LOCK_FAILS ? Date.now() + LOCK_MS : 0 });
      return { err: rec ? 'Wrong PIN.' : 'No player with that name. Register it first.' };
    }
    fails.delete(k);
    return { account: publicView(rec), session: sign(rec), id: rec.id };
  }

  // signed session token -> account id, or null
  function resume(session) {
    const id = Number(String(session || '').split('.')[0]);
    const rec = byId.get(id);
    if (!rec) return null;
    const a = Buffer.from(sign(rec)), b = Buffer.from(String(session));
    return a.length === b.length && crypto.timingSafeEqual(a, b) ? rec.id : null;
  }

  // Re-read one player's record from the store (on a reconnect: they may have played on the other server since).
  // Resolves to the public view, or null when there is no store or nothing could be read.
  const refresh = (id) => fetchOne('id', id).then((rec) => (rec ? publicView(rec) : null));

  function save(rec) {
    rec.last_seen = new Date().toISOString();
    if (remote) remote.patch(rec.id, Object.fromEntries([...STATS, 'last_seen'].map((s) => [s, rec[s]]))).catch((err) => console.error(err.message));
    else saveFile();
  }

  // One finished hand. seats: [{ pid|null }] by seat index, team = seat % 2; result as in engine.settle.
  // Returns the ids whose records changed.
  function recordHand(seats, result, matchWinner = null) {
    if (!result || result.void || result.receiver == null) return [];
    const rating = (s) => (s.pid && byId.has(s.pid) ? byId.get(s.pid).rating : BASE);
    const teamAvg = (t) => { const xs = seats.filter((s, i) => i % 2 === t).map(rating); return xs.reduce((a, b) => a + b, 0) / xs.length; };
    const avg = [teamAvg(0), teamAvg(1)];
    const weight = Math.min(Math.max(result.amount || 1, 1), ELO_MAX_CHIPS);   // chips at stake (conceded: the normal stake)
    const changed = [];
    seats.forEach((s, i) => {
      const rec = s.pid && byId.get(s.pid);
      if (!rec) return;
      const t = i % 2, won = result.receiver === t;
      const expect = 1 / (1 + 10 ** ((avg[1 - t] - avg[t]) / 400));
      rec.rating += ELO_K * weight * ((won ? 1 : 0) - expect);
      rec.hands++;
      if (won) rec.hands_won++;
      if (result.contract && result.contract.seat === i) { rec.bids++; if (result.made) rec.bids_made++; }
      if (matchWinner !== null) { rec.matches++; if (matchWinner === t) rec.matches_won++; }
      save(rec);
      changed.push(rec.id);
    });
    return changed;
  }

  return {
    loaded, register, login, resume, refresh, recordHand, checkName,
    ready: () => ready,
    isHeld: (name) => byKey.has(nameKey(name)) || heldKeys.has(nameKey(name)),
    get: (id) => (byId.has(id) ? publicView(byId.get(id)) : null)
  };
}

module.exports = { makeAccounts, nameKey };
