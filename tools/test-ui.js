/* UI smoke tests driven through jsdom (headless, no browser needed).
   Run: NODE_PATH=/tmp/opencode/domtest/node_modules node tools/test-ui.js */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const dir = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const engineSrc = fs.readFileSync(path.join(dir, 'engine.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(dir, 'app.js'), 'utf8');

const FILES = 'abcdefgh';
let failures = 0;

function ok(name, cond, extra) {
  if (cond) console.log('PASS ' + name);
  else {
    failures++;
    console.log('FAIL ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : ''));
  }
}

function boot(seed) {
  const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const w = dom.window;
  w.confirm = () => true;
  if (seed) w.localStorage.setItem('chess.passplay.v2', JSON.stringify(seed));
  w.eval(engineSrc);
  w.eval(appSrc);
  return w;
}

function idx(name) {
  return (8 - Number(name[1])) * 8 + FILES.indexOf(name[0]);
}

function flipped(w) {
  return w.document.querySelector('#playerTop .name').textContent === 'White';
}

function cell(w, name) {
  const i = idx(name);
  const v = flipped(w) ? 63 - i : i;
  return w.document.getElementById('board').children[v];
}

function click(w, el) {
  el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
}

function play(w, from, to) {
  click(w, cell(w, from));
  click(w, cell(w, to));
}

function glyphAt(w, name) {
  const pc = cell(w, name).querySelector('.pc');
  return pc ? pc.textContent : '';
}

function status(w) {
  return w.document.getElementById('statusText').textContent;
}

function movesText(w) {
  return w.document.getElementById('moveList').textContent;
}

function rows(w) {
  return w.document.querySelectorAll('.mv-row').length;
}

/* ---------------------------------------------------------------- */
{
  const w = boot(null);
  const doc = w.document;
  ok('64 board cells', doc.getElementById('board').children.length === 64);
  ok('initial status', status(w) === 'White to move', status(w));
  ok('initial orientation', !flipped(w) && doc.querySelector('#playerBottom .name').textContent === 'White');
  ok('empty move list', movesText(w).trim() === '');

  click(w, cell(w, 'e2'));
  ok('select shows 2 targets', doc.querySelectorAll('.sq.dot, .sq.cap').length === 2,
    doc.querySelectorAll('.sq.dot, .sq.cap').length);
  ok('selected square marked', cell(w, 'e2').classList.contains('sel'));

  click(w, cell(w, 'e5'));
  ok('illegal move rejected', status(w) === 'White to move', status(w));

  click(w, cell(w, 'e7'));
  ok('opponent piece not selectable', !cell(w, 'e7').classList.contains('sel'));

  play(w, 'e2', 'e4');
  ok('e4 played', status(w) === 'Black to move', status(w));
  ok('auto-flipped to black', flipped(w));
  ok('pawn on e4', glyphAt(w, 'e4') === '♟', glyphAt(w, 'e4'));
  ok('move list has e4', movesText(w).includes('e4'), movesText(w));
  ok('last move highlight', cell(w, 'e2').classList.contains('last') || cell(w, 'e4').classList.contains('last'));
  ok('one move row after one ply', rows(w) === 1, rows(w));

  play(w, 'e7', 'e5');
  ok('black replied', status(w) === 'White to move' && !flipped(w), status(w));
  ok('two plies in one row', rows(w) === 1 && movesText(w).includes('e5'), movesText(w));

  click(w, cell(w, 'd2'));
  click(w, cell(w, 'd5'));
  ok('blocked pawn move rejected', status(w) === 'White to move' && rows(w) === 1);

  click(w, cell(w, 'd2'));
  click(w, cell(w, 'd2'));
  ok('tapping selected piece deselects', !cell(w, 'd2').classList.contains('sel'));
  click(w, cell(w, 'd2'));
  ok('reselect works', cell(w, 'd2').classList.contains('sel'));

  click(w, cell(w, 'd4'));
  ok('d4 played', status(w) === 'Black to move');
  play(w, 'e5', 'd4');
  ok('black captures', glyphAt(w, 'd4') === '♟');
  ok('captured tray shows white pawn for black', doc.getElementById('takenTop').textContent.includes('♟'),
    doc.getElementById('takenTop').textContent);
  ok('material advantage shown', doc.getElementById('takenTop').textContent.includes('+1'),
    doc.getElementById('takenTop').textContent);

  const saved = JSON.parse(w.localStorage.getItem('chess.passplay.v2'));
  ok('game saved', saved && saved.history.length === 4, saved && saved.history.length);

  click(w, doc.getElementById('undoBtn'));
  ok('undo restores position', status(w) === 'Black to move' && glyphAt(w, 'd4') === '♟' && glyphAt(w, 'd2') === '',
    status(w) + ' ' + glyphAt(w, 'd2') + '|' + glyphAt(w, 'd4'));
  ok('undo removes second move row', rows(w) === 2);
  ok('undo removes capture tray', doc.getElementById('takenTop').textContent.trim() === '',
    doc.getElementById('takenTop').textContent);

  const before = flipped(w);
  click(w, doc.getElementById('flipBtn'));
  ok('flip button flips', flipped(w) !== before);
  click(w, doc.getElementById('flipBtn'));
  ok('flip back', flipped(w) === before);

  const autoBtn = doc.getElementById('autoBtn');
  ok('auto on by default', autoBtn.classList.contains('on') && autoBtn.textContent.includes('✓'));
  click(w, autoBtn);
  ok('auto off', !autoBtn.classList.contains('on') && autoBtn.textContent.includes('✕'));
  click(w, autoBtn);
  ok('auto on again', autoBtn.classList.contains('on'));

  click(w, doc.getElementById('newBtn'));
  ok('new game clears', status(w) === 'White to move' && movesText(w).trim() === '' && !flipped(w));
}

/* -------- castling -------- */
{
  const seed = {
    initialFen: 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1',
    history: [], autoFlip: true, orientation: 'w'
  };
  const w = boot(seed);
  play(w, 'e1', 'g1');
  ok('white short castle', movesText(w).includes('O-O'), movesText(w));
  ok('king on g1', glyphAt(w, 'g1') === '♚', glyphAt(w, 'g1'));
  ok('rook on f1', glyphAt(w, 'f1') === '♜', glyphAt(w, 'f1'));
  play(w, 'e8', 'c8');
  ok('black long castle', movesText(w).includes('O-O-O'), movesText(w));
  ok('black rook on d8', glyphAt(w, 'd8') === '♜', glyphAt(w, 'd8'));
  ok('black king on c8', glyphAt(w, 'c8') === '♚', glyphAt(w, 'c8'));
}

/* -------- promotion -------- */
{
  const seed = { initialFen: '7k/4P3/8/8/8/8/8/K7 w - - 0 1', history: [], autoFlip: false, orientation: 'w' };
  const w = boot(seed);
  play(w, 'e7', 'e8');
  const promo = w.document.getElementById('promo');
  ok('promotion dialog opens', promo.hidden === false);
  const buttons = promo.querySelectorAll('.promo-btn');
  ok('four promotion choices', buttons.length === 4);
  click(w, buttons[0]);
  ok('promotion dialog closes', promo.hidden === true);
  ok('promoted to queen', glyphAt(w, 'e8') === '♛', glyphAt(w, 'e8'));
  ok('SAN shows promotion', movesText(w).includes('e8=Q'), movesText(w));

  click(w, w.document.getElementById('undoBtn'));
  ok('undo promotion', glyphAt(w, 'e8') === '' && glyphAt(w, 'e7') === '♟', glyphAt(w, 'e7') + '|' + glyphAt(w, 'e8'));
}

/* -------- promotion cancel -------- */
{
  const seed = { initialFen: '7k/4P3/8/8/8/8/8/K7 w - - 0 1', history: [], autoFlip: false, orientation: 'w' };
  const w = boot(seed);
  play(w, 'e7', 'e8');
  click(w, w.document.getElementById('promoCancel'));
  ok('promotion cancel keeps pawn', w.document.getElementById('promo').hidden === true &&
    glyphAt(w, 'e7') === '♟' && status(w) === 'White to move');
}

/* -------- checkmate -------- */
{
  const seed = { initialFen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', history: [], autoFlip: true, orientation: 'w' };
  const w = boot(seed);
  play(w, 'h5', 'f7');
  ok('mate status', status(w) === 'Checkmate — White wins', status(w));
  ok('hud over class', w.document.getElementById('hud').classList.contains('over'));
  ok('mate SAN', movesText(w).includes('Qxf7#'), movesText(w));
  ok('board locked after mate', (function () {
    const before = rows(w);
    play(w, 'a1', 'a3');
    return rows(w) === before && glyphAt(w, 'a3') === '';
  })());
  click(w, w.document.getElementById('undoBtn'));
  ok('undo after mate unlocks', status(w) === 'White to move');
}

/* -------- check indication -------- */
{
  const seed = { initialFen: '4k3/8/8/8/7q/8/4P3/4K3 w - - 0 1', history: [], autoFlip: true, orientation: 'w' };
  const w = boot(seed);
  ok('check notice', w.document.getElementById('hud').classList.contains('check'), status(w));
  ok('check subtext', w.document.getElementById('subText').textContent.includes('Check'));
  ok('status still playable', status(w) === 'White to move', status(w));
}

/* -------- persistence -------- */
{
  const w1 = boot(null);
  play(w1, 'e2', 'e4');
  play(w1, 'c7', 'c5');
  const saved = JSON.parse(w1.localStorage.getItem('chess.passplay.v2'));

  const w2 = boot(saved);
  ok('restored move row', rows(w2) === 1, rows(w2));
  ok('restored turn', status(w2) === 'White to move', status(w2));
  ok('restored board', glyphAt(w2, 'e4') === '♟' && glyphAt(w2, 'c5') === '♟');
  ok('restored orientation', !flipped(w2));
  play(w2, 'g1', 'f3');
  ok('continue saved game', glyphAt(w2, 'f3') === '♞' && rows(w2) === 2);
}

/* -------- easter egg: Konami code and 7 taps -------- */
{
  const w = boot(null);
  const seq = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  const press = (k) => w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true }));

  ok('retro off by default', !w.document.body.classList.contains('retro'));
  seq.forEach(press);
  ok('konami enables retro', w.document.body.classList.contains('retro'));
  ok('toast appeared', !!w.document.getElementById('toast'));
  seq.forEach(press);
  ok('konami toggles retro off', !w.document.body.classList.contains('retro'));

  for (let i = 0; i < 7; i++) click(w, w.document.getElementById('turnDot'));
  ok('7 taps enable retro', w.document.body.classList.contains('retro'));
  ok('lab link present', w.document.querySelector('#foot a[href="https://varnic.org/lab/"]') !== null);
}

/* -------- saved orientation is respected when auto-flip is off -------- */
{
  const w = boot(null);
  play(w, 'e2', 'e4');
  const saved = JSON.parse(w.localStorage.getItem('chess.passplay.v2'));
  saved.autoFlip = false;
  saved.orientation = 'b';
  const w2 = boot(saved);
  ok('manual flip persisted', flipped(w2), w2.document.querySelector('#playerTop .name').textContent);
  ok('turn still black', status(w2) === 'Black to move', status(w2));
}

/* -------- corrupt storage falls back to a new game -------- */
{
  const w = boot({ initialFen: 'not a fen', history: 'nope' });
  ok('corrupt save ignored', status(w) === 'White to move' && rows(w) === 0);
  const w2 = boot({ initialFen: '7k/8/8/8/8/8/8/K7 w - - 0 1', history: [{ bad: true }] });
  ok('bad history entries dropped', status(w2) === 'White to move' && rows(w2) === 0);
}

console.log(failures === 0 ? '\nALL UI TESTS PASSED' : '\n' + failures + ' UI TEST(S) FAILED');
process.exit(failures ? 1 : 0);
