/* 56 — browser client. All rules are enforced on the server; this only renders and sends intents. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const SYM = { S: '♠', H: '♥', D: '♦', C: '♣', NT: 'NT' };
  // Text: T('English', args...) gives the player's language (lang.js); English is the source everywhere.
  const T = window.T, Lang = window.Lang;
  const named = (o) => new Proxy(o, { get: (t, k) => T(t[k]) });   // a table of words, read in the player's language
  // each bot's temperament and which ones bid with the human-tuned numbers (keep in step with BOT_PERSONALITY and HUMAN_TUNED_BOTS in src/bot.js)
  const BOT_CHAR = { Kuttan: 'aggressive', Ammini: 'defensive', Pappan: 'medium', Chinnu: 'aggressive', Unni: 'medium', Kunjamma: 'defensive', Appu: 'aggressive', Sarojini: 'medium', Mathai: 'defensive', Leela: 'medium', Jalaja: 'medium', Ponnappan: 'medium' };
  const BOT_TUNED = ['Kuttan', 'Ammini', 'Unni', 'Sarojini', 'Leela'];
  const BOT_NET = ['Jalaja', 'Ponnappan'];   // card play by a neural net (src/netplay.js); host's pick only
  const CHAR_NAME = named({ aggressive: 'Bold', medium: 'Steady', defensive: 'Careful' });
  const CHAR_TEXT = named({ aggressive: 'Bids often, fights for the contract and jumps to 40 when strong.', medium: 'Bids what the hand is worth and jumps only when it is sure.', defensive: 'Bids rarely and stays low, but usually makes what it bids.' });
  // the bots with their character: a list to read (lobby, table panel) or buttons to pick from (host, before the first deal)
  function botCards(pick, used = []) {
    return `<div class="bot-list">${Object.keys(BOT_CHAR).map((n) => {
      const c = BOT_CHAR[n];
      const inner = `<b>${esc(Lang.botName(n))}</b><span class="chr ${c}">${CHAR_NAME[c]}</span><span class="what">${CHAR_TEXT[c]}${BOT_TUNED.includes(n) ? ' ' + T('Bidding learned from human play.') : ''}${BOT_NET.includes(n) ? ' ' + T('Plays its cards with a neural network that learned from millions of searched positions.') : ''}</span>`;
      return pick ? `<button class="bot-card" data-pick="${n}" ${used.includes(n) ? 'disabled' : ''}>${inner}</button>` : `<div class="bot-card">${inner}</div>`;
    }).join('')}</div>`;
  }
  function pickBot(seat) {
    const used = room.seats.filter((s) => s.seat !== seat && s.kind === 'bot' && s.picked).map((s) => s.name);
    openModal(`<h2>${T('Choose a bot for this seat')}</h2>
      ${room.botStyle && room.botStyle !== 'mixed' ? `<p class="sub">${T('The table is set to {0}: every bot plays that way, whatever its own character.', T(room.botStyle))}</p>` : ''}
      ${botCards(true, used)}
      <div class="row"><button class="btn" data-pick="">${T('Any bot')}</button><button class="btn ghost" data-close>${T('Cancel')}</button></div>`, true);
    $('modalBody').querySelectorAll('[data-pick]').forEach((b) => (b.onclick = () => { closeModal(); socket.emit('setBot', { seat, on: true, name: b.dataset.pick || undefined }); }));
  }
  const SUIT_NAME = named({ S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs', NT: 'No trump' });
  const RED = new Set(['H', 'D']);
  // suit classes: 'red' for the two-colour deck, 'su-X' for the four-colour option (body.four in style.css)
  const sc = (s) => `${RED.has(s) ? 'red ' : ''}su-${s}`;
  const POINTS = { J: 3, 9: 2, A: 1, 10: 1, K: 0, Q: 0, 8: 0, 7: 0 };
  const TEAM_DEFAULT = named(['Team A', 'Team B']);
  const SEAT_POS = [[50, 93], [93, 69], [93, 27], [50, 7], [7, 27], [7, 69]];
  const SEAT_POS_NARROW = [[50, 95], [85, 69], [85, 29], [50, 5], [15, 29], [15, 69]];
  const TRICK_POS = [[50, 72], [69, 62], [69, 36], [50, 27], [31, 36], [31, 62]];
  const SEAT_POS8 = [[50, 93], [82, 86], [95, 50], [82, 14], [50, 7], [18, 14], [5, 50], [18, 86]];
  const SEAT_POS8_NARROW = [[50, 95], [82, 82], [86, 50], [82, 18], [50, 5], [18, 18], [14, 50], [18, 82]];
  const TRICK_POS8 = [[50, 72], [65, 66], [71, 50], [65, 34], [50, 27], [35, 34], [29, 50], [35, 66]];
  const narrow = () => window.matchMedia('(max-width: 700px)').matches;
  window.addEventListener('resize', () => room && room.game !== undefined && render());

  const store = {
    get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } }
  };

  let room = null;
  let bidVal = 28;
  let bidKey = '';
  let chgVal = 29, chgKey = '';
  let lastPhaseKey = '';
  let chipHold = null;          // chip counts shown while the chips of a settled hand are still flying (see chipsFly)
  const chipsNow = (g, t) => (g ? (chipHold ? chipHold[t] : g.tables[t]) : 12);
  let chipPain = null;          // the paying team while its chips are being taken (its seats dim)
  // the team's chips beside its captain: a vertical pile, one disc per chip (up to 24); the first disc is the top one
  const towerHtml = (n) => '<i></i>'.repeat(Math.max(0, Math.min(n, 24)));
  const shedding = new Set();   // seats whose kunukku has just come off (see kunukkuSmash)
  let smashQueued = false;      // the hand-result screens will run the smash when they are done
  const socket = io({ transports: ['websocket', 'polling'] });

  // ------------------------------------------------------------ connection
  socket.on('connect', () => socket.emit('hello', { token: store.get('g56token', '') }));
  socket.on('token', (t) => {
    store.set('g56token', t);
    const code = new URLSearchParams(location.search).get('room');
    if (code) socket.emit('joinRoom', { code, name: myName() });
  });
  socket.on('errorMsg', (m) => toast(Lang.fromServer(m)));
  socket.on('room', (r) => {
    const prev = room;
    room = r;
    // seats that wore the kunukku a moment ago and no longer do: it stays drawn until the smash animation takes it
    if (prev && prev.code === r.code && r.game) r.seats.forEach((s, i) => { if (prev.seats[i] && prev.seats[i].kunukku && !s.kunukku) shedding.add(i); });
    if (location.search !== `?room=${r.code}`) history.replaceState(null, '', `?room=${r.code}`);
    show('table');
    render();
    if (shedding.size && !smashQueued) kunukkuSmash();
  });
  socket.on('disconnect', () => toast(T('Connection lost. Reconnecting…')));

  // ------------------------------------------------------------ lobby
  $('nameInput').value = store.get('g56name', '');
  const myName = () => {
    const n = $('nameInput').value.trim();
    if (n) store.set('g56name', n);
    return n;
  };
  // Team choice, asked after Start / Join: '' = any, 0 = Team A (even seats), 1 = Team B (odd seats).
  // The last choice is remembered and highlighted. Applies only when you first sit.
  const pickTeam = (title, send) => {
    const last = store.get('g56team', '');
    const opt = (v, label) => `<button class="btn${v === last ? ' primary' : ''}" data-team="${v}">${label}</button>`;
    openModal(`<h2>${esc(title)}</h2>
      <p class="sub">${T('Which team do you want to sit on? If it is full you get a seat on the other team.')}</p>
      <div class="row team-pick">${opt('0', T('Team A'))}${opt('1', T('Team B'))}${opt('', T('Any team'))}</div>
      <div class="row"><button class="btn ghost" data-close>${T('Cancel')}</button></div>`, true);
    $('modalBody').querySelectorAll('[data-team]').forEach((b) => (b.onclick = () => {
      store.set('g56team', b.dataset.team);
      closeModal();
      send(b.dataset.team === '' ? null : Number(b.dataset.team));
    }));
  };
  const initialCode = new URLSearchParams(location.search).get('room');
  if (initialCode) $('codeInput').value = initialCode.toUpperCase();

  const needName = () => { if (myName()) return true; toast(T('Please type your name first.')); $('nameInput').focus(); return false; };
  $('createBtn').onclick = () => {
    if (!needName()) return;
    const players = Number($('newPlayers').value);
    pickTeam(T('New {0}-player table', players), (team) => socket.emit('createRoom', { name: myName(), players, team }));
  };
  document.querySelectorAll('[data-fixed]').forEach((b) => (b.onclick = () => {
    if (needName()) pickTeam(T('{0}-player table', b.dataset.fixed === 'TABLE8' ? '8' : '6'), (team) => socket.emit('joinRoom', { code: b.dataset.fixed, name: myName(), team }));
  }));
  let lobbyTables = [];   // kept so the lines can be redrawn when the language changes
  function renderLobby() {
    $('botGuide').innerHTML = botCards(false);
    lobbyTables.forEach((t) => {
      const el = $(t.players === 8 ? 'info8' : 'info6'); if (!el) return;
      if (t.seated) el.innerHTML = `<span class="live">${T('LIVE')}</span> ${T('{0} seated', t.seated)}${t.watching ? T(', {0} watching', t.watching) : ''}${t.playing ? T(', playing') : ''}`;
      else el.innerHTML = t.hasGame ? T('empty, old game waiting') : T('empty');
      const rb = document.querySelector(`[data-reset-table="${t.code}"]`);
      if (rb) { rb.classList.toggle('hidden', !(t.hasGame && !t.seated)); rb.onclick = () => socket.emit('resetTable', { code: t.code }); }
    });
  }
  socket.on('lobby', (tables) => { lobbyTables = tables; renderLobby(); });
  $('joinBtn').onclick = () => {
    const code = $('codeInput').value.trim().toUpperCase();
    if (code.length < 5) return toast(T('Enter the table code.'));
    if (needName()) pickTeam(T('Table {0}', code), (team) => socket.emit('joinRoom', { code, name: myName(), team }));
  };
  $('codeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('joinBtn').click(); });

  function show(which) {
    $('lobby').classList.toggle('hidden', which !== 'lobby');
    $('table').classList.toggle('hidden', which !== 'table');
  }

  // ------------------------------------------------------------ table chrome
  $('codeChip').onclick = async () => {
    const url = `${location.origin}/?room=${room.code}`;
    try { await navigator.clipboard.writeText(url); toast(T('Invite link copied')); }
    catch { toast(url); }
  };
  $('railToggle').onclick = () => $('rail').classList.toggle('open');
  $('railClose').onclick = () => $('rail').classList.remove('open');
  // On phones the chat slides over the table: a tap on the table outside it closes it too.
  document.addEventListener('pointerdown', (e) => {
    const r = $('rail');
    if (r.classList.contains('open') && !r.contains(e.target) && !e.target.closest('#railToggle')) r.classList.remove('open');
  });

  // Full screen for phones and tablets (hidden where the browser has no Fullscreen API, e.g. iPhone Safari).
  const fsEl = document.documentElement;
  const fsOn = () => document.fullscreenElement || document.webkitFullscreenElement;
  const canFs = !!(fsEl.requestFullscreen || fsEl.webkitRequestFullscreen) && window.matchMedia('(pointer: coarse)').matches;
  $('fullBtn').classList.toggle('hidden', !canFs);
  const syncFs = () => { $('fullBtn').textContent = fsOn() ? '✕' : '⛶'; $('fullBtn').title = fsOn() ? T('Exit full screen') : T('Full screen'); $('fullBtn').setAttribute('aria-label', $('fullBtn').title); };
  document.addEventListener('fullscreenchange', syncFs);
  document.addEventListener('webkitfullscreenchange', syncFs);
  $('fullBtn').onclick = async () => {
    try {
      if (fsOn()) await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else await (fsEl.requestFullscreen || fsEl.webkitRequestFullscreen).call(fsEl, { navigationUI: 'hide' });
    } catch { toast(T('Full screen is not available in this browser.')); }
  };
  // four-colour deck: a per-player option, remembered in the browser
  const setDeck = (on) => { document.body.classList.toggle('four', on); $('deckBtn').textContent = on ? T('2-colour deck') : T('4-colour deck'); };
  setDeck(store.get('g56deck', '') === '4');
  $('botsBtn').onclick = () => openModal(`<h2>${T('Meet the bots')}</h2>${botCards(false)}<div class="row"><button class="btn" data-close>${T('Close')}</button></div>`, true);
  $('deckBtn').onclick = () => { const on = !document.body.classList.contains('four'); store.set('g56deck', on ? '4' : '2'); setDeck(on); };
  // language: English or Malayalam, a per-player option (lang.js); everything on screen is redrawn
  document.querySelectorAll('.lang-btn').forEach((b) => (b.onclick = () => {
    Lang.toggle();
    setDeck(document.body.classList.contains('four'));
    syncFs();
    renderLobby();
    if (room) render();
  }));
  syncFs();
  $('leaveBtn').onclick = () => {
    socket.emit('leave');
    room = null;
    history.replaceState(null, '', '/');
    $('rail').classList.remove('open');
    show('lobby');
  };
  $('chatForm').onsubmit = (e) => {
    e.preventDefault();
    const t = $('chatInput').value.trim();
    if (t) socket.emit('chat', { text: t });
    $('chatInput').value = '';
  };
  $('lastTrickBtn').onclick = () => {
    const g = room && room.game;
    if (!g || !g.lastTrick) return toast(T('No trick has been completed yet.'));
    openModal(`
      <h2>${T('Last trick')}</h2>
      <p>${T('{0} won it for {1} ({2} pts).', esc(nameOf(g.lastTrick.winner)), teamName(g.lastTrick.winner % 2), g.lastTrick.points)}</p>
      <div class="mini-trick">${g.lastTrick.cards.map((x) => `
        <figure class="${x.seat === g.lastTrick.winner ? 'win' : ''}">${cardHTML(x.card)}<figcaption>${esc(nameOf(x.seat))}</figcaption></figure>`).join('')}
      </div>
      <div class="row"><button class="btn primary" data-close>${T('Close')}</button></div>`, true);
  };

  $('teamNamesBtn').onclick = () => {
    if (room.mySeat === null && !room.isHost) return toast(T('Sit down first to rename the teams.'));
    openModal(`<h2>${T('Team names')}</h2>
      <p class="sub">${T('Shown to everyone at this table.')}</p>
      <div class="team-edit">
        ${[0, 1].map((t) => `<label class="field t${t}"><span>${esc(TEAM_DEFAULT[t])}</span><input id="teamName${t}" maxlength="14" value="${teamName(t)}" placeholder="${esc(TEAM_DEFAULT[t])}"></label>`).join('')}
      </div>
      <div class="row"><button class="btn primary" id="teamNamesSave">${T('Save')}</button><button class="btn" data-close>${T('Cancel')}</button></div>`, true);
    $('teamName0').focus();
    const save = () => {
      [0, 1].forEach((t) => { const v = $(`teamName${t}`).value.trim(); if (v !== rawTeam(t)) socket.emit('teamName', { team: t, name: v }); });
      closeModal();
    };
    $('teamNamesSave').onclick = save;
    $('modalBody').querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); }));
  };

  // Match won: a trophy fills the screen for a few seconds (or until tapped), then the result modal follows.
  const TROPHY = `<svg viewBox="0 0 120 130" aria-hidden="true">
    <defs><linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFE9A6"/><stop offset=".45" stop-color="#E2B33C"/><stop offset="1" stop-color="#9A6A1A"/></linearGradient>
    <linearGradient id="gold2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F6D77A"/><stop offset="1" stop-color="#B3802A"/></linearGradient></defs>
    <path d="M22 18h76l-4 34c-3 18-16 30-34 30S31 70 28 52z" fill="url(#gold)"/>
    <path d="M22 18c-14 0-18 10-14 20 3 9 10 16 20 17l-2-10c-5-1-10-5-11-10-1-5 1-9 7-9z M98 18c14 0 18 10 14 20-3 9-10 16-20 17l2-10c5-1 10-5 11-10 1-5-1-9-7-9z" fill="url(#gold2)"/>
    <rect x="52" y="82" width="16" height="16" fill="url(#gold2)"/>
    <path d="M38 98h44c4 0 6 3 6 6v6H32v-6c0-3 2-6 6-6z" fill="url(#gold)"/>
    <rect x="28" y="110" width="64" height="10" rx="3" fill="#7A2026"/>
    <path d="M34 22q6 26 20 44" stroke="#FFF6D6" stroke-width="4" stroke-linecap="round" fill="none" opacity=".75"/>
    <path d="M60 36l4 9 10 1-7 7 2 10-9-5-9 5 2-10-7-7 10-1z" fill="#7A2026" opacity=".85"/></svg>`;
  // Kunukku: the loser's ear-drop. An ear with a coconut-leaf rib looped over it and a baby coconut dangling
  // below the lobe; the hanging part (g.kun-drop) swings.
  const KUNUKKU = `<svg viewBox="0 0 60 86" aria-hidden="true">
    <defs><radialGradient id="kunG" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#B9E36A"/><stop offset=".55" stop-color="#6FB53A"/><stop offset="1" stop-color="#3C8526"/></radialGradient></defs>
    <path d="M12 31C9 13 25 4 38 8c12 4 15 18 10 30-4 10-9 14-12 20-4 9-19 9-22-1-2-7 0-16-2-26z" fill="#F6C59C" stroke="#7A4A22" stroke-width="2" stroke-linejoin="round"/>
    <path d="M20 29c0-10 9-14 17-11 7 3 8 12 4 20-3 6-7 9-9 13" fill="none" stroke="#DDA070" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M24 35c4-3 9-1 9 4 0 4-4 6-5 10-1 3-5 3-6 0" fill="#E9AE82" stroke="#C98658" stroke-width="1.2" stroke-linecap="round"/>
    <path d="M13 21c1 12 9 15 15 22" stroke="#5E8A2E" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <g class="kun-drop">
      <path d="M28 43c5 6 8 11 12 17" stroke="#5E8A2E" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <path d="M45 42c1 6 0 12-3 18" stroke="#8A6A32" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path d="M31 69c0-10 21-10 21 0 0 9-4 15-10.500 15S31 78 31 69z" fill="url(#kunG)" stroke="#245E1B" stroke-width="1.4"/>
      <path d="M32 65q3-7 9.500-7t9.500 7q-3-2-4.750 0-2.250-2.500-4.750 0-2.500-2.500-4.750 0-1.750-2-4.750 0z" fill="#A39545" stroke="#5E4A1C" stroke-width=".9" stroke-linejoin="round"/>
      <ellipse cx="36.500" cy="71" rx="1.800" ry="4" fill="#fff" opacity=".4" transform="rotate(-14 36.500 71)"/>
    </g></svg>`;
  const KUNUKKU_TIP = 'Kunukku: lost the last match. Comes off when this player bids and makes a contract, or when the team wins the match.';
  // Kunukku kayaral: after the champions screen a giant kunukku drops in, then one flies to every seat of the
  // losing team and lands there. The seats' own kunukkus stay hidden (#seats.kun-pending) until the landing.
  function kunukkuKayaral(team, after) {
    const old = $('kayaral'); if (old) old.remove();
    const el = document.createElement('div');
    el.id = 'kayaral'; el.className = 'kayaral';
    el.innerHTML = `<div class="kay-card"><span class="kunukku huge">${KUNUKKU}</span>
      <div class="kicker">${T('Kunukku kayari!')}</div><div class="team t${team}">${teamName(team)}</div><div class="sub">${T('wears the kunukku')}</div></div>`;
    document.body.appendChild(el);
    let done = false;
    const land = () => { $('seats').classList.remove('kun-pending'); $('seats').classList.add('kun-landed'); setTimeout(() => $('seats').classList.remove('kun-landed'), 900); };
    const end = () => { if (done) return; done = true; land(); el.remove(); after && after(); };
    el.onclick = end;
    setTimeout(() => {
      if (done) return;
      const from = el.querySelector('.kunukku').getBoundingClientRect();
      el.classList.add('fly');
      const seats = [...document.querySelectorAll(`#seats .seat.t${team}:not(.empty)`)];
      const STEP = 220, FLY = 1150;
      seats.forEach((seat, i) => {
        const k = seat.querySelector('.kunukku'), sr = seat.getBoundingClientRect();
        const to = k ? k.getBoundingClientRect() : { left: sr.right - 22, top: sr.bottom - 10, width: 46, height: 66 };
        const f = document.createElement('span');
        f.className = 'kunukku flyer'; f.innerHTML = KUNUKKU;
        f.style.cssText = `left:${from.left}px;top:${from.top}px;width:${from.width}px`;
        el.appendChild(f);
        const dx = to.left + to.width / 2 - (from.left + from.width / 2), dy = to.top + to.height / 2 - (from.top + from.height / 2);
        const sc = to.width / from.width, spin = i % 2 ? -360 : 360;
        f.animate([
          { transform: 'translate(0,0) scale(1) rotate(0deg)' },
          { transform: `translate(${dx * .45}px,${dy * .45 - 140}px) scale(${(1 + sc) / 1.6}) rotate(${spin * .6}deg)`, offset: .55 },
          { transform: `translate(${dx}px,${dy}px) scale(${sc}) rotate(${spin}deg)` }
        ], { duration: FLY, delay: i * STEP, easing: 'cubic-bezier(.45,0,.3,1)', fill: 'both' });
      });
      setTimeout(end, FLY + Math.max(0, seats.length - 1) * STEP + 80);
    }, 1900);
  }
  if (location.hostname === 'localhost') window.demoKunukku = (t = 0) => kunukkuKayaral(t);
  // Kunukku comes off: it is plucked from each seat in `shedding`, flies to the middle of the table and
  // breaks into pieces there.
  function kunukkuSmash(after) {
    smashQueued = false;
    const els = [...shedding].map((i) => document.querySelector(`#seats .seat[data-seat="${i}"] .kunukku`)).filter(Boolean);
    shedding.clear();
    if (!els.length) { after && after(); return; }
    const m = $('mat').getBoundingClientRect(), cx = m.left + m.width / 2, cy = m.top + m.height / 2;
    const u = Math.min(m.width, m.height) / 4;
    const layer = document.createElement('div');
    layer.className = 'kun-smash';
    document.body.appendChild(layer);
    const STEP = 320, FLY = 1000, rnd = (a, b) => a + Math.random() * (b - a);
    const COLS = ['#6FB53A', '#3C8526', '#B9E36A', '#F4EFD8', '#F4EFD8', '#A39545', '#F6C59C'];
    const burst = () => {
      const ring = document.createElement('i');
      ring.className = 'kun-ring'; ring.style.cssText = `left:${cx}px;top:${cy}px`;
      layer.appendChild(ring);
      ring.animate([{ transform: 'scale(.2)', opacity: .95 }, { transform: `scale(${(u / 22).toFixed(2)})`, opacity: 0 }], { duration: 480, easing: 'ease-out', fill: 'forwards' });
      for (let n = 0; n < 22; n++) {
        const p = document.createElement('i'), w = rnd(.16, .4) * u, a = rnd(0, Math.PI * 2), d = rnd(.5, 1.5) * u;
        const tx = Math.cos(a) * d, ty = Math.sin(a) * d, rot = rnd(-540, 540);
        p.className = 'kun-shard';
        p.style.cssText = `left:${cx - w / 2}px;top:${cy - w / 2}px;width:${w}px;height:${w * rnd(.6, 1.1)}px;background:${COLS[n % COLS.length]};`
          + `clip-path:polygon(${rnd(0, 30)}% ${rnd(0, 30)}%, ${rnd(70, 100)}% ${rnd(0, 40)}%, ${rnd(55, 100)}% ${rnd(65, 100)}%, ${rnd(0, 35)}% ${rnd(70, 100)}%)`;
        layer.appendChild(p);
        p.animate([
          { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
          { transform: `translate(${tx * .75}px,${ty * .75 - u * .35}px) rotate(${rot * .6}deg)`, opacity: 1, offset: .5 },
          { transform: `translate(${tx}px,${ty + u * .6}px) rotate(${rot}deg)`, opacity: 0 }
        ], { duration: rnd(800, 1200), easing: 'cubic-bezier(.2,.6,.5,1)', fill: 'forwards' });
      }
    };
    els.forEach((k, n) => {
      const from = k.getBoundingClientRect();
      const f = document.createElement('span');
      f.className = 'kunukku flyer'; f.innerHTML = KUNUKKU;
      f.style.cssText = `left:${from.left}px;top:${from.top}px;width:${from.width}px`;
      layer.appendChild(f);
      const dx = cx - (from.left + from.width / 2), dy = cy - (from.top + from.height / 2);
      const sc = Math.max(1.5, Math.min(3, u * .8 / from.width)), spin = n % 2 ? -540 : 540;
      f.animate([
        { transform: 'translate(0,0) scale(1) rotate(0deg)' },
        { transform: 'translate(0,-10px) scale(1.3) rotate(-16deg)', offset: .14 },
        { transform: 'translate(0,-16px) scale(1.3) rotate(14deg)', offset: .26 },
        { transform: `translate(${dx * .5}px,${dy * .5 - u}px) scale(${sc}) rotate(${spin * .55}deg)`, offset: .68, easing: 'cubic-bezier(.6,0,.9,.4)' },
        { transform: `translate(${dx}px,${dy}px) scale(${sc * .85}) rotate(${spin}deg)` }
      ], { duration: FLY, delay: n * STEP, fill: 'both' });
      setTimeout(() => { f.remove(); burst(); }, FLY + n * STEP);
    });
    renderSeats(room.game);   // the flyers stand in for the seats' own from here
    setTimeout(() => { layer.remove(); after && after(); }, FLY + (els.length - 1) * STEP + 1150);
  }
  if (location.hostname === 'localhost') window.demoSmash = (...seats) => { seats.forEach((i) => shedding.add(i)); renderSeats(room.game); kunukkuSmash(); };
  // matchWin: the big six-second "Champions" version; otherwise a shorter one for the hand's winner.
  // Clean sweep: the losing team did not take a single point. A burst of suit signs and the score slammed in.
  function sweep(team, loser, score, all56, after) {
    const old = $('sweep'); if (old) old.remove();
    const el = document.createElement('div');
    el.id = 'sweep'; el.className = `sweep t${team}${all56 ? ' all' : ''}`;
    const signs = ['♠', '♥', '♣', '♦'];
    const bits = Array.from({ length: all56 ? 56 : 32 }, (_, i) => `<i class="${i % 2 ? 'red' : ''}" style="--a:${Math.round(Math.random() * 360)}deg;--d:${Math.round(34 + Math.random() * 46)}vmin;--t:${(Math.random() * (all56 ? 1.6 : .7)).toFixed(2)}s">${signs[i % 4]}</i>`).join('');
    el.innerHTML = `<div class="burst">${bits}</div>
      <div class="sweep-card"><div class="score">${score}</div>
        <div class="kicker">${all56 ? T('All 56 points!') : T('Clean sweep!')}</div><div class="team">${teamName(team)}</div>
        <div class="sub">${T('{0} did not get a single point', teamName(loser))}</div></div>`;
    document.body.appendChild(el);
    $('table').classList.add('shake'); setTimeout(() => $('table').classList.remove('shake'), 900);
    let done = false;
    const finish = () => { if (done) return; done = true; el.classList.add('out'); setTimeout(() => { el.remove(); after && after(); }, 380); };
    el.onclick = finish;
    setTimeout(finish, all56 ? 4600 : 3200);
  }
  // The chips of a settled hand are taken from the paying team's pile (beside its captain) to the receiving team's.
  // Made to hurt: the losers' seats dim and their pile trembles; each chip is wrenched off the top of their pile
  // (it wobbles, resists, then is yanked away), their pile flinches and a red "−1" rises; at the end their pile slumps.
  // The server has already moved the chips, so the old counts are held meanwhile (chipHold).
  function chipsFly(payer, receiver, amount, tables, after) {
    const stackOf = (t) => document.querySelector(`#seats .seat[data-seat="${t}"] .stack`);
    const from = stackOf(payer), to = stackOf(receiver);
    if (!from || !to || !(amount > 0) || payer === receiver) return after && after();
    chipHold = []; chipHold[payer] = tables[payer] + amount; chipHold[receiver] = tables[receiver] - amount;
    chipPain = payer;
    const paint = (t) => {
      const s = stackOf(t);
      if (s) { s.querySelector('b').textContent = chipHold[t]; s.querySelector('.tower').innerHTML = towerHtml(chipHold[t]); }
      $(`tables${t}`).textContent = T('{0} chips', chipHold[t]);
    };
    const kick = (el, cls) => { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
    document.querySelectorAll(`#seats .seat.t${payer}`).forEach((e) => e.classList.add('pain'));
    paint(payer); paint(receiver);
    kick(from, 'dread');
    const n = Math.min(amount, 12), each = Math.floor(amount / n), TUG = 520, FLY = 620, STEP = 560, WAIT = 800;
    for (let i = 0; i < n; i++) {
      const k = i === n - 1 ? amount - each * (n - 1) : each;
      setTimeout(() => {
        if (!chipHold) return;
        const s = stackOf(payer), d = stackOf(receiver);
        if (!s || !d) return;
        // the chip leaves from the top of the losers' pile and lands on top of the winners'
        const top = (s.querySelector('.tower i') || s).getBoundingClientRect();
        const dt = (d.querySelector('.tower i') || d.querySelector('.tower')).getBoundingClientRect();
        const x0 = top.left + top.width / 2, y0 = top.top + top.height / 2;
        const dx = dt.left + dt.width / 2 - x0, dy = dt.top - 8 - y0;
        chipHold[payer] -= k; paint(payer); kick(stackOf(payer), 'flinch');
        const m = document.createElement('span');
        m.className = 'chiploss'; m.textContent = `−${k}`;
        m.style.cssText = `left:${x0 - 14}px;top:${y0 - 40}px`;
        document.body.appendChild(m);
        m.animate([{ transform: 'translateY(0) scale(.6)', opacity: 0 }, { transform: 'translateY(-14px) scale(1.25)', opacity: 1, offset: .2 },
          { transform: 'translateY(-46px) scale(1)', opacity: 0 }], { duration: 1100, easing: 'ease-out', fill: 'both' }).onfinish = () => m.remove();
        const c = document.createElement('i');
        c.className = `chipfly t${payer}`;
        c.style.cssText = `left:${x0 - 12}px;top:${y0 - 12}px`;
        document.body.appendChild(c);
        const tug = TUG / (TUG + FLY);
        c.animate([
          { transform: 'translate(0,0) rotate(0) scale(.8)' },
          { transform: 'translate(-4px,2px) rotate(-14deg) scale(1)', offset: tug * .2 },
          { transform: 'translate(4px,-3px) rotate(12deg) scale(1)', offset: tug * .4 },
          { transform: 'translate(-3px,1px) rotate(-9deg) scale(1)', offset: tug * .6 },
          { transform: 'translate(0,5px) rotate(0) scale(1.15,.8)', offset: tug * .85 },      // straining against the pull
          { transform: 'translate(0,-6px) rotate(0) scale(.95,1.15)', offset: tug, easing: 'cubic-bezier(.5,0,.9,.5)' },
          { transform: `translate(${dx * .45}px,${dy * .45 - 70}px) rotate(260deg) scale(1.3)`, offset: tug + (1 - tug) * .45 },
          { transform: `translate(${dx}px,${dy}px) rotate(540deg) scale(.9)` }
        ], { duration: TUG + FLY, fill: 'both' });
        setTimeout(() => {
          c.remove();
          if (!chipHold) return;
          chipHold[receiver] += k; paint(receiver); kick(stackOf(receiver), 'bump');
          if (i < n - 1) return;
          kick(stackOf(payer), 'slump');
          setTimeout(() => { chipHold = null; chipPain = null; if (room && room.game) { renderScores(room.game); renderSeats(room.game); } after && after(); }, 900);
        }, TUG + FLY);
      }, WAIT + i * STEP);
    }
  }
  if (location.hostname === 'localhost') {
    window.demoSweep = (t = 0, all = false) => sweep(t, 1 - t, all ? '56 – 0' : '40 – 0', all);
    window.demoChips = (payer = 0, n = 3) => chipsFly(payer, 1 - payer, n, room.game ? room.game.tables : [12 - n, 12 + n]);
  }

  function celebrate(team, matchWin, sub, after) {
    const old = $('cheer'); if (old) old.remove();
    const el = document.createElement('div');
    el.id = 'cheer'; el.className = `cheer t${team}${matchWin ? ' match' : ''}`;
    const bits = Array.from({ length: matchWin ? 70 : 36 }, (_, i) => `<i style="--x:${Math.random() * 100}%;--d:${(Math.random() * 1.6).toFixed(2)}s;--t:${(2.6 + Math.random() * 2).toFixed(2)}s;--r:${Math.round(Math.random() * 720 - 360)}deg;--s:${(.6 + Math.random() * .9).toFixed(2)}" class="c${i % 5}"></i>`).join('');
    el.innerHTML = `<div class="confetti">${bits}</div>
      <div class="cheer-card"><div class="rays"></div><div class="trophy">${TROPHY}</div>
        <div class="kicker">${matchWin ? T('Champions') : T('Hand won')}</div><div class="team">${teamName(team)}</div><div class="sub">${sub}</div>
        <div class="tap">${T('tap to continue')}</div></div>`;
    document.body.appendChild(el);
    let done = false;
    const finish = () => { if (done) return; done = true; el.classList.add('out'); setTimeout(() => { el.remove(); after && after(); }, 420); };
    el.onclick = finish;
    setTimeout(finish, matchWin ? 6000 : 3800);
  }
  if (location.hostname === 'localhost') window.demoWin = (t = 0, match = true) => celebrate(t, match, match ? 'wins the match' : 'takes 2 chips');

  // ------------------------------------------------------------ bidding controls
  $('bidMinus').onclick = () => { bidVal = Math.max(bidVal - 1, room.game.legal.bid.minBid); renderBidPanel(); };
  $('bidPlus').onclick = () => { bidVal = Math.min(bidVal + 1, 56); renderBidPanel(); };
  $('passBtn').onclick = () => socket.emit('bid', { type: 'pass' });
  $('doubleBtn').onclick = () => socket.emit('bid', { type: 'double' });
  $('redoubleBtn').onclick = () => socket.emit('bid', { type: 'redouble' });

  // ------------------------------------------------------------ helpers
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  // bots' names follow the language; a player's own name is shown as typed
  function nameOf(seat) { const s = room.seats[seat]; return s && s.name ? (s.kind === 'bot' ? Lang.botName(s.name) : s.name) : T('Seat {0}', seat + 1); }
  const rawTeam = (t) => T((room && room.teamNames && room.teamNames[t]) || TEAM_DEFAULT[t]);   // "Team A" follows the language, a typed name does not
  function teamName(t) { return esc(rawTeam(t)); }   // always used inside HTML
  const N = () => (room && room.players) || 6;
  function rel(seat) { return room.mySeat === null ? seat : (seat - room.mySeat + N()) % N(); }
  const seatPos = () => N() === 8 ? (narrow() ? SEAT_POS8_NARROW : SEAT_POS8) : (narrow() ? SEAT_POS_NARROW : SEAT_POS);
  const trickPos = () => (N() === 8 ? TRICK_POS8 : TRICK_POS);
  // hasJack=false renders suit-first ("Hearts 30"): the caller lacks the Jack of that suit.
  // Bid buttons and seat bubbles: the suit name sits next to its sign, keeping the Jack order ("31 Spade ♠" / "Spade ♠ 31"). Returns HTML.
  const SUIT_ONE = named({ S: 'Spade', H: 'Heart', D: 'Diamond', C: 'Club' });
  function suitBtnText(v, s, hasJack) {
    if (s === 'NT') return `${v} NT`;
    const named = `<span class="sname">${SUIT_ONE[s]}</span> ${SYM[s]}`;
    return hasJack ? `${v} ${named}` : `${named} ${v}`;
  }
  function bidText(v, s, hasJack = true) { return s === 'NT' ? `${v} NT` : hasJack ? `${v} ${SYM[s]}` : `${SYM[s]} ${v}`; }
  // wrap suit symbols so hearts/diamonds show red and all suits a little larger
  const SYM_SUIT = { '♠': 'S', '♥': 'H', '♦': 'D', '♣': 'C' };
  function colourSuits(html) { return html.replace(/[♠♣♥♦]/g, (m) => `<span class="suit ${RED.has(SYM_SUIT[m]) ? 'red' : 'black'} su-${SYM_SUIT[m]}">${m}</span>`); }
  function actionText(a) {
    if (a.type === 'bid') return (a.change ? T('Change to ') : '') + bidText(a.value, a.suit, a.hasJack);
    if (a.type === 'plus') return T('Plus {0} ({1})', a.n, bidText(a.value, a.suit, a.hasJack));
    if (a.type === 'ns') return T('{0} NS (no {1})', a.value, SYM[a.ns]);
    return T({ pass: 'Pass', double: 'Double', redouble: 'Redouble' }[a.type]);
  }
  // A seat's call bubble, as HTML with suit names (actionText stays plain for the history and chat).
  function actionNamed(a) {
    if (a.type === 'bid') return (a.change ? T('Change to ') : '') + suitBtnText(a.value, a.suit, a.hasJack);
    if (a.type === 'plus') return T('Plus {0} ({1})', a.n, suitBtnText(a.value, a.suit, a.hasJack));
    if (a.type === 'ns') return T('{0} NS (no {1})', a.value, `<span class="sname">${SUIT_ONE[a.ns]}</span> ${SYM[a.ns]}`);
    return actionText(a);
  }
  function cardHTML(c, extra = '') {
    return `<div class="card ${sc(c.suit)} ${extra}" aria-label="${T('{0} of {1}', c.rank, SUIT_NAME[c.suit])}">
      <span class="r">${c.rank}</span><span class="s1">${SYM[c.suit]}</span>
      ${POINTS[c.rank] ? `<span class="pt">${POINTS[c.rank]}</span>` : ''}<span class="s2">${SYM[c.suit]}</span>
      <span class="r r2">${c.rank}</span><span class="s1 s3">${SYM[c.suit]}</span></div>`;
  }
  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }
  function openModal(html, closable, kind = 'info') {
    $('modalBody').innerHTML = html;
    $('modal').dataset.kind = kind;
    $('modal').classList.remove('hidden');
    $('modal').dataset.closable = closable ? '1' : '';
    $('modalBody').querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeModal));
    $('modalBody').querySelectorAll('[data-start]').forEach((b) => (b.onclick = () => { closeModal(); socket.emit('start'); }));
    $('modalBody').querySelectorAll('[data-next]').forEach((b) => (b.onclick = () => { closeModal(); socket.emit('nextHand'); }));
    $('modalBody').querySelectorAll('[data-hands]').forEach((b) => (b.onclick = showDealtHands));
    $('modalBody').querySelectorAll('[data-reset]').forEach((b) => (b.onclick = () => { closeModal(); socket.emit('resetChips'); }));
  }
  function closeModal() { $('modal').classList.add('hidden'); $('modalBody').innerHTML = ''; }
  $('modal').onclick = (e) => { if (e.target === $('modal') && $('modal').dataset.closable) closeModal(); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('modal').dataset.closable) closeModal(); });

  // ------------------------------------------------------------ render
  function render() {
    const g = room.game;
    $('handsBtn').classList.toggle('hidden', !(g && g.dealt));
    $('concedeBtn').classList.toggle('hidden', !(g && g.phase === 'playing' && room.mySeat !== null && !room.concede));
    $('resetChipsBtn').classList.toggle('hidden', !(g && room.isHost));
    $('roomCode').textContent = room.fixed ? T('{0}-player table', room.players) : room.code;
    $('codeChip').classList.toggle('fixed', !!room.fixed);
    renderScores(g);
    renderWatchers();
    renderSeats(g);
    renderCenter(g);
    renderTrick(g);
    renderHand(g);
    renderBidPanel();
    renderSelfRaise();
    renderRail(g);
    renderPhaseModal(g);
    renderConcedeModal(g);
    const myTurn = g && g.turn !== null && g.turn === room.mySeat;
    document.title = myTurn ? T('● Your turn · 56') : T('56 · Kerala card table');
  }

  function renderWatchers() {
    const w = room.watchers || [];
    const el = $('watchChip');
    el.classList.toggle('hidden', !w.length);
    if (!w.length) return;
    el.innerHTML = `<span class="eye">👁</span> ${T('{0} watching', w.length)}`;
    el.title = T('Watching: {0}', w.join(', '));
    el.onclick = () => toast(T('Watching: {0}', w.join(', ')));
  }

  function renderScores(g) {
    for (const t of [0, 1]) {
      $(`tname${t}`).textContent = rawTeam(t);
      $(`tables${t}`).textContent = T('{0} chips', chipsNow(g, t));
      $(`hpts${t}`).textContent = g && g.contract ? T('{0} pts', g.points[t]) : '';
    }
    const c = g && !(g.result && g.result.void) && g.contract;   // a void hand has no contract to chase
    $('contractChip').classList.toggle('hidden', !c);
    if (c) {
      const [win, lose] = c.value >= 56 ? [4, 5] : c.value >= 48 ? [3, 4] : c.value >= 40 ? [2, 3] : [1, 2];
      $('contractChip').innerHTML = `${T('<b>{0}</b> needs {1}{2} for {3}', esc(nameOf(c.seat)), colourSuits(esc(bidText(c.value, c.suit, c.hasJack))), c.mult > 1 ? ` ×${c.mult}` : '', teamName(c.team))}
        <span class="stake">${T('wins {0}, loses {1} chips', win * c.mult, lose * c.mult)}</span>`;
    }
  }

  // On touch screens the seat actions stay hidden until the seat is tapped; a tap elsewhere closes them.
  let openSeat = null;
  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;           // let the button's own click go through
    const el = e.target.closest('.seat');
    const next = el ? Number(el.dataset.seat) : null;
    if (next !== openSeat) { openSeat = next; if (room) renderSeats(room.game); }
  });
  function renderSeats(g) {
    const host = room.isHost;
    const lastBy = {};
    if (g && g.phase === 'bidding') g.bidding.actions.forEach((a) => (lastBy[a.seat] = a));
    $('seats').innerHTML = room.seats.map((s) => {
      const [x, y] = seatPos()[rel(s.seat)];
      const isMe = s.seat === room.mySeat;
      const cls = ['seat', `t${s.team}`];
      if (s.kind === 'empty') cls.push('empty');
      // seats 1 and 2 are the captains' seats (one per team): a marker only, the team's chips are kept beside them
      const cap = s.seat < 2;
      if (cap) cls.push('cap');
      const stack = cap ? `<span class="stack" title="${T('Team captain. The team chips are kept here')}"><b>${chipsNow(g, s.team)}</b><span class="tower">${towerHtml(chipsNow(g, s.team))}</span></span>` : '';
      if (g && chipPain === s.team) cls.push('pain');
      if (isMe) cls.push('me');
      if (g) cls.push('ingame');
      if (openSeat === s.seat) cls.push('open');
      if (s.kind === 'human' && !s.connected) cls.push('away');
      if (g && g.turn === s.seat) cls.push('turn');
      const tookTrick = g && g.phase === 'playing' && g.trick.complete && g.trick.winner === s.seat;
      if (tookTrick) cls.push('won');
      // the call bubble faces the mat: below the seats across the table, beside the seats at the ends
      if (y < 15) cls.push('top'); else if (y <= 85) cls.push(x < 50 ? 'left' : 'right');
      let said = '';
      const a = lastBy[s.seat];
      if (tookTrick) said = `<div class="said won">${g.trick.points ? T('takes {0} pts', g.trick.points) : T('takes the trick')}</div>`;
      else if (a) {
        const k = [];
        if (a.type === 'pass') k.push('quiet');
        if (a.type === 'double' || a.type === 'redouble') k.push('dbl');
        if (a.suit && a.suit !== 'NT') k.push(sc(a.suit));
        if (g.bidding.high && g.bidding.high.seat === s.seat && a.type !== 'pass') k.push('high');
        said = `<div class="said ${k.join(' ')}">${actionNamed(a)}</div>`;
      }
      else if (g && g.contract && g.contract.seat === s.seat && g.phase === 'playing')
        said = `<div class="said ${sc(g.contract.suit)}">${suitBtnText(g.contract.value, g.contract.suit, g.contract.hasJack)}</div>`;

      let body;
      if (s.kind === 'empty') {
        body = `<div class="nm">${T('Open seat')}</div><div class="meta">${teamName(s.team)}${cap ? ' · ' + T('captain seat') : ''}</div>
          <div class="seat-actions">
            <button class="btn small" data-sit="${s.seat}">${T('Sit here')}</button>
            ${host ? `<button class="btn small ghost" data-bot="${s.seat}">${T('Add bot')}</button>` : ''}
          </div>`;
      } else {
        const meta = [];
        const anyBot = !g && s.kind === 'bot' && !s.picked;   // named only when the match starts
        if (s.kind === 'bot') meta.push(anyBot ? T('chosen at the deal') : T('bot') + (!g && BOT_CHAR[s.name] && room.botStyle === 'mixed' ? ' · ' + CHAR_NAME[BOT_CHAR[s.name]] : ''));
        if (s.kind === 'human' && !s.connected) meta.push(T('away'));
        const toks = [];
        if (cap) toks.push(`<span class="tok capt" title="${T('Team captain. The team chips are kept here')}">★</span>`);
        if (g && g.dealer === s.seat) toks.push(`<span class="tok" title="${T('Dealt this hand')}">${T('deals')}</span>`);
        if (g && g.phase !== 'handover' && g.phase !== 'matchover' && (g.dealer + 1) % N() === s.seat) toks.push(`<span class="tok" title="${T('Opens the bidding and leads the first trick')}">${T('opens')}</span>`);
        let actions = '';
        const seated = room.mySeat !== null;
        if (s.kind === 'bot' && !isMe)
          actions += `<button class="btn small" data-sit="${s.seat}" title="${seated && g ? T('Move here; a bot takes your current seat') : T('Play this seat')}">${seated && g ? T('Move here') : T('Take seat')}</button>`;
        if (host && !g && s.kind === 'bot') actions += `<button class="btn small ghost" data-bot="${s.seat}">${T('Change')}</button>`;
        if (host && !g && s.kind === 'bot') actions += `<button class="btn small ghost" data-unbot="${s.seat}">${T('Remove')}</button>`;
        // any seated player (or the host) may remove / replace another player
        if (s.kind === 'human' && !isMe && (host || seated))
          actions += `<button class="btn small ghost" data-kick="${s.seat}">${g ? T('Replace with bot') : T('Remove')}</button>`;
        body = `${s.kunukku || shedding.has(s.seat) ? `<span class="kunukku" title="${T(KUNUKKU_TIP)}">${KUNUKKU}</span>` : ''}${g ? `<span class="cnt" title="${T('Cards in hand')}">${g.handCounts[s.seat]}</span>` : ''}${toks.length ? `<div class="toks">${toks.join('')}</div>` : ''}
          <div class="nm">${anyBot ? T('Any bot') : esc(nameOf(s.seat))}${g && s.tuned ? ` <svg viewBox="0 0 16 16" width=".85em" height=".85em" fill="currentColor" style="vertical-align:-.08em"><title>${T('Bids with numbers tuned on human play')}</title><circle cx="8" cy="5" r="3.2"/><path d="M2 15c0-3.6 2.7-5.6 6-5.6s6 2 6 5.6z"/></svg>` : ''}</div>${meta.length ? `<div class="meta">${meta.join(' ')}</div>` : ''}
          ${actions ? `<div class="seat-actions">${actions}</div>` : ''}`;
      }
      return `<div class="${cls.join(' ')}" data-seat="${s.seat}" style="left:${x}%;top:${y}%" title="${teamName(s.team)}">${said}${stack}${body}</div>`;
    }).join('');
    $('seats').querySelectorAll('[data-sit]').forEach((b) => (b.onclick = () => socket.emit('sit', { seat: b.dataset.sit, name: myName() })));
    $('seats').querySelectorAll('[data-bot]').forEach((b) => (b.onclick = () => pickBot(Number(b.dataset.bot))));
    $('seats').querySelectorAll('[data-unbot]').forEach((b) => (b.onclick = () => socket.emit('setBot', { seat: b.dataset.unbot, on: false })));
    $('seats').querySelectorAll('[data-kick]').forEach((b) => (b.onclick = () => socket.emit('kick', { seat: b.dataset.kick })));
    keepSeatsOnScreen();
  }

  // Side seats are centred on a point near the screen edge; on a narrow phone a wide seat (name plus
  // buttons) spills past it. Measure each one and nudge it sideways until it fits.
  function keepSeatsOnScreen() {
    const vw = document.documentElement.clientWidth, pad = 4;
    $('seats').querySelectorAll('.seat').forEach((el) => {
      el.style.setProperty('--nudge', '0px');
      const r = el.getBoundingClientRect();
      const dx = r.left < pad ? pad - r.left : r.right > vw - pad ? vw - pad - r.right : 0;
      if (dx) el.style.setProperty('--nudge', `${Math.round(dx)}px`);
    });
  }

  const STYLE_TEXT = named({ mixed: 'Mixed: each bot keeps its own temperament (hover a bot for it)', defensive: 'Defensive: bid low, rarely raise or go for levels', medium: 'Medium: balanced (default)', aggressive: 'Aggressive: bid up, support partner, go for 40 / 48 / 56' });
  function botStyleHtml() {
    if (!room.isHost) return `<div class="sub">${T('Bots: ')}${esc(T(room.botStyle || 'mixed'))}</div>`;
    return `<label class="sub">${T('Bots: ')}<select id="botStyle" title="${esc(STYLE_TEXT[room.botStyle] || '')}">${['mixed', 'defensive', 'medium', 'aggressive']
      .map((s) => `<option value="${s}" ${s === room.botStyle ? 'selected' : ''}>${T(s)}</option>`).join('')}</select></label>`;
  }
  function wireBotStyle() { const el = $('botStyle'); if (el) el.onchange = () => socket.emit('botStyle', { style: el.value }); }

  function showDealtHands() {
    const g = room.game;
    if (!g || !g.dealt) return toast(T('Hands are shown only after the hand is over.'));
    const c = g.contract;
    openModal(`<h2>${T('Hand {0}: the deal', g.handNo)}</h2>
      <p class="sub">${T('{0} played {1}. {2} dealt.', esc(nameOf(c.seat)), bidText(c.value, c.suit, c.hasJack), esc(nameOf(g.dealer)))}</p>
      <div class="deal-list">${g.dealt.map((cards, seat) => `
        <div class="deal-row t${seat % 2} ${seat === c.seat ? 'bidder' : ''}">
          <div class="who t${seat % 2}">${esc(nameOf(seat))}</div>
          <div class="deal-cards">${cards.map((x) => cardHTML(x)).join('')}</div>
        </div>`).join('')}</div>
      <div class="row"><button class="btn primary" data-close>${T('Close')}</button></div>`, true);
  }
  $('handsBtn').onclick = showDealtHands;
  $('concedeBtn').onclick = () => {
    const g = room.game; if (!g || g.phase !== 'playing' || room.mySeat === null) return;
    const me = room.mySeat % 2, c = g.contract;
    const mates = room.seats.filter((s) => s.seat !== room.mySeat && s.team === me && s.kind === 'human' && s.connected).length;
    openModal(`<h2>${T('Concede this hand?')}</h2>
      <p>${T(me === c.team ? '{0} gives up and pays {1} to {2}, as if the bid had gone down.' : '{0} gives up and pays {1} to {2}, as if the bid had been made.', teamName(me), concedeStake(g, me), teamName(1 - me))}</p>
      ${mates ? `<p class="sub">${T('A teammate has to agree before the hand ends.')}</p>` : ''}
      <div class="row"><button class="btn warn" id="concedeGo">${T('Concede')}</button><button class="btn" data-close>${T('Play on')}</button></div>`, true);
    $('concedeGo').onclick = () => { closeModal(); socket.emit('concede', { action: 'propose' }); };
  };
  function concedeStake(g, team) {
    const c = g.contract, made = team !== c.team;
    const n = (c.value >= 56 ? (made ? 4 : 5) : c.value >= 48 ? (made ? 3 : 4) : c.value >= 40 ? (made ? 2 : 3) : (made ? 1 : 2)) * c.mult;
    return chipsText(n);
  }
  const chipsText = (n) => T(n > 1 ? '{0} chips' : '{0} chip', n);
  // Pending concede request on my team: the proposer waits, the others answer. Opponents never get room.concede.
  let lastConcedeKey = null;
  function renderConcedeModal(g) {
    const cc = room.concede;
    const key = cc && g && g.phase === 'playing' ? `${g.handNo}:${cc.by}` : null;
    if (key === lastConcedeKey) return;
    lastConcedeKey = key;
    if (!key) { if ($('modal').dataset.kind === 'concede') closeModal(); return; }
    const team = cc.team;
    if (cc.by === room.mySeat) {
      openModal(`<h2>${T('Waiting for a teammate')}</h2>
        <p>${T('Your concede request is with the rest of {0}. The hand ends when one of them agrees.', teamName(team))}</p>
        <div class="row"><button class="btn" id="concedeWithdraw">${T('Withdraw')}</button></div>`, false, 'concede');
      $('concedeWithdraw').onclick = () => socket.emit('concede', { action: 'withdraw' });
    } else {
      openModal(`<h2>${T('Concede the hand?')}</h2>
        <p>${T('<b>{0}</b> wants {1} to give up this hand and pay {2} to {3}.', esc(nameOf(cc.by)), teamName(team), concedeStake(g, team), teamName(1 - team))}</p>
        <div class="row"><button class="btn warn" id="concedeAgree">${T('Agree')}</button><button class="btn" id="concedeDecline">${T('Play on')}</button></div>`, false, 'concede');
      $('concedeAgree').onclick = () => socket.emit('concede', { action: 'agree' });
      $('concedeDecline').onclick = () => socket.emit('concede', { action: 'decline' });
    }
  }
  $('resetChipsBtn').onclick = () => openModal(`<h2>${T('Reset chips?')}</h2><p>${T('Both teams go back to 12 chips. The current hand continues.')}</p>
    <div class="row"><button class="btn primary" data-reset>${T('Reset')}</button><button class="btn" data-close>${T('Cancel')}</button></div>`, true);

  let lastHighKey = '';
  function renderCenter(g) {
    const c = $('center');
    const mi = $('matInfo');
    if (g && g.phase === 'playing' && g.contract) {
      const lead = g.trick.cards.length ? g.trick.cards[0].card.suit : null;
      mi.innerHTML = `<span>${g.contract.suit === 'NT' ? T('No trump') : T('Trump {0}', colourSuits(SYM[g.contract.suit]))}</span>${lead ? `<span>${T('Lead {0}', colourSuits(SYM[lead]))}</span>` : ''}`;
    } else mi.innerHTML = '';
    if (!g) {
      const humans = room.seats.filter((s) => s.kind === 'human').length;
      c.innerHTML = `<div class="big">${T('Table {0}', esc(room.code))}</div>
        <div class="sub">${T(room.fixed ? '{0} of {1} seated; empty seats become bots when the host deals.' : '{0} of {1} seated. Send the code to friends; empty seats become bots when the host deals.', humans, N())}</div>
        ${botStyleHtml()}
        ${room.isHost ? `<button class="btn primary" id="startBtn">${T('Deal the first hand')}</button>` : `<div class="sub">${T('Waiting for the host to deal.')}</div>`}`;
      const sb = $('startBtn');
      if (sb) sb.onclick = () => socket.emit('start');
      wireBotStyle();
      return;
    }
    if (g.phase === 'bidding') {
      // The mat holds only the standing bid; each player's own call sits beside their seat.
      const h = g.bidding.high;
      const waiting = g.turn === room.mySeat ? T('Your call') : T('{0} to call', `<span class="who t${g.turn % 2}">${esc(nameOf(g.turn))}</span>`);
      const dbl = g.bidding.doubled ? `<span class="dbl">${g.bidding.doubled === 2 ? T('Redoubled') : T('Doubled')}</span>` : '';
      const hk = h ? `${g.handNo}:${h.seat}:${h.value}:${h.suit}` : '';
      const pulse = h && hk !== lastHighKey ? ' pulse' : '';
      lastHighKey = hk;
      c.innerHTML = h
        ? `<div class="bidval${pulse}">${colourSuits(suitBtnText(h.value, h.suit, h.hasJack))}</div>
           <div class="sub"><span class="who t${h.seat % 2}">${esc(nameOf(h.seat))}</span> ${dbl}</div>
           <div class="sub wait">${waiting}</div>`
        : `<div class="sub">${T('Hand {0}', g.handNo)}</div><div class="sub wait">${waiting}</div>`;
      return;
    }
    if (g.phase === 'selfraise') {
      const h = g.bidding.high;
      const who = `<span class="who t${g.turn % 2}">${esc(nameOf(g.turn))}</span>`;
      const line = g.turn === room.mySeat
        ? (g.bidding.doubled ? T('You won the bid (doubled) — keep it, raise, or change suit') : T('You won the bid — keep it or raise to a higher tier'))
        : (g.bidding.doubled ? T('{0} won the bid (doubled) — deciding whether to keep, raise or change suit', who) : T('{0} won the bid — deciding whether to raise', who));
      c.innerHTML = `<div class="bidval">${colourSuits(suitBtnText(h.value, h.suit, h.hasJack))}</div>
        <div class="sub wait">${line}</div>`;
      return;
    }
    if (g.phase === 'playing') {
      c.innerHTML = g.trick.cards.length ? '' : `<div class="sub">${g.turn === room.mySeat ? T('Trick {0} of {1} · your lead', g.trickNo + 1, g.handSize || 8) : T('Trick {0} of {1} · {2} leads', g.trickNo + 1, g.handSize || 8, esc(nameOf(g.turn)))}</div>`;
      return;
    }
    if (g.phase === 'matchover') {
      c.innerHTML = `<div class="big">${T('{0} wins', teamName(g.winner))}</div>
        ${botStyleHtml()}
        ${room.isHost ? `<button class="btn primary" id="againBtn">${T('Start a new match')}</button>` : `<div class="sub">${T('The host can start a new match.')}</div>`}`;
      const ab = $('againBtn');
      if (ab) ab.onclick = () => socket.emit('start');
      wireBotStyle();
      return;
    }
    if (g.phase === 'handover') {
      const r = g.result;
      const rb = bidText(r.contract.value, r.contract.suit, r.contract.hasJack);
      c.innerHTML = `<div class="big">${r.void ? T('Hand void: {0} holds no {1}', teamName(r.voidTeam), SUIT_NAME[r.contract.suit]) : r.conceded != null ? T('{0} conceded {1}', teamName(r.conceded), rb) : T(r.made ? '{0} made {1}' : '{0} went down on {1}', teamName(r.contract.team), rb)}</div>
        <div class="sub">${T('Use "Last trick", "Show the hands" and the log on the right to review the hand.')}</div>
        <button class="btn" id="handsBtn2">${T('Show the initial hands')}</button>
        ${room.isHost ? `<button class="btn primary" id="nextBtn">${T('Next hand')}</button>` : `<div class="sub">${T('The host deals the next hand.')}</div>`}`;
      const nb = $('nextBtn');
      if (nb) nb.onclick = () => socket.emit('nextHand');
      $('handsBtn2').onclick = showDealtHands;
      return;
    }
    c.innerHTML = '';
  }

  // When a trick completes: hold a moment with the winning card highlighted, then sweep every card
  // to the winner's seat. sweepKey remembers which trick is already mid-sweep so re-renders
  // (chat, reconnects) do not restart the animation.
  let sweepKey = null, sweepTimer = null;
  function renderTrick(g) {
    const t = $('trick');
    if (!g || g.phase !== 'playing') { t.innerHTML = ''; sweepKey = null; return; }
    const key = g.trick.complete ? `${g.handNo}:${g.trickNo}` : null;
    const swept = key && key === sweepKey;
    const [wx, wy] = key ? seatPos()[rel(g.trick.winner)] : [0, 0];
    t.innerHTML = g.trick.cards.map((x) => {
      const [px, py] = swept ? [wx, wy] : trickPos()[rel(x.seat)];
      const win = g.trick.complete && g.trick.winner === x.seat ? 'win' : '';
      return cardHTML(x.card, `${win} ${swept ? 'swept' : ''}`).replace('class="card', `style="left:${px}%;top:${py}%;--tilt:${(rel(x.seat) - 2.5) * 4}deg" class="card`);
    }).join('');
    if (key && !swept) {
      clearTimeout(sweepTimer);
      // stage 1: the cards gather into one stack in the middle; stage 2: the stack slides to the winner
      sweepTimer = setTimeout(() => {
        sweepKey = key;
        t.querySelectorAll('.card').forEach((el) => { el.classList.add('gather'); el.style.left = '50%'; el.style.top = '50%'; });
        sweepTimer = setTimeout(() => {
          t.querySelectorAll('.card').forEach((el) => { el.classList.add('swept'); el.style.left = `${wx}%`; el.style.top = `${wy}%`; });
          $('seats').querySelectorAll('.seat.won').forEach((el) => el.classList.add('collect'));
        }, 500);
      }, 550);
    }
  }

  function renderHand(g) {
    const h = $('hand');
    if (!g || room.mySeat === null) { h.innerHTML = ''; return; }
    const legal = new Set(g.legal ? g.legal.cards : []);
    const active = g.phase === 'playing' && g.turn === room.mySeat;
    h.classList.toggle('active', active);
    let prev = null;
    h.innerHTML = g.hand.map((c) => {
      const cls = [legal.has(c.id) ? 'legal' : '', prev && prev !== c.suit ? 'gap' : ''].join(' ');
      prev = c.suit;
      const html = cardHTML(c, cls);
      return active && legal.has(c.id)
        ? html.replace('<div', `<button data-card="${c.id}"`).replace(/<\/div>$/, '</button>')
        : html;
    }).join('');
    h.querySelectorAll('[data-card]').forEach((b) => (b.onclick = () => socket.emit('play', { cardId: b.dataset.card })));
  }

  function renderBidPanel() {
    const g = room && room.game;
    const p = $('bidPanel');
    const mine = g && g.phase === 'bidding' && g.turn === room.mySeat && g.legal;
    p.classList.toggle('hidden', !mine);
    if (!mine) return;
    const L = g.legal.bid;
    const key = `${g.handNo}:${g.bidding.actions.length}`;
    // doubled bidder on their own turn: other suits open at one more (L.changeSuits / L.changeMin)
    const chg = L.changeSuits || [];
    const lo = chg.length ? Math.min(L.minBid ?? 56, L.changeMin) : L.minBid;
    if (key !== bidKey) { bidKey = key; bidVal = lo ?? 56; }
    const canBid = lo !== null;
    if (canBid) bidVal = Math.min(56, Math.max(bidVal, lo));
    const high = g.bidding.high;
    $('bidPrompt').textContent = high ? T('Current bid {0} by {1}', high.ns ? T('{0} NS (no {1})', high.value, SYM[high.ns]) : bidText(high.value, high.suit, high.hasJack), nameOf(high.seat)) : T('You open the bidding');
    $('bidValue').textContent = canBid ? bidVal : '—';
    $('bidMinus').disabled = !canBid || bidVal <= lo;
    $('bidPlus').disabled = !canBid || bidVal >= 56;
    $('levelJumps').innerHTML = canBid ? [40, 48, 56].filter((v) => v >= lo && v !== bidVal)
      .map((v) => `<button class="btn small" data-level="${v}">${v}</button>`).join('') : '';
    $('levelJumps').querySelectorAll('[data-level]').forEach((b) => (b.onclick = () => { bidVal = Number(b.dataset.level); renderBidPanel(); }));
    $('suitBtns').innerHTML = ['S', 'H', 'D', 'C', 'NT'].map((s) => {
      const held = L.suits.includes(s) || chg.includes(s);
      const ok = (L.minBid !== null && L.suits.includes(s) && bidVal >= L.minBid) || (chg.includes(s) && bidVal >= L.changeMin);
      // the power cards you hold in the suit, so the call's meaning is visible as you make it
      const power = g.hand.filter((c) => c.suit === s && (c.rank === 'J' || c.rank === '9')).map((c) => c.rank).sort().reverse();
      const hasJ = power.includes('J');
      return `<button class="btn ${sc(s)}" data-suit="${s}" ${ok ? '' : 'disabled'}
        title="${ok ? `${T('Bid {0} {1}', bidVal, SUIT_NAME[s])}${hasJ ? '' : s === 'NT' ? '' : T(' (suit first: you hold no Jack of it)')}` : held ? (L.minBid !== null ? T('Your own suit needs {0} or more', L.minBid) : T('You already raised this suit')) : T('You hold no {0}', SUIT_NAME[s])}">${suitBtnText(bidVal, s, hasJ)}${power.length ? `<span class="tag">${power.join(' ')}</span>` : ''}</button>`;
    }).join('');
    $('suitBtns').querySelectorAll('[data-suit]').forEach((b) => (b.onclick = () => socket.emit('bid', { type: 'bid', value: bidVal, suit: b.dataset.suit })));
    const pm = L.plusMeaning || {};
    // Build the whole Plus row first, then wire it: appending with innerHTML += would rebuild the
    // partner Plus buttons and drop their click handlers.
    // "I hold J and 9 of Hearts (and nothing else in it)": what the Plus call tells the table
    const holdText = (cards, suitWord, n) => T('I hold {0} of {1}', cards.join(T(' and ')), suitWord) + (n === 1 && cards[0] === 'J' ? T(' and nothing else in it') : '');
    let plusHtml = (L.plus || []).map((n) => `<button class="btn small" data-plus="${n}"
      title="${L.plusSuit ? T('Bid {0} {1}: ', (g.bidding.high ? g.bidding.high.value : 28) + n, SUIT_NAME[L.plusSuit]) : ''}${holdText(pm[n] || [], L.plusSuit ? SUIT_NAME[L.plusSuit] : T('this suit'), n)}">${T('Plus {0}', n)}${L.plusSuit ? ` <span class="${sc(L.plusSuit)}">${SYM[L.plusSuit]}</span>` : ''} · ${(pm[n] || []).join('+')}</button>`).join('');
    if (L.plusOpen && L.plusOpen.length) {
      const base = g.bidding.high ? g.bidding.high.value : 27;   // opening Plus N = 27 + N
      plusHtml += L.plusOpen.map((o) => { const cards = o.cards || []; return `<button class="btn small ${sc(o.suit)}" data-popen="${o.n}" data-suit="${o.suit}"
        title="${T(g.bidding.high ? 'Bid {0} {1}: ' : 'Open {0} {1}: ', base + o.n, SUIT_NAME[o.suit])}${holdText(cards, SUIT_NAME[o.suit], o.n)}">${T('Plus {0}', o.n)} ${SYM[o.suit]} · ${cards.join('+')}</button>`; }).join('');
    }
    $('plusBtns').innerHTML = plusHtml;
    $('plusBtns').querySelectorAll('[data-plus]').forEach((b) => (b.onclick = () => socket.emit('bid', { type: 'plus', n: Number(b.dataset.plus) })));
    $('plusBtns').querySelectorAll('[data-popen]').forEach((b) => (b.onclick = () => socket.emit('bid', { type: 'plus', n: Number(b.dataset.popen), suit: b.dataset.suit })));
    $('nsBtns').innerHTML = (L.ns || []).map((o) => `<button class="btn small ${sc(o.suit)}" data-ns="${o.value}"
      title="${T('No trump; tells the table you hold no {0}', SUIT_NAME[o.suit])}">${T('{0} NS · no {1}', o.value, SYM[o.suit])}</button>`).join('');
    $('nsBtns').querySelectorAll('[data-ns]').forEach((b) => (b.onclick = () => socket.emit('bid', { type: 'ns', value: Number(b.dataset.ns) })));
    $('passBtn').disabled = !L.pass;
    $('passBtn').title = L.pass ? '' : T('The first bidder must open with 28 or more');
    $('doubleBtn').classList.toggle('hidden', !L.double);
    $('redoubleBtn').classList.toggle('hidden', !L.redouble);
  }

  // The declarer's one-time self-raise window: keep the won bid, or convert it to a higher tier (40/48/56).
  function renderSelfRaise() {
    const g = room && room.game;
    const p = $('selfRaisePanel');
    const mine = g && g.phase === 'selfraise' && g.turn === room.mySeat && g.legal && g.legal.bid.keep;
    p.classList.toggle('hidden', !mine);
    if (!mine) return;
    const high = g.bidding.high, L = g.legal.bid;
    const doubled = g.bidding.doubled === 1;
    const mine2 = colourSuits(esc(bidText(high.value, high.suit, high.hasJack)));
    $('selfRaisePrompt').innerHTML = doubled
      ? `${T('Your {0} was doubled and everyone passed — keep it (chips ×2), redouble (×4)', mine2)}${(L.raiseLevels || []).length ? T(', raise it') : ''}${(L.changeSuits || []).length ? T(', or change to another suit (the double is cancelled and bidding reopens)') : ''}.`
      : T('You won the bid at {0} — keep it, or convert to a higher tier.', mine2);
    const canChange = (L.changeSuits || []).length > 0;
    $('changeRow').classList.toggle('hidden', !canChange);
    if (canChange) {
      const key = `${g.handNo}:${g.bidding.actions.length}`;
      if (key !== chgKey) { chgKey = key; chgVal = L.changeMin; }
      chgVal = Math.min(56, Math.max(chgVal, L.changeMin));
      $('chgValue').textContent = chgVal;
      $('chgMinus').disabled = chgVal <= L.changeMin;
      $('chgPlus').disabled = chgVal >= 56;
      $('chgMinus').onclick = () => { chgVal -= 1; renderSelfRaise(); };
      $('chgPlus').onclick = () => { chgVal += 1; renderSelfRaise(); };
      $('chgSuits').innerHTML = L.changeSuits.map((s) => {
        const hasJ = s === 'NT' || g.hand.some((c) => c.suit === s && c.rank === 'J');
        return `<button class="btn ${sc(s)}" data-chg="${s}" title="${T('Change to {0} {1}', chgVal, SUIT_NAME[s])}">${suitBtnText(chgVal, s, hasJ)}</button>`;
      }).join('');
      $('chgSuits').querySelectorAll('[data-chg]').forEach((b) => (b.onclick = () => socket.emit('bid', { type: 'change', value: chgVal, suit: b.dataset.chg })));
    }
    $('raiseBtns').innerHTML = (L.raiseLevels || []).map((v) =>
      `<button class="btn" data-raise="${v}" title="${T('Raise your contract to {0} {1}: bigger stake, more points needed', v, high.suit === 'NT' ? 'NT' : SUIT_NAME[high.suit])}">${colourSuits(esc(bidText(v, high.suit, high.hasJack)))}</button>`).join('');
    $('raiseBtns').querySelectorAll('[data-raise]').forEach((b) => (b.onclick = () => socket.emit('bid', { type: 'raise', value: Number(b.dataset.raise) })));
    $('keepBtn').onclick = () => socket.emit('bid', { type: 'keep' });
    $('srRedoubleBtn').classList.toggle('hidden', !L.redouble);
    $('srRedoubleBtn').onclick = () => socket.emit('bid', { type: 'redouble' });
  }

  function renderRail(g) {
    // Calls are remembered, not read back: during the auction the rail keeps only the latest round
    // (one call per seat); once play starts the calls are gone.
    const lines = g ? g.log : [];
    let calls = 0;
    const kept = [];
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].startsWith('Call:') && (g.phase !== 'bidding' || ++calls > N())) continue;
      kept.unshift(lines[i]);
    }
    $('log').innerHTML = kept.map((raw) => {
      const l = raw.replace(/seat (\d)/gi, (_, n) => nameOf(Number(n) - 1)).replace(/Team A/g, rawTeam(0)).replace(/Team B/g, rawTeam(1));
      let m;
      // the engine writes the log in English; lang.js turns each known line into the player's language
      const tr = Lang.fromServer;
      if ((m = /^Call: (.+?) — (.+)$/.exec(l))) return `<li class="call"><b>${esc(m[1])}</b> ${colourSuits(esc(tr(m[2])))}</li>`;
      if ((m = /^Trick (\d+): (.+?) takes (.+)$/.exec(l))) return `<li class="trick-line"><span class="n">${m[1]}</span><b>${esc(m[2])}</b> ${esc(tr(m[3]))}</li>`;
      if (/^(Hand \d|Contract)/.test(l)) return `<li class="head">${colourSuits(esc(tr(l)))}</li>`;
      return `<li>${colourSuits(esc(tr(l)))}</li>`;
    }).join('');
    $('log').scrollTop = 1e6;
    $('chat').innerHTML = room.chat.map((m) => m.from === null
      ? `<li class="sys">${esc(Lang.fromServer(m.text))}</li>`
      : `<li><b>${esc(m.from)}</b> ${esc(m.text)}</li>`).join('');
    $('chat').scrollTop = 1e6;
  }

  function renderPhaseModal(g) {
    const key = g ? `${g.handNo}:${g.phase}` : 'none';
    if (key === lastPhaseKey) return;
    lastPhaseKey = key;
    if (!g || (g.phase !== 'handover' && g.phase !== 'matchover')) {
      if ($('modal').dataset.kind === 'phase') closeModal();
      return;
    }
    const r = g.result, c = r.contract;
    if (r.void) {
      openModal(`<h2>${T('Hand void')}</h2>
        <p>${T('{0} bid {1}, but {2} holds no {3}. No chips change; the deal passes to the next player.', esc(nameOf(c.seat)), bidText(c.value, c.suit, c.hasJack), teamName(r.voidTeam), SUIT_NAME[c.suit])}</p>
        ${room.isHost ? '' : `<p class="sub">${T('The host deals the next hand.')}</p>`}
        <div class="row">
          <button class="btn" data-hands>${T('Show the initial hands')}</button>
          ${room.isHost ? `<button class="btn primary" data-next>${T('Next hand')}</button>` : ''}
          <button class="btn" data-close>${T('Close')}</button>
        </div>`, true, 'phase');
      return;
    }
    const bt = teamName(c.team);
    const conceded = r.conceded != null;
    const chips = chipsText(r.amount);
    const verdict = conceded ? T('{0} conceded', teamName(r.conceded)) : T(r.made ? '{0} made it' : '{0} went down', bt);
    const flow = r.made ? T('{0} pays {1} to {2}.', teamName(r.payer), chips, bt) : T('{0} pays {1} to {2}.', bt, chips, teamName(r.receiver));
    const over = g.phase === 'matchover';
    const show = () => openModal(`
      <h2>${verdict}</h2>
      <p>${T('{0} bid {1}{2}. ', esc(nameOf(c.seat)), bidText(c.value, c.suit, c.hasJack), c.mult > 1 ? ` ×${c.mult}` : '')}${flow}</p>
      ${!conceded && g.trickNo < (g.handSize || 8) ? `<p class="sub">${T(r.made ? 'Stopped after trick {0}: target reached.' : 'Stopped after trick {0}: target out of reach.', g.trickNo)}</p>` : ''}
      <div class="tally">
        <span>${T('{0} points', teamName(0))}</span><span class="v">${r.points[0]}</span>
        <span>${T('{0} points', teamName(1))}</span><span class="v">${r.points[1]}</span>
        <span>${T('{0} chips', teamName(0))}</span><span class="v">${g.tables[0]}</span>
        <span>${T('{0} chips', teamName(1))}</span><span class="v">${g.tables[1]}</span>
      </div>
      ${over ? `<p><b>${T('{0} wins the match.', teamName(g.winner))}</b></p>
        <p class="kun-line"><span class="kunukku big">${KUNUKKU}</span><span><b>${T('{0} wears the kunukku.', teamName(1 - g.winner))}</b><span class="how"><br>${T('Bid and win the first hand of the next match and the whole team takes it off. After that, each player sheds their own by bidding and making a contract.')}</span></span></p>` : room.isHost ? '' : `<p class="sub">${T('The host deals the next hand.')}</p>`}
      <div class="row">
        ${over && room.isHost ? `<button class="btn primary" data-start>${T('Start a new match')}</button>` : ''}
        <button class="btn" data-hands>${T('Show the initial hands')}</button>
        ${!over && room.isHost ? `<button class="btn primary" data-next>${T('Next hand')}</button>` : ''}
        <button class="btn" data-close>${T('Close')}</button>
      </div>`, true, 'phase');
    smashQueued = true;
    // first the surprise when the losers took no point at all, then the chips change hands, then the trophy
    const swept = !conceded && r.points[r.payer] === 0 && r.points[r.receiver] > 0;
    const pay = (next) => chipsFly(r.payer, r.receiver, r.amount, g.tables, next);
    const first = (next) => (swept ? sweep(r.receiver, r.payer, `${r.points[r.receiver]} – 0`, c.value === 56 && r.made, () => pay(next)) : pay(next));
    if (over) { $('seats').classList.add('kun-pending'); first(() => celebrate(g.winner, true, T('wins the match'), () => kunukkuSmash(() => kunukkuKayaral(1 - g.winner, show)))); }
    else first(() => celebrate(r.receiver, false, conceded ? T('takes {0} as {1} concedes', chips, teamName(r.conceded)) : r.made ? T('made {0} and takes {1}', esc(bidText(c.value, c.suit, c.hasJack)), chips) : T('set {0} and takes {1}', teamName(c.team), chips), () => kunukkuSmash(show)));
  }
})();
