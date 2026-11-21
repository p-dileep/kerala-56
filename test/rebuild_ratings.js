'use strict';
// Rebuild every registered player's rating under the current rule (src/accounts.js handDelta) from the hand log.
//   node test/fetch_hands.js > data/hands.jsonl      (fresh pull first)
//   node test/rebuild_ratings.js                     dry run: prints old and new ratings
//   node test/rebuild_ratings.js --write             writes `rating` only to the Supabase `players` table
// Reads SUPABASE_URL + SUPABASE_SERVICE_KEY from the environment or .env, like test/fetch_hands.js.
const fs = require('fs');
const path = require('path');
const { handDelta, BASE } = require('../src/accounts');

for (const line of (fs.existsSync(path.join(__dirname, '..', '.env')) ? fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8') : '').split(/\r?\n/)) {
  const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) { console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required'); process.exit(1); }
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

async function main() {
  const players = await (await fetch(`${url}/rest/v1/players?select=id,name,rating,hands`, { headers })).json();
  const hands = fs.readFileSync(path.join(__dirname, '..', 'data', 'hands.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean)
    .map((l) => JSON.parse(l)).sort((a, b) => a.id - b.id);
  const rec = new Map(players.map((p) => [p.id, { rating: BASE, n: 0 }]));
  for (const h of hands) {
    const r = h.result;
    if (!r || r.void || r.receiver == null || !h.seats.some((s) => rec.has(s.pid))) continue;
    const rating = (s) => (rec.has(s.pid) ? rec.get(s.pid).rating : BASE);
    const avg = [0, 1].map((t) => { const xs = h.seats.filter((s, i) => i % 2 === t).map(rating); return xs.reduce((a, b) => a + b, 0) / xs.length; });
    const value = r.contract && r.contract.value;
    h.seats.forEach((s, i) => {
      const p = rec.get(s.pid);
      if (!p) return;
      p.rating += handDelta(p.n, avg[i % 2], avg[1 - (i % 2)], r.receiver === i % 2, value);
      p.n++;
    });
  }
  for (const p of players) {
    const n = rec.get(p.id);
    console.log(`${p.id}\t${p.name}\told ${Math.round(p.rating)}\tnew ${Math.round(n.rating)}\tlogged hands ${n.n}\trecord hands ${p.hands}`);
  }
  if (!process.argv.includes('--write')) return console.log('dry run: nothing written (add --write)');
  for (const p of players) {
    const r = await fetch(`${url}/rest/v1/players?id=eq.${p.id}`, { method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify({ rating: rec.get(p.id).rating }) });
    if (!r.ok) throw new Error(`players ${p.id}: ${r.status}`);
  }
  console.log(`written: ${players.length} players`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
