/* Pass-and-play chess UI */
(function () {
  'use strict';

  const C = window.Chess;
  const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  const NAME = { w: 'White', b: 'Black' };
  const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9 };
  const STORE_KEY = 'chess.passplay.v2';

  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const hud = $('hud');
  const movesPanel = $('movesPanel');
  const moveList = $('moveList');
  const promoEl = $('promo');
  const statusText = $('statusText');
  const subText = $('subText');
  const turnDot = $('turnDot');
  const topStrip = $('playerTop');
  const bottomStrip = $('playerBottom');
  const takenTop = $('takenTop');
  const takenBottom = $('takenBottom');

  let state;
  let initialFen;
  let initialKey;
  let history = [];
  let orientation = 'w';
  let autoFlip = true;
  let selected = null;
  let targets = [];
  let legal = [];
  let lastMove = null;
  let pendingPromo = null;
  let gameOver = null;

  /* ---------- board cells ---------- */
  const cells = [];
  for (let v = 0; v < 64; v++) {
    const d = document.createElement('div');
    d.className = 'sq';
    d.dataset.v = String(v);
    boardEl.appendChild(d);
    cells.push(d);
  }

  /* ---------- sizing ---------- */
  function sizeBoard() {
    const wrap = $('boardWrap');
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    if (!w || !h) return;
    const size = Math.max(160, Math.floor(Math.min(w, h)));
    boardEl.style.width = size + 'px';
    boardEl.style.height = size + 'px';
    boardEl.style.setProperty('--sq', size / 8 + 'px');
  }

  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(sizeBoard).observe($('boardWrap'));
  }
  window.addEventListener('resize', sizeBoard);
  window.addEventListener('orientationchange', () => setTimeout(sizeBoard, 120));

  /* ---------- persistence ---------- */
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        initialFen,
        autoFlip,
        orientation,
        history: history.map((h) => ({ san: h.san, fen: h.fen, key: h.key, from: h.from, to: h.to, cap: h.cap }))
      }));
    } catch (e) { /* storage may be unavailable */ }
  }

  function load() {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    } catch (e) { saved = null; }

    if (saved && typeof saved.initialFen === 'string' && Array.isArray(saved.history)) {
      try {
        const start = C.parseFEN(saved.initialFen);
        if (start.board.filter(Boolean).length > 2) {
          initialFen = saved.initialFen;
          initialKey = C.positionKey(start);
          history = saved.history
            .filter((h) => h && typeof h.fen === 'string' && typeof h.san === 'string')
            .map((h) => ({ san: h.san, fen: h.fen, key: h.key || '', from: h.from, to: h.to, cap: h.cap || null }));
          const last = history[history.length - 1];
          state = C.parseFEN(last ? last.fen : initialFen);
          lastMove = last ? { from: last.from, to: last.to } : null;
          autoFlip = saved.autoFlip !== false;
          orientation = saved.orientation === 'b' ? 'b' : 'w';
          if (autoFlip) orientation = state.turn;
          legal = C.generateMoves(state);
          return;
        }
      } catch (e) { /* fall through to a new game */ }
    }
    newGame();
  }

  function newGame() {
    state = C.parseFEN(C.START_FEN);
    initialFen = C.START_FEN;
    initialKey = C.positionKey(state);
    history = [];
    lastMove = null;
    selected = null;
    targets = [];
    pendingPromo = null;
    gameOver = null;
    legal = C.generateMoves(state);
    orientation = autoFlip ? state.turn : 'w';
    hidePromo();
    save();
    render();
  }

  /* ---------- helpers ---------- */
  function kingSquare(color) {
    const king = color === 'w' ? 'K' : 'k';
    for (let i = 0; i < 64; i++) if (state.board[i] === king) return i;
    return -1;
  }

  function repetitionCount() {
    const key = C.positionKey(state);
    let n = key === initialKey ? 1 : 0;
    for (let i = 0; i < history.length; i++) if (history[i].key === key) n++;
    return n;
  }

  function capturedBy(color) {
    const out = [];
    for (const h of history) {
      if (h.cap && C.pieceColor(h.cap) !== color) out.push(h.cap);
    }
    return out;
  }

  function material(color) {
    let sum = 0;
    for (const p of state.board) if (p && C.pieceColor(p) === color) sum += VAL[p.toLowerCase()] || 0;
    return sum;
  }

  /* ---------- render ---------- */
  function render() {
    const status = C.gameStatus(state);
    const rep = repetitionCount();
    if (status.over) gameOver = status;
    else if (rep >= 3) gameOver = { over: true, winner: null, reason: 'threefold repetition', check: false };
    else gameOver = null;

    renderBoard(status.check);
    renderHud(status);
    renderPlayers();
    renderMoves();
  }

  function renderBoard(inCheck) {
    const flip = orientation === 'b';
    const checkSq = inCheck && !gameOver ? kingSquare(state.turn) : -1;

    for (let v = 0; v < 64; v++) {
      const sq = flip ? 63 - v : v;
      const cell = cells[v];
      const piece = state.board[sq];
      const dark = (((sq >> 3) + (sq & 7)) & 1) === 1;

      let cls = dark ? 'sq dark' : 'sq light';
      if (lastMove && (sq === lastMove.from || sq === lastMove.to)) cls += ' last';
      if (sq === checkSq) cls += ' check';
      if (sq === selected) cls += ' sel';
      if (selected !== null) {
        const t = targets.find((m) => m.to === sq);
        if (t) cls += (state.board[sq] || (t.flags & C.FLAG.EP)) ? ' cap' : ' dot';
      }

      if (cell.className !== cls) cell.className = cls;

      const code = piece ? piece : '';
      if (cell._code !== code) {
        cell._code = code;
        cell.innerHTML = piece
          ? '<span class="pc ' + C.pieceColor(piece) + '">' + GLYPH[piece.toLowerCase()] + '</span>'
          : '';
      }
    }
  }

  function renderHud(status) {
    let msg;
    let hint;

    if (gameOver) {
      const winner = gameOver.winner;
      if (gameOver.reason === 'checkmate') msg = 'Checkmate — ' + NAME[winner] + ' wins';
      else if (gameOver.reason === 'stalemate') msg = 'Stalemate — draw';
      else if (gameOver.reason === 'fifty-move rule') msg = 'Draw — 50-move rule';
      else if (gameOver.reason === 'insufficient material') msg = 'Draw — insufficient material';
      else msg = 'Draw — threefold repetition';
      hint = 'Tap Undo to step back, or New to start again';
    } else {
      msg = NAME[state.turn] + ' to move';
      if (status.check) hint = 'Check! The king must be moved or the check blocked';
      else if (history.length === 0) hint = 'Tap a piece, then tap a highlighted square';
      else hint = 'Pass the phone to ' + NAME[state.turn];
    }

    statusText.textContent = msg;
    subText.textContent = hint;
    turnDot.className = state.turn === 'b' ? 'b' : '';

    hud.classList.toggle('over', !!gameOver);
    hud.classList.toggle('check', !gameOver && !!status.check);
  }

  function renderPlayers() {
    const flip = orientation === 'b';
    const topColor = flip ? 'w' : 'b';
    const bottomColor = flip ? 'b' : 'w';

    const advWhite = material('w') - material('b');

    renderStrip(topStrip, takenTop, topColor, advWhite);
    renderStrip(bottomStrip, takenBottom, bottomColor, advWhite);
  }

  function renderStrip(stripEl, takenEl, color, advWhite) {
    stripEl.classList.toggle('black', color === 'b');
    stripEl.classList.toggle('white', color === 'w');
    stripEl.classList.toggle('active', !gameOver && state.turn === color);

    const nameEl = stripEl.querySelector('.name');
    nameEl.textContent = NAME[color];

    const taken = capturedBy(color).sort((a, b) => (VAL[b.toLowerCase()] || 0) - (VAL[a.toLowerCase()] || 0));
    const adv = color === 'w' ? advWhite : -advWhite;

    let html = '';
    for (const p of taken) html += '<span class="t ' + C.pieceColor(p) + '">' + GLYPH[p.toLowerCase()] + '</span>';
    takenEl.innerHTML = html + (adv > 0 ? '<span class="adv">+' + adv + '</span>' : '');
  }

  function renderMoves() {
    let html = '';
    for (let i = 0; i < history.length; i += 2) {
      const w = history[i] ? history[i].san : '';
      const b = history[i + 1] ? history[i + 1].san : '';
      const current = i + 1 >= history.length;
      html += '<li class="mv-row' + (current ? ' current' : '') + '">' +
        '<span class="num">' + (i / 2 + 1) + '.</span>' +
        '<span class="san w">' + w + '</span>' +
        '<span class="san b">' + b + '</span></li>';
    }
    moveList.innerHTML = html;
    movesPanel.scrollTop = movesPanel.scrollHeight;
  }

  /* ---------- moves ---------- */
  function selectSquare(sq) {
    selected = sq;
    targets = legal.filter((m) => m.from === sq);
    render();
  }

  function clearSelection() {
    selected = null;
    targets = [];
  }

  function onSquare(sq) {
    if (gameOver || pendingPromo) return;
    const piece = state.board[sq];

    if (selected === sq) {
      clearSelection();
      render();
      return;
    }

    if (selected !== null) {
      const mv = targets.find((m) => m.to === sq);
      if (mv) {
        if (mv.promo) { openPromo(mv); return; }
        commit(mv);
        return;
      }
      if (piece && C.pieceColor(piece) === state.turn) { selectSquare(sq); return; }
      clearSelection();
      render();
      return;
    }

    if (piece && C.pieceColor(piece) === state.turn) selectSquare(sq);
  }

  function buzz(pattern) {
    if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) {} }
  }

  function commit(mv) {
    const moverColor = state.turn;
    const cap = state.board[mv.to] || (mv.flags & C.FLAG.EP ? (moverColor === 'w' ? 'p' : 'P') : null);
    const san = C.toSAN(state, mv);

    C.makeMove(state, mv);
    history.push({ san, fen: C.toFEN(state), key: C.positionKey(state), from: mv.from, to: mv.to, cap });

    lastMove = { from: mv.from, to: mv.to };
    clearSelection();
    pendingPromo = null;
    hidePromo();
    legal = C.generateMoves(state);
    if (autoFlip) orientation = state.turn;

    buzz(10);
    save();
    render();

    const status = C.gameStatus(state);
    if (status.over) buzz([16, 70, 24]);
  }

  function undo() {
    if (!history.length) return;
    history.pop();
    const prev = history[history.length - 1];
    state = C.parseFEN(prev ? prev.fen : initialFen);
    lastMove = prev ? { from: prev.from, to: prev.to } : null;
    clearSelection();
    pendingPromo = null;
    hidePromo();
    legal = C.generateMoves(state);
    if (autoFlip) orientation = state.turn;
    gameOver = null;
    buzz(8);
    save();
    render();
  }

  /* ---------- promotion ---------- */
  function openPromo(mv) {
    pendingPromo = mv;
    promoEl.hidden = false;
    const color = state.turn;
    promoEl.querySelectorAll('.promo-btn').forEach((b) => {
      b.style.color = color === 'w' ? '#f4f4f1' : '#20222b';
      b.style.background = color === 'w' ? 'var(--panel-2)' : '#e9e6de';
    });
  }

  function hidePromo() {
    promoEl.hidden = true;
  }

  promoEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.promo-btn');
    if (btn && pendingPromo) {
      const promo = btn.dataset.promo;
      const mv = { from: pendingPromo.from, to: pendingPromo.to, promo };
      pendingPromo = null;
      hidePromo();
      commit(mv);
      return;
    }
    if (e.target.closest('#promoCancel')) {
      pendingPromo = null;
      hidePromo();
      clearSelection();
      render();
    }
  });

  /* ---------- events ---------- */
  boardEl.addEventListener('click', (e) => {
    const cell = e.target.closest('.sq');
    if (!cell) return;
    const v = Number(cell.dataset.v);
    onSquare(orientation === 'b' ? 63 - v : v);
  });

  boardEl.addEventListener('contextmenu', (e) => e.preventDefault());

  $('undoBtn').addEventListener('click', undo);

  $('flipBtn').addEventListener('click', () => {
    orientation = orientation === 'w' ? 'b' : 'w';
    save();
    render();
  });

  $('autoBtn').addEventListener('click', () => {
    autoFlip = !autoFlip;
    const btn = $('autoBtn');
    btn.classList.toggle('on', autoFlip);
    btn.textContent = autoFlip ? 'Auto ✓' : 'Auto ✕';
    if (autoFlip) orientation = state.turn;
    save();
    render();
  });

  $('newBtn').addEventListener('click', () => {
    if (history.length && !window.confirm('Start a new game? The current game will be cleared.')) return;
    newGame();
    buzz(8);
  });

  /* ---------- boot ---------- */
  function init() {
    load();
    $('autoBtn').classList.toggle('on', autoFlip);
    $('autoBtn').textContent = autoFlip ? 'Auto ✓' : 'Auto ✕';
    render();
    sizeBoard();
    requestAnimationFrame(sizeBoard);
    setTimeout(sizeBoard, 250);
  }

  init();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
})();
