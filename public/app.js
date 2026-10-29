/* 56 — browser client. All rules are enforced on the server; this only renders and sends intents. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const SYM = { S: '♠', H: '♥', D: '♦', C: '♣', NT: 'NT' };
  const SUIT_NAME = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs', NT: 'No trump' };
  const RED = new Set(['H', 'D']);
  const POINTS = { J: 3, 9: 2, A: 1, 10: 1, K: 0, Q: 0 };
  const TEAM = ['Team A', 'Team B'];
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
  const initialCode = new URLSearchParams(location.search).get('room');
  if (initialCode) $('codeInput').value = initialCode.toUpperCase();

  const needName = () => { if (myName()) return true; toast('Please type your name first.'); $('nameInput').focus(); return false; };
  $('createBtn').onclick = () => { if (needName()) socket.emit('createRoom', { name: myName(), players: Number($('newPlayers').value) }); };
  document.querySelectorAll('[data-fixed]').forEach((b) => (b.onclick = () => { if (needName()) socket.emit('joinRoom', { code: b.dataset.fixed, name: myName() }); }));
  socket.on('lobby', (tables) => tables.forEach((t) => {
    const el = $(t.players === 8 ? 'info8' : 'info6'); if (!el) return;
    el.textContent = `${t.players === 8 ? '4 vs 4 · 6 cards each' : '3 vs 3 · 8 cards each'} · ${t.seated ? `${t.seated} seated` : 'empty'}${t.playing ? ', playing' : ''}`;
  }));
  $('joinBtn').onclick = () => {
    const code = $('codeInput').value.trim().toUpperCase();
    if (code.length < 5) return toast('Enter the table code.');
    if (needName()) socket.emit('joinRoom', { code, name: myName() });
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
      <p>${esc(nameOf(g.lastTrick.winner))} won it for ${TEAM[g.lastTrick.winner % 2]} (${g.lastTrick.points} pts).</p>
      <div class="mini-trick">${g.lastTrick.cards.map((x) => `
        <figure class="${x.seat === g.lastTrick.winner ? 'win' : ''}">${cardHTML(x.card)}<figcaption>${esc(nameOf(x.seat))}</figcaption></figure>`).join('')}
      </div>
      <div class="row"><button class="btn primary" data-close>Close</button></div>`, true);
  };

  // ------------------------------------------------------------ bidding controls
  $('bidMinus').onclick = () => { bidVal = Math.max(bidVal - 1, room.game.legal.bid.minBid); renderBidPanel(); };
  $('bidPlus').onclick = () => { bidVal = Math.min(bidVal + 1, 56); renderBidPanel(); };
  $('passBtn').onclick = () => socket.emit('bid', { type: 'pass' });
  $('doubleBtn').onclick = () => socket.emit('bid', { type: 'double' });
  $('redoubleBtn').onclick = () => socket.emit('bid', { type: 'redouble' });

  // ------------------------------------------------------------ helpers
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function nameOf(seat) { return room.seats[seat]?.name || `Seat ${seat + 1}`; }
  const N = () => (room && room.players) || 6;
  function rel(seat) { return room.mySeat === null ? seat : (seat - room.mySeat + N()) % N(); }
  const seatPos = () => N() === 8 ? (narrow() ? SEAT_POS8_NARROW : SEAT_POS8) : (narrow() ? SEAT_POS_NARROW : SEAT_POS);
  const trickPos = () => (N() === 8 ? TRICK_POS8 : TRICK_POS);
  // hasJack=false renders suit-first ("Hearts 30"): the caller lacks the Jack of that suit.
  function bidText(v, s, hasJack = true) { return s === 'NT' ? `${v} NT` : hasJack ? `${v} ${SYM[s]}` : `${SYM[s]} ${v}`; }
  // wrap suit symbols so hearts/diamonds show red and all suits a little larger
  function colourSuits(html) { return html.replace(/[♠♣]/g, '<span class="suit black">$&</span>').replace(/[♥♦]/g, '<span class="suit red">$&</span>'); }
  function actionText(a) {
    if (a.type === 'bid') return bidText(a.value, a.suit, a.hasJack);
    if (a.type === 'plus') return `Plus ${a.n} (${bidText(a.value, a.suit, a.hasJack)})`;
    if (a.type === 'ns') return `${a.value} NS (no ${SYM[a.ns]})`;
    return { pass: 'Pass', double: 'Double', redouble: 'Redouble' }[a.type];
  }
  function cardHTML(c, extra = '') {
    return `<div class="card ${RED.has(c.suit) ? 'red' : ''} ${extra}" aria-label="${c.rank} of ${SUIT_NAME[c.suit]}">
      <span class="r">${c.rank}</span><span class="s1">${SYM[c.suit]}</span>
      ${POINTS[c.rank] ? `<span class="pt">${POINTS[c.rank]}</span>` : ''}<span class="s2">${SYM[c.suit]}</span></div>`;
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
    $('roomCode').textContent = room.code;
    renderScores(g);
    renderSeats(g);
    renderCenter(g);
    renderTrick(g);
    renderHand(g);
    renderBidPanel();
    renderRail(g);
    renderPhaseModal(g);
    const myTurn = g && g.turn !== null && g.turn === room.mySeat;
    document.title = myTurn ? '● Your turn · 56' : '56 · Kerala card table';
  }

  function renderScores(g) {
    for (const t of [0, 1]) {
      $(`tables${t}`).textContent = g ? `${g.tables[t]} chips` : '12 chips';
      $(`hpts${t}`).textContent = g && g.contract ? `${g.points[t]} pts` : '';
    }
    const c = g && g.contract;
    $('contractChip').classList.toggle('hidden', !c);
    if (c) {
      $('contractChip').textContent = `${nameOf(c.seat)} · ${TEAM[c.team]} needs ${bidText(c.value, c.suit, c.hasJack)}${c.mult > 1 ? ` ×${c.mult}` : ''}`;
    }
  }

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
      if (g && g.turn === s.seat) cls.push('turn');
      const tookTrick = g && g.phase === 'playing' && g.trick.complete && g.trick.winner === s.seat;
      if (tookTrick) cls.push('won');
      let said = '';
      const a = lastBy[s.seat];
      if (tookTrick) said = `<div class="said won">takes ${g.trick.points ? `${g.trick.points} pts` : 'the trick'}</div>`;
      else if (a) said = `<div class="said ${a.type === 'bid' && RED.has(a.suit) ? 'red' : ''}">${esc(actionText(a))}</div>`;
      else if (g && g.contract && g.contract.seat === s.seat && g.phase === 'playing')
        said = `<div class="said ${RED.has(g.contract.suit) ? 'red' : ''}">${esc(bidText(g.contract.value, g.contract.suit, g.contract.hasJack))}</div>`;

      let body;
      if (s.kind === 'empty') {
        body = `<div class="nm">Open seat</div><div class="meta">${TEAM[s.team]}</div>
          <div class="seat-actions">
            <button class="btn small" data-sit="${s.seat}">Sit here</button>
            ${host ? `<button class="btn small ghost" data-bot="${s.seat}">Add bot</button>` : ''}
          </div>`;
      } else {
        const meta = [];
        if (g && g.dealer === s.seat) meta.push('<span class="dealer" title="Dealer">D</span>');
        if (g && g.phase !== 'handover' && g.phase !== 'matchover' && (g.dealer + 1) % N() === s.seat) meta.push('<span class="starts" title="Starts the bidding and leads the first trick">starts</span>');
        meta.push(`${TEAM[s.team]}${s.kind === 'bot' ? ' bot' : ''}`);
        if (g) meta.push(`${g.handCounts[s.seat]} cards`);
        if (s.kind === 'human' && !s.connected) meta.push('<span class="away">away</span>');
        let actions = '';
        const seated = room.mySeat !== null;
        if (s.kind === 'bot' && !isMe)
          actions += `<button class="btn small" data-sit="${s.seat}" title="${seated && g ? 'Move here; a bot takes your current seat' : 'Play this seat'}">${seated && g ? 'Move here' : 'Take seat'}</button>`;
        if (host && !g && s.kind === 'bot') actions += `<button class="btn small ghost" data-unbot="${s.seat}">Remove</button>`;
        // host may replace anyone; any seated player may replace someone who has dropped off
        if (s.kind === 'human' && !isMe && (host || (seated && !s.connected)))
          actions += `<button class="btn small ghost" data-kick="${s.seat}">${g ? 'Replace with bot' : 'Remove'}</button>`;
        body = `<div class="nm">${esc(s.name)}</div><div class="meta">${meta.join(' ')}</div>
          ${actions ? `<div class="seat-actions">${actions}</div>` : ''}`;
      }
      return `<div class="${cls.join(' ')}" style="left:${x}%;top:${y}%">${said}${body}</div>`;
    }).join('');
    $('seats').querySelectorAll('[data-sit]').forEach((b) => (b.onclick = () => socket.emit('sit', { seat: b.dataset.sit, name: myName() })));
    $('seats').querySelectorAll('[data-bot]').forEach((b) => (b.onclick = () => socket.emit('setBot', { seat: b.dataset.bot, on: true })));
    $('seats').querySelectorAll('[data-unbot]').forEach((b) => (b.onclick = () => socket.emit('setBot', { seat: b.dataset.unbot, on: false })));
    $('seats').querySelectorAll('[data-kick]').forEach((b) => (b.onclick = () => socket.emit('kick', { seat: b.dataset.kick })));
  }

  const STYLE_TEXT = { defensive: 'Defensive: bid low, rarely raise or go for levels', medium: 'Medium: balanced (default)', aggressive: 'Aggressive: bid up, support partner, go for 40 / 48 / 56' };
  function botStyleHtml() {
    if (!room.isHost) return `<div class="sub">Bots: ${esc(room.botStyle || 'medium')}</div>`;
    return `<label class="sub">Bots: <select id="botStyle" title="${esc(STYLE_TEXT[room.botStyle] || '')}">${['defensive', 'medium', 'aggressive']
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

  function renderCenter(g) {
    const c = $('center');
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
      const acts = g.bidding.actions.slice(-N()).reverse();
      const waiting = g.turn === room.mySeat ? 'Your call' : `<span class="who t${g.turn % 2}">${esc(nameOf(g.turn))}</span> to call`;
      c.innerHTML = `<ul class="bidlog">${acts.map((a) => `<li><span class="who t${a.seat % 2}">${esc(nameOf(a.seat))}</span>: ${colourSuits(esc(actionText(a)))}</li>`).join('')}</ul>
        <div class="sub">${acts.length ? '' : `Hand ${g.handNo}. `}${waiting}</div>`;
      return;
    }
    if (g.phase === 'playing') {
      c.innerHTML = g.trick.cards.length ? '' : `<div class="sub">Trick ${g.trickNo + 1} of ${g.handSize || 8} · ${g.turn === room.mySeat ? 'your lead' : `${esc(nameOf(g.turn))} leads`}</div>`;
      return;
    }
    if (g.phase === 'matchover') {
      c.innerHTML = `<div class="big">${TEAM[g.winner]} wins</div>
        ${botStyleHtml()}
        ${room.isHost ? '<button class="btn primary" id="againBtn">Start a new match</button>' : '<div class="sub">The host can start a new match.</div>'}`;
      const ab = $('againBtn');
      if (ab) ab.onclick = () => socket.emit('start');
      wireBotStyle();
      return;
    }
    if (g.phase === 'handover') {
      const r = g.result;
      c.innerHTML = `<div class="big">${TEAM[r.contract.team]} ${r.made ? 'made' : 'went down on'} ${bidText(r.contract.value, r.contract.suit, r.contract.hasJack)}</div>
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
      return `<button class="btn ${RED.has(s) ? 'red' : ''}" data-suit="${s}" ${ok ? '' : 'disabled'}
        title="${ok ? `Bid ${bidVal} ${SUIT_NAME[s]}` : `You hold no ${SUIT_NAME[s]}`}">${bidText(bidVal, s)}</button>`;
    }).join('');
    $('suitBtns').querySelectorAll('[data-suit]').forEach((b) => (b.onclick = () => socket.emit('bid', { type: 'bid', value: bidVal, suit: b.dataset.suit })));
    const pm = L.plusMeaning || {};
    $('plusBtns').innerHTML = (L.plus || []).map((n) => `<button class="btn small" data-plus="${n}"
      title="${L.plusSuit ? `Bid ${(g.bidding.high ? g.bidding.high.value : 28) + n} ${SUIT_NAME[L.plusSuit]}: ` : ''}I hold ${(pm[n] || []).join(' and ')} of ${L.plusSuit ? SUIT_NAME[L.plusSuit] : 'this suit'}${n === 1 && (pm[n] || [])[0] === 'J' ? ' and nothing else in it' : ''}">Plus ${n}${L.plusSuit ? ` <span class="${RED.has(L.plusSuit) ? 'red' : ''}">${SYM[L.plusSuit]}</span>` : ''} · ${(pm[n] || []).join('+')}</button>`).join('');
    $('plusBtns').querySelectorAll('[data-plus]').forEach((b) => (b.onclick = () => socket.emit('bid', { type: 'plus', n: Number(b.dataset.plus) })));
    if (L.plusOpen && L.plusOpen.length) {
      const fresh = { 1: ['J'], 2: ['J', 'J'], 3: ['J', 'J', '9'] };
      $('plusBtns').innerHTML = L.plusOpen.map((o) => `<button class="btn small ${RED.has(o.suit) ? 'red' : ''}" data-popen="${o.n}" data-suit="${o.suit}"
        title="Open ${28 + o.n} ${SUIT_NAME[o.suit]}: I hold ${fresh[o.n].join(' and ')} of ${SUIT_NAME[o.suit]}${o.n === 1 ? ' and nothing else in it' : ''}">Plus ${o.n} ${SYM[o.suit]} · ${fresh[o.n].join('+')}</button>`).join('');
      $('plusBtns').querySelectorAll('[data-popen]').forEach((b) => (b.onclick = () => socket.emit('bid', { type: 'plus', n: Number(b.dataset.popen), suit: b.dataset.suit })));
    }
    $('nsBtns').innerHTML = (L.ns || []).map((o) => `<button class="btn small ${RED.has(o.suit) ? 'red' : ''}" data-ns="${o.value}"
      title="No trump; tells the table you hold no ${SUIT_NAME[o.suit]}">${o.value} NS · no ${SYM[o.suit]}</button>`).join('');
    $('nsBtns').querySelectorAll('[data-ns]').forEach((b) => (b.onclick = () => socket.emit('bid', { type: 'ns', value: Number(b.dataset.ns) })));
    $('passBtn').disabled = !L.pass;
    $('passBtn').title = L.pass ? '' : 'The first bidder must open with 28 or more';
    $('doubleBtn').classList.toggle('hidden', !L.double);
    $('redoubleBtn').classList.toggle('hidden', !L.redouble);
  }

  function renderRail(g) {
    $('log').innerHTML = (g ? g.log : []).map((l) => `<li>${esc(l.replace(/seat (\d)/gi, (_, n) => nameOf(Number(n) - 1)))}</li>`).join('');
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
    const bt = TEAM[c.team];
    const verdict = r.made ? `${bt} made it` : `${bt} went down`;
    const flow = r.made
      ? `${TEAM[r.payer]} pays ${r.amount} chip${r.amount > 1 ? 's' : ''} to ${bt}.`
      : `${bt} pays ${r.amount} chip${r.amount > 1 ? 's' : ''} to ${TEAM[r.receiver]}.`;
    const over = g.phase === 'matchover';
    openModal(`
      <h2>${verdict}</h2>
      <p>${esc(nameOf(c.seat))} bid ${bidText(c.value, c.suit, c.hasJack)}${c.mult > 1 ? ` ×${c.mult}` : ''}. ${flow}</p>
      ${g.trickNo < (g.handSize || 8) ? `<p class="sub">Stopped after trick ${g.trickNo}: ${r.made ? 'target reached' : 'target out of reach'}.</p>` : ''}
      <div class="tally">
        <span>${TEAM[0]} points</span><span class="v">${r.points[0]}</span>
        <span>${TEAM[1]} points</span><span class="v">${r.points[1]}</span>
        <span>${TEAM[0]} chips</span><span class="v">${g.tables[0]}</span>
        <span>${TEAM[1]} chips</span><span class="v">${g.tables[1]}</span>
      </div>
      ${over ? `<p><b>${TEAM[g.winner]} wins the match.</b></p>` : room.isHost ? '' : '<p class="sub">The host deals the next hand.</p>'}
      <div class="row">
        ${over && room.isHost ? '<button class="btn primary" data-start>Start a new match</button>' : ''}
        <button class="btn" data-hands>Show the initial hands</button>
        ${!over && room.isHost ? '<button class="btn primary" data-next>Next hand</button>' : ''}
        <button class="btn" data-close>Close</button>
      </div>`, true, 'phase');
  }
})();
