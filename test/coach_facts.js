'use strict';
// Daily coach facts (docs/claude-plans/2026-11-22_daily-coach-notes.md). Runs on the laptop, never on the VM.
//   node test/fetch_hands.js > data/hands.jsonl     (fresh pull first)
//   node test/coach_facts.js [--all] [--player <id>]
// For every registered player (test seats skipped) whose newest hand is newer than their stored note (or --all):
// their last 20 hands -> data/coach/<player id>.json, and the ids that need a note -> data/coach/todo.json.
// Each hand is solved once (data/coach/cache/<hand id>.json), up to 8 hands at a time in worker threads.
// Reads SUPABASE_URL + SUPABASE_SERVICE_KEY from the environment or .env, like test/fetch_hands.js.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'coach'), CACHE = path.join(OUT, 'cache');
const LAST = 20, TEST_NAMES = /^tester ?2?$/i;
const { CACHE_V } = require('./coach_lib');

// ---------------------------------------------------------------- worker: one hand
if (!isMainThread) {
  const { solveHand } = require('./coach_lib');
  parentPort.on('message', (job) => parentPort.postMessage(solveHand(job)));
  return;
}

// ---------------------------------------------------------------- main
for (const line of (fs.existsSync(path.join(ROOT, '.env')) ? fs.readFileSync(path.join(ROOT, '.env'), 'utf8') : '').split(/\r?\n/)) {
  const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
const headers = { apikey: key, Authorization: `Bearer ${key}` };
const arg = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; };

async function get(table, q) {
  const r = await fetch(`${url}/rest/v1/${table}?${q}`, { headers });
  if (!r.ok) throw new Error(`${table} ${r.status}`);
  return r.json();
}

const myChips = (r, team) => (!r || r.void || r.receiver == null ? 0 : (r.receiver === team ? 1 : -1) * (r.paid ?? r.amount ?? 0));

function solveAll(jobs) {
  const n = Math.min(8, Math.max(1, os.cpus().length - 2), jobs.length);
  if (!n) return Promise.resolve();
  let next = 0, done = 0;
  return new Promise((ok, bad) => {
    for (let w = 0; w < n; w++) {
      const worker = new Worker(__filename);
      const feed = () => {
        if (next >= jobs.length) { worker.terminate(); return; }
        const job = jobs[next++];
        worker.once('message', (c) => {
          if (c.error) console.error(`hand ${c.id} FAILED: ${c.error} (${++done}/${jobs.length}); left out of the notes`);
          else { fs.writeFileSync(path.join(CACHE, `${c.id}.json`), JSON.stringify(c)); console.error(`hand ${c.id} solved (${++done}/${jobs.length})`); }
          feed();
        });
        worker.postMessage(job);
      };
      worker.on('error', bad);
      worker.on('exit', () => { if (done === jobs.length) ok(); });
      feed();
    }
  });
}

async function main() {
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required');
  fs.mkdirSync(CACHE, { recursive: true });
  const hands = fs.readFileSync(path.join(ROOT, 'data', 'hands.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  const players = (await get('players', 'select=id,name')).filter((p) => !TEST_NAMES.test(p.name));
  let notes = [];
  try { notes = await get('coach_notes', 'select=player_id,hand_ids'); } catch (e) { console.error(`coach_notes not readable (${e.message}): every player counts as new`); }
  const lastNoted = new Map(notes.map((n) => [n.player_id, Math.max(0, ...(n.hand_ids || []))]));
  const only = arg('--player') ? Number(arg('--player')) : null;

  const todo = [], picked = new Map();   // player id -> last hands
  for (const p of players) {
    if (only !== null && p.id !== only) continue;
    const mine = hands.filter((h) => h.seats.some((s) => s.pid === p.id)).sort((a, b) => b.id - a.id).slice(0, LAST).reverse();
    if (!mine.length) continue;
    const newest = mine[mine.length - 1].id;
    if (!process.argv.includes('--all') && newest <= (lastNoted.get(p.id) || 0)) continue;
    picked.set(p.id, mine); todo.push(p.id);
  }

  // what each needed hand still lacks
  const need = new Map();   // hand id -> { hand, seats:Set }
  for (const [pid, mine] of picked) for (const h of mine) {
    const seat = h.seats.findIndex((s) => s.pid === pid);
    if (!need.has(h.id)) need.set(h.id, { hand: h, seats: new Set() });
    need.get(h.id).seats.add(seat);
  }
  // v1 files: card facts and all-cards values still hold; only the calls are judged again (v2 skips takeover-bot calls)
  const readCache = (id) => {
    const f = path.join(CACHE, `${id}.json`), c = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
    if (!c) return null;
    if (c.v === CACHE_V) return c;
    return c.v === 1 && CACHE_V === 2 ? { ...c, v: CACHE_V, calls: {} } : null;
  };
  const jobs = [];
  for (const { hand, seats } of need.values()) {
    const c = readCache(hand.id), s = [...seats];
    if (c && c.cards && s.every((x) => x in c.calls && (x % 2) in c.allCards)) continue;
    jobs.push({ hand, seats: s, cached: c });
  }
  console.error(`${todo.length} player(s) need a note; ${jobs.length} hand(s) to solve`);
  await solveAll(jobs);

  const players_ = new Map(players.map((p) => [p.id, p]));
  for (const [pid, mine] of picked) {
    const rows = mine.filter((h) => readCache(h.id)).map((h) => {
      const seat = h.seats.findIndex((s) => s.pid === pid), team = seat % 2, c = readCache(h.id);
      const cards = Array.isArray(c.cards) ? c.cards[seat] : c.cards;
      const r = h.result || {};
      return {
        id: h.id, date: h.created_at, players: h.players, seat, team, contract: h.contract,
        result: { made: r.made, void: !!r.void, conceded: r.conceded ?? null, points: r.points, amount: r.amount, receiver: r.receiver ?? null },
        myChips: myChips(r, team), cards, calls: c.calls[seat], allCards: c.allCards[team]
      };
    });
    const withCards = rows.filter((x) => typeof x.cards.given === 'number');
    const calls = rows.flatMap((x) => x.calls), judged = calls.filter((x) => x.judged), mistakes = judged.filter((x) => x.loss >= 0.5);
    const avg = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length * 10) / 10 : null);
    const facts = {
      v: 1, player: { id: pid, name: players_.get(pid).name }, generated: new Date().toISOString(), hands: rows,
      totals: {
        hands: rows.length, chips: rows.reduce((a, x) => a + x.myChips, 0),
        given: withCards.reduce((a, x) => a + x.cards.given, 0), avgGiven: avg(withCards.map((x) => x.cards.given)),
        tableAvgGiven: avg(withCards.map((x) => x.cards.tableAvg)),
        calls: calls.length, callsJudged: judged.length, callMistakes: mistakes.length,
        chipsLostInCalls: Math.round(mistakes.reduce((a, x) => a + x.loss, 0) * 100) / 100
      }
    };
    fs.writeFileSync(path.join(OUT, `${pid}.json`), JSON.stringify(facts, null, 1));
  }
  fs.writeFileSync(path.join(OUT, 'todo.json'), JSON.stringify(todo));
  console.error(`wrote ${picked.size} facts file(s); todo ${JSON.stringify(todo)}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
