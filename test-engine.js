const Chess = require('./engine.js');

function check(name, got, want) {
  const ok = got === want;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + ': ' + got + (ok ? '' : ' (expected ' + want + ')'));
  return ok ? 0 : 1;
}

let fails = 0;
const start = Chess.parseFEN(Chess.START_FEN);
fails += check('startperft1', Chess.perft(start, 1), 20);
fails += check('startperft2', Chess.perft(start, 2), 400);
fails += check('startperft3', Chess.perft(start, 3), 8902);
fails += check('startperft4', Chess.perft(start, 4), 197281);
fails += check('startFEN roundtrip', Chess.toFEN(start), Chess.START_FEN);

// Kiwipete: castling, en passant, pins, promotions
const kiwi = Chess.parseFEN('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
fails += check('kiwipete1', Chess.perft(kiwi, 1), 48);
fails += check('kiwipete2', Chess.perft(kiwi, 2), 2039);
fails += check('kiwipete3', Chess.perft(kiwi, 3), 97862);

// Position 3: en passant discovered check edge cases
const p3 = Chess.parseFEN('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1');
fails += check('pos3-1', Chess.perft(p3, 1), 14);
fails += check('pos3-2', Chess.perft(p3, 2), 191);
fails += check('pos3-3', Chess.perft(p3, 3), 2812);

// Position 4: promotions
const p4 = Chess.parseFEN('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1');
fails += check('pos4-1', Chess.perft(p4, 1), 6);
fails += check('pos4-2', Chess.perft(p4, 2), 264);
fails += check('pos4-3', Chess.perft(p4, 3), 9467);

// Position 5
const p5 = Chess.parseFEN('rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8');
fails += check('pos5-1', Chess.perft(p5, 1), 44);
fails += check('pos5-2', Chess.perft(p5, 2), 1486);
fails += check('pos5-3', Chess.perft(p5, 3), 62379);

// SAN + status
const s = Chess.parseFEN(Chess.START_FEN);
const mvs = Chess.generateMoves(s);
const e4 = mvs.find(m => Chess.squareName(m.from) === 'e2' && Chess.squareName(m.to) === 'e4');
fails += check('SAN e4', Chess.toSAN(s, e4), 'e4');
Chess.makeMove(s, e4);
const nf6 = Chess.generateMoves(s).find(m => Chess.squareName(m.from) === 'g8' && Chess.squareName(m.to) === 'f6');
fails += check('SAN Nf6', Chess.toSAN(s, nf6), 'Nf6');
Chess.makeMove(s, nf6);
fails += check('position key stable', Chess.positionKey(s).split(' ')[1], 'w');

const mate = Chess.parseFEN('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4');
const qxf7 = Chess.generateMoves(mate).find(m => Chess.squareName(m.from) === 'h5' && Chess.squareName(m.to) === 'f7');
fails += check('SAN mate', Chess.toSAN(mate, qxf7), 'Qxf7#');
Chess.makeMove(mate, qxf7);
const st = Chess.gameStatus(mate);
fails += check('mate detected', st.over && st.winner === 'w' && st.reason === 'checkmate', true);

const stale = Chess.parseFEN('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
const st2 = Chess.gameStatus(stale);
fails += check('stalemate detected', st2.over && st2.reason === 'stalemate', true);

console.log(fails === 0 ? '\nALL TESTS PASSED' : '\n' + fails + ' TEST(S) FAILED');
process.exit(fails ? 1 : 0);
