'use strict';
// Upload the coach notes written today (data/coach/<player id>.note.json) into the Supabase table `coach_notes`.
//   node test/coach_upload.js
// Reads SUPABASE_URL + SUPABASE_SERVICE_KEY from the environment or .env. Exits non-zero if any note fails.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..'), DIR = path.join(ROOT, 'data', 'coach');
for (const line of (fs.existsSync(path.join(ROOT, '.env')) ? fs.readFileSync(path.join(ROOT, '.env'), 'utf8') : '').split(/\r?\n/)) {
  const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;

// A note file -> the row to store, or an error message.
function noteRow(pid, note) {
  if (!note || typeof note.note_en !== 'string' || !note.note_en.trim()) return 'note_en missing';
  if (typeof note.note_ml !== 'string' || !note.note_ml.trim()) return 'note_ml missing';
  if (!Array.isArray(note.hand_ids) || !note.hand_ids.length || !note.hand_ids.every(Number.isInteger)) return 'hand_ids missing';
  return { player_id: pid, updated_at: new Date().toISOString(), hand_ids: note.hand_ids, note_en: note.note_en, note_ml: note.note_ml, facts_version: 1 };
}

async function main() {
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required');
  const today = new Date().toDateString();
  const files = fs.readdirSync(DIR).filter((f) => /^\d+\.note\.json$/.test(f) && fs.statSync(path.join(DIR, f)).mtime.toDateString() === today);
  let failed = 0;
  for (const f of files) {
    const pid = Number(f.split('.')[0]);
    let row;
    try { row = noteRow(pid, JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'))); } catch (e) { row = 'not JSON'; }
    if (typeof row === 'string') { console.log(`player ${pid}: skipped (${row})`); failed++; continue; }
    const r = await fetch(`${url}/rest/v1/coach_notes`, {
      method: 'POST', body: JSON.stringify(row),
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }
    });
    if (r.ok) console.log(`player ${pid}: uploaded (${row.hand_ids.length} hands)`);
    else { console.log(`player ${pid}: failed ${r.status} ${await r.text()}`); failed++; }
  }
  if (!files.length) console.log('no notes written today');
  if (failed) process.exit(1);
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { noteRow };
