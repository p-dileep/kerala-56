'use strict';
// Player accounts: a name + PIN, kept so a player's record (rating, hands, matches) follows them across devices.
// Not a strict login: no email, no recovery (the owner resets a forgotten PIN in the table editor).
// Store: Supabase table `players` (see docs/claude-plans/2026-11-20_site-logins.md) when SUPABASE_URL is set,
// else a JSON file (local server), else memory only (file '' = the socket test).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STATS = ['rating', 'hands', 'hands_won', 'bids', 'bids_made', 'matches', 'matches_won'];
const ELO_K = 16, BASE = 1500;
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

function makeAccounts({ url = '', key = '', file = '', secret = '', reserved = [] } = {}) {
  const byId = new Map(), byKey = new Map();
  const fails = new Map();      // name_key -> { n, until }
  const reservedKeys = new Set(reserved.map(nameKey));
  const hmacKey = secret || (key ? crypto.createHash('sha256').update('play56-login:' + key).digest() : crypto.randomBytes(32));
  let ready = false;

  const rest = (q, opts = {}) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    return fetch(`${url}/rest/v1/players${q}`, {
      ...opts, signal: ctrl.signal,
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(opts.headers || {}) }
    }).finally(() => clearTimeout(t));
  };
  const keep = (rec) => { byId.set(rec.id, rec); byKey.set(rec.name_key, rec); return rec; };
  const saveFile = () => {
    if (!file) return;
    fs.mkdir(path.dirname(file), { recursive: true }, () =>
      fs.writeFile(file, JSON.stringify([...byId.values()], null, 1), () => {}));
  };

  async function load() {
    try {
      if (url) {
        const r = await rest('?select=*');
        if (!r.ok) throw new Error(`players load ${r.status}`);
        (await r.json()).forEach(keep);
      } else if (file && fs.existsSync(file)) JSON.parse(fs.readFileSync(file, 'utf8')).forEach(keep);
      ready = true;
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
    if (byKey.has(k)) return { err: 'That name is already registered. Sign in instead.' };
    const rec = { name: c.name, name_key: k, pin_hash: await scryptHash(pin), rating: BASE, hands: 0, hands_won: 0, bids: 0, bids_made: 0, matches: 0, matches_won: 0 };
    if (url) {
      const r = await rest('', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(rec) }).catch(() => null);
      if (!r || !r.ok) return { err: r && r.status === 409 ? 'That name is already registered. Sign in instead.' : 'Sign-in is not available right now.' };
      keep((await r.json())[0]);
    } else {
      rec.id = byId.size ? Math.max(...byId.keys()) + 1 : 1;
      rec.created_at = new Date().toISOString();
      keep(rec);
      saveFile();
    }
    const out = byKey.get(k);
    return { account: publicView(out), session: sign(out), id: out.id };
  }

  async function login(name, pin) {
    if (!ready) return { err: 'Sign-in is not available right now.' };
    const k = nameKey(name);
    const f = fails.get(k);
    if (f && f.until > Date.now()) return { err: 'Too many wrong PINs. Try again in 15 minutes.' };
    let rec = byKey.get(k);
    if (rec && url) {          // fresh copy: another server (or the table editor) may have changed it
      const r = await rest(`?id=eq.${rec.id}&select=*`).catch(() => null);
      if (r && r.ok) { const rows = await r.json(); if (rows[0]) rec = keep(rows[0]); }
    }
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

  function save(rec) {
    rec.last_seen = new Date().toISOString();
    if (url) {
      const body = Object.fromEntries([...STATS, 'last_seen'].map((s) => [s, rec[s]]));
      rest(`?id=eq.${rec.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) })
        .then((r) => { if (!r.ok) console.error('player save failed', r.status); })
        .catch((err) => console.error('player save error', err.message));
    } else saveFile();
  }

  // One finished hand. seats: [{ pid|null }] by seat index, team = seat % 2; result as in engine.settle.
  // Returns the ids whose records changed.
  function recordHand(seats, result, matchWinner = null) {
    if (!result || result.void || result.receiver == null) return [];
    const rating = (s) => (s.pid && byId.has(s.pid) ? byId.get(s.pid).rating : BASE);
    const teamAvg = (t) => { const xs = seats.filter((s, i) => i % 2 === t).map(rating); return xs.reduce((a, b) => a + b, 0) / xs.length; };
    const avg = [teamAvg(0), teamAvg(1)];
    const changed = [];
    seats.forEach((s, i) => {
      const rec = s.pid && byId.get(s.pid);
      if (!rec) return;
      const t = i % 2, won = result.receiver === t;
      const expect = 1 / (1 + 10 ** ((avg[1 - t] - avg[t]) / 400));
      rec.rating += ELO_K * ((won ? 1 : 0) - expect);
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
    loaded, register, login, resume, recordHand, checkName,
    ready: () => ready,
    isHeld: (name) => byKey.has(nameKey(name)),
    get: (id) => (byId.has(id) ? publicView(byId.get(id)) : null)
  };
}

module.exports = { makeAccounts, nameKey };
