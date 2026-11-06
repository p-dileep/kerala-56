/* 56 — browser client. All rules are enforced on the server; this only renders and sends intents. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const SYM = { S: '♠', H: '♥', D: '♦', C: '♣', NT: 'NT' };
  const SUIT_NAME = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs', NT: 'No trump' };
  const RED = new Set(['H', 'D']);
  const POINTS = { J: 3, 9: 2, A: 1, 10: 1, K: 0, Q: 0, 8: 0, 7: 0 };
  const TEAM_DEFAULT = ['Team A', 'Team B'];
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
  let lastPhaseKey = '';
  const socket = io({ transports: ['websocket', 'polling'] });

  // ------------------------------------------------------------ connection
  socket.on('connect', () => socket.emit('hello', { token: store.get('g56token', '') }));
  socket.on('token', (t) => {
    store.set('g56token', t);
    const code = new URLSearchParams(location.search).get('room');
    if (code) socket.emit('joinRoom', { code, name: myName() });
  });
  socket.on('errorMsg', toast);
  socket.on('room', (r) => {
    room = r;
    if (location.search !== `?room=${r.code}`) history.replaceState(null, '', `?room=${r.code}`);
    show('table');
    render();
  });
  socket.on('disconnect', () => toast('Connection lost. Reconnecting…'));

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
      <p class="sub">Which team do you want to sit on? If it is full you get a seat on the other team.</p>
      <div class="row team-pick">${opt('0', 'Team A')}${opt('1', 'Team B')}${opt('', 'Any team')}</div>
      <div class="row"><button class="btn ghost" data-close>Cancel</button></div>`, true);
    $('modalBody').querySelectorAll('[data-team]').forEach((b) => (b.onclick = () => {
      store.set('g56team', b.dataset.team);
      closeModal();
      send(b.dataset.team === '' ? null : Number(b.dataset.team));
    }));
  };
  const initialCode = new URLSearchParams(location.search).get('room');
  if (initialCode) $('codeInput').value = initialCode.toUpperCase();

  const needName = () => { if (myName()) return true; toast('Please type your name first.'); $('nameInput').focus(); return false; };
  $('createBtn').onclick = () => {
    if (!needName()) return;
    const players = Number($('newPlayers').value);
    pickTeam(`New ${players}-player table`, (team) => socket.emit('createRoom', { name: myName(), players, team }));
  };
  document.querySelectorAll('[data-fixed]').forEach((b) => (b.onclick = () => {
    if (needName()) pickTeam(`${b.dataset.fixed === 'TABLE8' ? '8' : '6'}-player table`, (team) => socket.emit('joinRoom', { code: b.dataset.fixed, name: myName(), team }));
  }));
  socket.on('lobby', (tables) => tables.forEach((t) => {
    const el = $(t.players === 8 ? 'info8' : 'info6'); if (!el) return;
    if (t.seated) el.innerHTML = `<span class="live">LIVE</span> ${t.seated} seated${t.watching ? `, ${t.watching} watching` : ''}${t.playing ? ', playing' : ''}`;
    else el.innerHTML = t.hasGame ? 'empty, old game waiting' : 'empty';
    const rb = document.querySelector(`[data-reset-table="${t.code}"]`);
    if (rb) { rb.classList.toggle('hidden', !(t.hasGame && !t.seated)); rb.onclick = () => socket.emit('resetTable', { code: t.code }); }
  }));
  $('joinBtn').onclick = () => {
    const code = $('codeInput').value.trim().toUpperCase();
    if (code.length < 5) return toast('Enter the table code.');
    if (needName()) pickTeam(`Table ${code}`, (team) => socket.emit('joinRoom', { code, name: myName(), team }));
  };
  $('codeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('joinBtn').click(); });

  function show(which) {
    $('lobby').classList.toggle('hidden', which !== 'lobby');
    $('table').classList.toggle('hidden', which !== 'table');
  }

  // ------------------------------------------------------------ table chrome
  $('codeChip').onclick = async () => {
    const url = `${location.origin}/?room=${room.code}`;
    try { await navigator.clipboard.writeText(url); toast('Invite link copied'); }
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
  const syncFs = () => { $('fullBtn').textContent = fsOn() ? '✕' : '⛶'; $('fullBtn').title = fsOn() ? 'Exit full screen' : 'Full screen'; $('fullBtn').setAttribute('aria-label', $('fullBtn').title); };
  document.addEventListener('fullscreenchange', syncFs);
  document.addEventListener('webkitfullscreenchange', syncFs);
  $('fullBtn').onclick = async () => {
    try {
      if (fsOn()) await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else await (fsEl.requestFullscreen || fsEl.webkitRequestFullscreen).call(fsEl, { navigationUI: 'hide' });
    } catch { toast('Full screen is not available in this browser.'); }
  };
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
    if (!g || !g.lastTrick) return toast('No trick has been completed yet.');
    openModal(`
      <h2>Last trick</h2>
      <p>${esc(nameOf(g.lastTrick.winner))} won it for ${teamName(g.lastTrick.winner % 2)} (${g.lastTrick.points} pts).</p>
      <div class="mini-trick">${g.lastTrick.cards.map((x) => `
        <figure class="${x.seat === g.lastTrick.winner ? 'win' : ''}">${cardHTML(x.card)}<figcaption>${esc(nameOf(x.seat))}</figcaption></figure>`).join('')}
      </div>
      <div class="row"><button class="btn primary" data-close>Close</button></div>`, true);
  };

  $('teamNamesBtn').onclick = () => {
    if (room.mySeat === null && !room.isHost) return toast('Sit down first to rename the teams.');
    openModal(`<h2>Team names</h2>
      <p class="sub">Shown to everyone at this table.</p>
      <div class="team-edit">
        ${[0, 1].map((t) => `<label class="field t${t}"><span>${esc(TEAM_DEFAULT[t])}</span><input id="teamName${t}" maxlength="14" value="${teamName(t)}" placeholder="${esc(TEAM_DEFAULT[t])}"></label>`).join('')}
      </div>
      <div class="row"><button class="btn primary" id="teamNamesSave">Save</button><button class="btn" data-close>Cancel</button></div>`, true);
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
  // matchWin: the big six-second "Champions" version; otherwise a shorter one for the hand's winner.
  function celebrate(team, matchWin, sub, after) {
    const old = $('cheer'); if (old) old.remove();
    const el = document.createElement('div');
    el.id = 'cheer'; el.className = `cheer t${team}${matchWin ? ' match' : ''}`;
    const bits = Array.from({ length: matchWin ? 70 : 36 }, (_, i) => `<i style="--x:${Math.random() * 100}%;--d:${(Math.random() * 1.6).toFixed(2)}s;--t:${(2.6 + Math.random() * 2).toFixed(2)}s;--r:${Math.round(Math.random() * 720 - 360)}deg;--s:${(.6 + Math.random() * .9).toFixed(2)}" class="c${i % 5}"></i>`).join('');
    el.innerHTML = `<div class="confetti">${bits}</div>
      <div class="cheer-card"><div class="rays"></div><div class="trophy">${TROPHY}</div>
        <div class="kicker">${matchWin ? 'Champions' : 'Hand won'}</div><div class="team">${teamName(team)}</div><div class="sub">${sub}</div>
        <div class="tap">tap to continue</div></div>`;
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
  function nameOf(seat) { return room.seats[seat]?.name || `Seat ${seat + 1}`; }
  const rawTeam = (t) => (room && room.teamNames && room.teamNames[t]) || TEAM_DEFAULT[t];
  function teamName(t) { return esc(rawTeam(t)); }   // always used inside HTML
  const N = () => (room && room.players) || 6;
  function rel(seat) { return room.mySeat === null ? seat : (seat - room.mySeat + N()) % N(); }
  const seatPos = () => N() === 8 ? (narrow() ? SEAT_POS8_NARROW : SEAT_POS8) : (narrow() ? SEAT_POS_NARROW : SEAT_POS);
  const trickPos = () => (N() === 8 ? TRICK_POS8 : TRICK_POS);
  // hasJack=false renders suit-first ("Hearts 30"): the caller lacks the Jack of that suit.
  // Bid buttons and seat bubbles: the suit name sits next to its sign, keeping the Jack order ("31 Spade ♠" / "Spade ♠ 31"). Returns HTML.
  const SUIT_ONE = { S: 'Spade', H: 'Heart', D: 'Diamond', C: 'Club' };
  function suitBtnText(v, s, hasJack) {
    if (s === 'NT') return `${v} NT`;
    const named = `<span class="sname">${SUIT_ONE[s]}</span> ${SYM[s]}`;
    return hasJack ? `${v} ${named}` : `${named} ${v}`;
  }
  function bidText(v, s, hasJack = true) { return s === 'NT' ? `${v} NT` : hasJack ? `${v} ${SYM[s]}` : `${SYM[s]} ${v}`; }
  // wrap suit symbols so hearts/diamonds show red and all suits a little larger
  function colourSuits(html) { return html.replace(/[♠♣]/g, '<span class="suit black">$&</span>').replace(/[♥♦]/g, '<span class="suit red">$&</span>'); }
  function actionText(a) {
    if (a.type === 'bid') return bidText(a.value, a.suit, a.hasJack);
    if (a.type === 'plus') return `Plus ${a.n} (${bidText(a.value, a.suit, a.hasJack)})`;
    if (a.type === 'ns') return `${a.value} NS (no ${SYM[a.ns]})`;
    return { pass: 'Pass', double: 'Double', redouble: 'Redouble' }[a.type];
  }
  // A seat's call bubble, as HTML with suit names (actionText stays plain for the history and chat).
  function actionNamed(a) {
    if (a.type === 'bid') return suitBtnText(a.value, a.suit, a.hasJack);
    if (a.type === 'plus') return `Plus ${a.n} (${suitBtnText(a.value, a.suit, a.hasJack)})`;
    if (a.type === 'ns') return `${a.value} NS (no <span class="sname">${SUIT_ONE[a.ns]}</span> ${SYM[a.ns]})`;
    return actionText(a);
  }
  function cardHTML(c, extra = '') {
    return `<div class="card ${RED.has(c.suit) ? 'red' : ''} ${extra}" aria-label="${c.rank} of ${SUIT_NAME[c.suit]}">
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
    $('resetChipsBtn').classList.toggle('hidden', !(g && room.isHost));
    $('roomCode').textContent = room.fixed ? `${room.players}-player table` : room.code;
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
    const myTurn = g && g.turn !== null && g.turn === room.mySeat;
    document.title = myTurn ? '● Your turn · 56' : '56 · Kerala card table';
  }

  function renderWatchers() {
    const w = room.watchers || [];
    const el = $('watchChip');
    el.classList.toggle('hidden', !w.length);
    if (!w.length) return;
    el.innerHTML = `<span class="eye">👁</span> ${w.length} watching`;
    el.title = `Watching: ${w.join(', ')}`;
    el.onclick = () => toast(`Watching: ${w.join(', ')}`);
  }

  function renderScores(g) {
    for (const t of [0, 1]) {
      $(`tname${t}`).textContent = rawTeam(t);
      $(`tables${t}`).textContent = g ? `${g.tables[t]} chips` : '12 chips';
      $(`hpts${t}`).textContent = g && g.contract ? `${g.points[t]} pts` : '';
    }
    const c = g && g.contract;
    $('contractChip').classList.toggle('hidden', !c);
    if (c) {
      const [win, lose] = c.value >= 56 ? [4, 5] : c.value >= 48 ? [3, 4] : c.value >= 40 ? [2, 3] : [1, 2];
      $('contractChip').innerHTML = `<b>${esc(nameOf(c.seat))}</b> needs ${colourSuits(esc(bidText(c.value, c.suit, c.hasJack)))}${c.mult > 1 ? ` ×${c.mult}` : ''} for ${teamName(c.team)}
        <span class="stake">wins ${win * c.mult}, loses ${lose * c.mult} chips</span>`;
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
      if (tookTrick) said = `<div class="said won">takes ${g.trick.points ? `${g.trick.points} pts` : 'the trick'}</div>`;
      else if (a) {
        const k = [];
        if (a.type === 'pass') k.push('quiet');
        if (a.type === 'double' || a.type === 'redouble') k.push('dbl');
        if (a.suit && a.suit !== 'NT' && RED.has(a.suit)) k.push('red');
        if (g.bidding.high && g.bidding.high.seat === s.seat && a.type !== 'pass') k.push('high');
        said = `<div class="said ${k.join(' ')}">${actionNamed(a)}</div>`;
      }
      else if (g && g.contract && g.contract.seat === s.seat && g.phase === 'playing')
        said = `<div class="said ${RED.has(g.contract.suit) ? 'red' : ''}">${suitBtnText(g.contract.value, g.contract.suit, g.contract.hasJack)}</div>`;

      let body;
      if (s.kind === 'empty') {
        body = `<div class="nm">Open seat</div><div class="meta">${teamName(s.team)}</div>
          <div class="seat-actions">
            <button class="btn small" data-sit="${s.seat}">Sit here</button>
            ${host ? `<button class="btn small ghost" data-bot="${s.seat}">Add bot</button>` : ''}
          </div>`;
      } else {
        const meta = [];
        if (s.kind === 'bot') meta.push('bot');
        if (s.kind === 'human' && !s.connected) meta.push('away');
        const toks = [];
        if (g && g.dealer === s.seat) toks.push('<span class="tok" title="Dealt this hand">deals</span>');
        if (g && g.phase !== 'handover' && g.phase !== 'matchover' && (g.dealer + 1) % N() === s.seat) toks.push('<span class="tok" title="Opens the bidding and leads the first trick">opens</span>');
        let actions = '';
        const seated = room.mySeat !== null;
        if (s.kind === 'bot' && !isMe)
          actions += `<button class="btn small" data-sit="${s.seat}" title="${seated && g ? 'Move here; a bot takes your current seat' : 'Play this seat'}">${seated && g ? 'Move here' : 'Take seat'}</button>`;
        if (host && !g && s.kind === 'bot') actions += `<button class="btn small ghost" data-unbot="${s.seat}">Remove</button>`;
        // any seated player (or the host) may remove / replace another player
        if (s.kind === 'human' && !isMe && (host || seated))
          actions += `<button class="btn small ghost" data-kick="${s.seat}">${g ? 'Replace with bot' : 'Remove'}</button>`;
        body = `${g ? `<span class="cnt" title="Cards in hand">${g.handCounts[s.seat]}</span>` : ''}${toks.length ? `<div class="toks">${toks.join('')}</div>` : ''}
          <div class="nm">${esc(s.name)}</div>${meta.length ? `<div class="meta">${meta.join(' ')}</div>` : ''}
          ${actions ? `<div class="seat-actions">${actions}</div>` : ''}`;
      }
      return `<div class="${cls.join(' ')}" data-seat="${s.seat}" style="left:${x}%;top:${y}%" title="${teamName(s.team)}">${said}${body}</div>`;
    }).join('');
    $('seats').querySelectorAll('[data-sit]').forEach((b) => (b.onclick = () => socket.emit('sit', { seat: b.dataset.sit, name: myName() })));
    $('seats').querySelectorAll('[data-bot]').forEach((b) => (b.onclick = () => socket.emit('setBot', { seat: b.dataset.bot, on: true })));
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

  const STYLE_TEXT = { mixed: 'Mixed: each bot keeps its own temperament (hover a bot for it)', defensive: 'Defensive: bid low, rarely raise or go for levels', medium: 'Medium: balanced (default)', aggressive: 'Aggressive: bid up, support partner, go for 40 / 48 / 56' };
  function botStyleHtml() {
    if (!room.isHost) return `<div class="sub">Bots: ${esc(room.botStyle || 'mixed')}</div>`;
    return `<label class="sub">Bots: <select id="botStyle" title="${esc(STYLE_TEXT[room.botStyle] || '')}">${['mixed', 'defensive', 'medium', 'aggressive']
      .map((s) => `<option value="${s}" ${s === room.botStyle ? 'selected' : ''}>${s}</option>`).join('')}</select></label>`;
  }
  function wireBotStyle() { const el = $('botStyle'); if (el) el.onchange = () => socket.emit('botStyle', { style: el.value }); }

  function showDealtHands() {
    const g = room.game;
    if (!g || !g.dealt) return toast('Hands are shown only after the hand is over.');
    const c = g.contract;
    openModal(`<h2>Hand ${g.handNo}: the deal</h2>
      <p class="sub">${esc(nameOf(c.seat))} played ${bidText(c.value, c.suit, c.hasJack)}. ${esc(nameOf(g.dealer))} dealt.</p>
      <div class="deal-list">${g.dealt.map((cards, seat) => `
        <div class="deal-row t${seat % 2} ${seat === c.seat ? 'bidder' : ''}">
          <div class="who t${seat % 2}">${esc(nameOf(seat))}</div>
          <div class="deal-cards">${cards.map((x) => cardHTML(x)).join('')}</div>
        </div>`).join('')}</div>
      <div class="row"><button class="btn primary" data-close>Close</button></div>`, true);
  }
  $('handsBtn').onclick = showDealtHands;
  $('resetChipsBtn').onclick = () => openModal(`<h2>Reset chips?</h2><p>Both teams go back to 12 chips. The current hand continues.</p>
    <div class="row"><button class="btn primary" data-reset>Reset</button><button class="btn" data-close>Cancel</button></div>`, true);

  let lastHighKey = '';
  function renderCenter(g) {
    const c = $('center');
    const mi = $('matInfo');
    if (g && g.phase === 'playing' && g.contract) {
      const lead = g.trick.cards.length ? g.trick.cards[0].card.suit : null;
      mi.innerHTML = `<span>${g.contract.suit === 'NT' ? 'No trump' : `Trump ${colourSuits(SYM[g.contract.suit])}`}</span>${lead ? `<span>Lead ${colourSuits(SYM[lead])}</span>` : ''}`;
    } else mi.innerHTML = '';
    if (!g) {
      const humans = room.seats.filter((s) => s.kind === 'human').length;
      c.innerHTML = `<div class="big">Table ${esc(room.code)}</div>
        <div class="sub">${humans} of ${N()} seated${room.fixed ? '' : '. Send the code to friends'}; empty seats become bots when the host deals.</div>
        ${botStyleHtml()}
        ${room.isHost ? '<button class="btn primary" id="startBtn">Deal the first hand</button>' : '<div class="sub">Waiting for the host to deal.</div>'}`;
      const sb = $('startBtn');
      if (sb) sb.onclick = () => socket.emit('start');
      wireBotStyle();
      return;
    }
    if (g.phase === 'bidding') {
      // The mat holds only the standing bid; each player's own call sits beside their seat.
      const h = g.bidding.high;
      const waiting = g.turn === room.mySeat ? 'Your call' : `<span class="who t${g.turn % 2}">${esc(nameOf(g.turn))}</span> to call`;
      const dbl = g.bidding.doubled ? `<span class="dbl">${g.bidding.doubled === 2 ? 'Redoubled' : 'Doubled'}</span>` : '';
      const hk = h ? `${g.handNo}:${h.seat}:${h.value}:${h.suit}` : '';
      const pulse = h && hk !== lastHighKey ? ' pulse' : '';
      lastHighKey = hk;
      c.innerHTML = h
        ? `<div class="bidval${pulse}">${colourSuits(esc(bidText(h.value, h.suit, h.hasJack)))}</div>
           <div class="sub"><span class="who t${h.seat % 2}">${esc(nameOf(h.seat))}</span> ${dbl}</div>
           <div class="sub wait">${waiting}</div>`
        : `<div class="sub">Hand ${g.handNo}</div><div class="sub wait">${waiting}</div>`;
      return;
    }
    if (g.phase === 'selfraise') {
      const h = g.bidding.high;
      const who = g.turn === room.mySeat ? 'You' : `<span class="who t${g.turn % 2}">${esc(nameOf(g.turn))}</span>`;
      c.innerHTML = `<div class="bidval">${colourSuits(esc(bidText(h.value, h.suit, h.hasJack)))}</div>
        <div class="sub wait">${who} won the bid — ${g.turn === room.mySeat ? 'keep it or raise to a higher tier' : 'deciding whether to raise'}</div>`;
      return;
    }
    if (g.phase === 'playing') {
      c.innerHTML = g.trick.cards.length ? '' : `<div class="sub">Trick ${g.trickNo + 1} of ${g.handSize || 8} · ${g.turn === room.mySeat ? 'your lead' : `${esc(nameOf(g.turn))} leads`}</div>`;
      return;
    }
    if (g.phase === 'matchover') {
      c.innerHTML = `<div class="big">${teamName(g.winner)} wins</div>
        ${botStyleHtml()}
        ${room.isHost ? '<button class="btn primary" id="againBtn">Start a new match</button>' : '<div class="sub">The host can start a new match.</div>'}`;
      const ab = $('againBtn');
      if (ab) ab.onclick = () => socket.emit('start');
      wireBotStyle();
      return;
    }
    if (g.phase === 'handover') {
      const r = g.result;
      c.innerHTML = `<div class="big">${teamName(r.contract.team)} ${r.made ? 'made' : 'went down on'} ${bidText(r.contract.value, r.contract.suit, r.contract.hasJack)}</div>
        <div class="sub">Use "Last trick", "Show the hands" and the log on the right to review the hand.</div>
        <button class="btn" id="handsBtn2">Show the initial hands</button>
        ${room.isHost ? '<button class="btn primary" id="nextBtn">Next hand</button>' : '<div class="sub">The host deals the next hand.</div>'}`;
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
    if (key !== bidKey) { bidKey = key; bidVal = L.minBid ?? 56; }
    const canBid = L.minBid !== null;
    if (canBid) bidVal = Math.min(56, Math.max(bidVal, L.minBid));
    const high = g.bidding.high;
    $('bidPrompt').textContent = high ? `Current bid ${high.ns ? `${high.value} NS (no ${SYM[high.ns]})` : bidText(high.value, high.suit, high.hasJack)} by ${nameOf(high.seat)}` : 'You open the bidding';
    $('bidValue').textContent = canBid ? bidVal : '—';
    $('bidMinus').disabled = !canBid || bidVal <= L.minBid;
    $('bidPlus').disabled = !canBid || bidVal >= 56;
    $('levelJumps').innerHTML = canBid ? [40, 48, 56].filter((v) => v >= L.minBid && v !== bidVal)
      .map((v) => `<button class="btn small" data-level="${v}">${v}</button>`).join('') : '';
    $('levelJumps').querySelectorAll('[data-level]').forEach((b) => (b.onclick = () => { bidVal = Number(b.dataset.level); renderBidPanel(); }));
    $('suitBtns').innerHTML = ['S', 'H', 'D', 'C', 'NT'].map((s) => {
      const ok = canBid && L.suits.includes(s);
      // the power cards you hold in the suit, so the call's meaning is visible as you make it
      const power = g.hand.filter((c) => c.suit === s && (c.rank === 'J' || c.rank === '9')).map((c) => c.rank).sort().reverse();
      const hasJ = power.includes('J');
      return `<button class="btn ${RED.has(s) ? 'red' : ''}" data-suit="${s}" ${ok ? '' : 'disabled'}
        title="${ok ? `Bid ${bidVal} ${SUIT_NAME[s]}${hasJ ? '' : s === 'NT' ? '' : ' (suit first: you hold no Jack of it)'}` : `You hold no ${SUIT_NAME[s]}`}">${suitBtnText(bidVal, s, hasJ)}${power.length ? `<span class="tag">${power.join(' ')}</span>` : ''}</button>`;
    }).join('');
    $('suitBtns').querySelectorAll('[data-suit]').forEach((b) => (b.onclick = () => socket.emit('bid', { type: 'bid', value: bidVal, suit: b.dataset.suit })));
    const pm = L.plusMeaning || {};
    // Build the whole Plus row first, then wire it: appending with innerHTML += would rebuild the
    // partner Plus buttons and drop their click handlers.
    let plusHtml = (L.plus || []).map((n) => `<button class="btn small" data-plus="${n}"
      title="${L.plusSuit ? `Bid ${(g.bidding.high ? g.bidding.high.value : 28) + n} ${SUIT_NAME[L.plusSuit]}: ` : ''}I hold ${(pm[n] || []).join(' and ')} of ${L.plusSuit ? SUIT_NAME[L.plusSuit] : 'this suit'}${n === 1 && (pm[n] || [])[0] === 'J' ? ' and nothing else in it' : ''}">Plus ${n}${L.plusSuit ? ` <span class="${RED.has(L.plusSuit) ? 'red' : ''}">${SYM[L.plusSuit]}</span>` : ''} · ${(pm[n] || []).join('+')}</button>`).join('');
    if (L.plusOpen && L.plusOpen.length) {
      const base = g.bidding.high ? g.bidding.high.value : 27;   // opening Plus N = 27 + N
      plusHtml += L.plusOpen.map((o) => { const cards = o.cards || []; return `<button class="btn small ${RED.has(o.suit) ? 'red' : ''}" data-popen="${o.n}" data-suit="${o.suit}"
        title="${g.bidding.high ? 'Bid' : 'Open'} ${base + o.n} ${SUIT_NAME[o.suit]}: I hold ${cards.join(' and ')} of ${SUIT_NAME[o.suit]}${o.n === 1 && cards[0] === 'J' ? ' and nothing else in it' : ''}">Plus ${o.n} ${SYM[o.suit]} · ${cards.join('+')}</button>`; }).join('');
    }
    $('plusBtns').innerHTML = plusHtml;
    $('plusBtns').querySelectorAll('[data-plus]').forEach((b) => (b.onclick = () => socket.emit('bid', { type: 'plus', n: Number(b.dataset.plus) })));
    $('plusBtns').querySelectorAll('[data-popen]').forEach((b) => (b.onclick = () => socket.emit('bid', { type: 'plus', n: Number(b.dataset.popen), suit: b.dataset.suit })));
    $('nsBtns').innerHTML = (L.ns || []).map((o) => `<button class="btn small ${RED.has(o.suit) ? 'red' : ''}" data-ns="${o.value}"
      title="No trump; tells the table you hold no ${SUIT_NAME[o.suit]}">${o.value} NS · no ${SYM[o.suit]}</button>`).join('');
    $('nsBtns').querySelectorAll('[data-ns]').forEach((b) => (b.onclick = () => socket.emit('bid', { type: 'ns', value: Number(b.dataset.ns) })));
    $('passBtn').disabled = !L.pass;
    $('passBtn').title = L.pass ? '' : 'The first bidder must open with 28 or more';
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
    $('selfRaisePrompt').innerHTML = `You won the bid at ${colourSuits(esc(bidText(high.value, high.suit, high.hasJack)))} — keep it, or convert to a higher tier.`;
    $('raiseBtns').innerHTML = (L.raiseLevels || []).map((v) =>
      `<button class="btn" data-raise="${v}" title="Raise your contract to ${v} ${high.suit === 'NT' ? 'NT' : SUIT_NAME[high.suit]}: bigger stake, more points needed">${colourSuits(esc(bidText(v, high.suit, high.hasJack)))}</button>`).join('');
    $('raiseBtns').querySelectorAll('[data-raise]').forEach((b) => (b.onclick = () => socket.emit('bid', { type: 'raise', value: Number(b.dataset.raise) })));
    $('keepBtn').onclick = () => socket.emit('bid', { type: 'keep' });
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
      if ((m = /^Call: (.+?) — (.+)$/.exec(l))) return `<li class="call"><b>${esc(m[1])}</b> ${colourSuits(esc(m[2]))}</li>`;
      if ((m = /^Trick (\d+): (.+?) takes (.+)$/.exec(l))) return `<li class="trick-line"><span class="n">${m[1]}</span><b>${esc(m[2])}</b> ${esc(m[3])}</li>`;
      if (/^(Hand \d|Contract)/.test(l)) return `<li class="head">${colourSuits(esc(l))}</li>`;
      return `<li>${colourSuits(esc(l))}</li>`;
    }).join('');
    $('log').scrollTop = 1e6;
    $('chat').innerHTML = room.chat.map((m) => m.from === null
      ? `<li class="sys">${esc(m.text)}</li>`
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
    const bt = teamName(c.team);
    const verdict = r.made ? `${bt} made it` : `${bt} went down`;
    const flow = r.made
      ? `${teamName(r.payer)} pays ${r.amount} chip${r.amount > 1 ? 's' : ''} to ${bt}.`
      : `${bt} pays ${r.amount} chip${r.amount > 1 ? 's' : ''} to ${teamName(r.receiver)}.`;
    const over = g.phase === 'matchover';
    const show = () => openModal(`
      <h2>${verdict}</h2>
      <p>${esc(nameOf(c.seat))} bid ${bidText(c.value, c.suit, c.hasJack)}${c.mult > 1 ? ` ×${c.mult}` : ''}. ${flow}</p>
      ${g.trickNo < (g.handSize || 8) ? `<p class="sub">Stopped after trick ${g.trickNo}: ${r.made ? 'target reached' : 'target out of reach'}.</p>` : ''}
      <div class="tally">
        <span>${teamName(0)} points</span><span class="v">${r.points[0]}</span>
        <span>${teamName(1)} points</span><span class="v">${r.points[1]}</span>
        <span>${teamName(0)} chips</span><span class="v">${g.tables[0]}</span>
        <span>${teamName(1)} chips</span><span class="v">${g.tables[1]}</span>
      </div>
      ${over ? `<p><b>${teamName(g.winner)} wins the match.</b></p>` : room.isHost ? '' : '<p class="sub">The host deals the next hand.</p>'}
      <div class="row">
        ${over && room.isHost ? '<button class="btn primary" data-start>Start a new match</button>' : ''}
        <button class="btn" data-hands>Show the initial hands</button>
        ${!over && room.isHost ? '<button class="btn primary" data-next>Next hand</button>' : ''}
        <button class="btn" data-close>Close</button>
      </div>`, true, 'phase');
    const chips = `${r.amount} chip${r.amount > 1 ? 's' : ''}`;
    if (over) celebrate(g.winner, true, 'wins the match', show);
    else celebrate(r.receiver, false, r.made ? `made ${esc(bidText(c.value, c.suit, c.hasJack))} and takes ${chips}` : `set ${teamName(c.team)} and takes ${chips}`, show);
  }
})();
