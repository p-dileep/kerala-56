'use strict';
// node test/fetch_hands.js > data/hands.jsonl
// Reads SUPABASE_URL + SUPABASE_SERVICE_KEY from the environment, or from a .env file in the project root.
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const p = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv();
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) { console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required'); process.exit(1); }

async function main() {
  let from = 0; const page = 1000;
  for (;;) {
    const r = await fetch(`${url}/rest/v1/hands?select=*&order=id.asc`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + page - 1}` }
    });
    if (!r.ok) { console.error('fetch failed', r.status, await r.text()); process.exit(1); }
    const rows = await r.json();
    for (const row of rows) process.stdout.write(JSON.stringify(row) + '\n');
    if (rows.length < page) break;
    from += page;
  }
}
main();
