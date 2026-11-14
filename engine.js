/* Chess engine: full legal move generation, castling, en passant, promotion,
   SAN notation and game-over detection. Pure JS, no dependencies. */
'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Chess = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  // Board index 0..63: index = row * 8 + col, row 0 is rank 8, col 0 is file a.
  const KNIGHT_DELTAS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  const KING_DELTAS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const BISHOP_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const ROOK_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const QUEEN_DIRS = BISHOP_DIRS.concat(ROOK_DIRS);

  const FLAG = { EP: 1, CASTLE_K: 2, CASTLE_Q: 4, DOUBLE: 8 };

  const FILES = 'abcdefgh';

  function pieceColor(p) {
    if (!p) return null;
    return p === p.toUpperCase() ? 'w' : 'b';
  }

  function squareName(sq) {
    return FILES[sq & 7] + (8 - (sq >> 3));
  }

  function opposite(color) {
    return color === 'w' ? 'b' : 'w';
  }

  function parseFEN(fen) {
    const parts = fen.trim().split(/\s+/);
    const board = new Array(64).fill(null);
    let sq = 0;
    for (const ch of parts[0]) {
      if (ch === '/') continue;
      if (/[1-8]/.test(ch)) sq += parseInt(ch, 10);
      else board[sq++] = ch;
    }
    const castling = { K: false, Q: false, k: false, q: false };
    for (const ch of parts[2] || '-') {
      if (ch === '-') break;
      if (ch in castling) castling[ch] = true;
    }
    return {
      board,
      turn: parts[1] === 'b' ? 'b' : 'w',
      castling,
      ep: parts[3] && parts[3] !== '-' ? FILES.indexOf(parts[3][0]) + (8 - parseInt(parts[3][1], 10)) * 8 : -1,
      halfmove: parseInt(parts[4] || '0', 10) || 0,
      fullmove: parseInt(parts[5] || '1', 10) || 1
    };
  }

  function toFEN(s) {
    let out = '';
    for (let r = 0; r < 8; r++) {
      let empty = 0;
      for (let c = 0; c < 8; c++) {
        const p = s.board[r * 8 + c];
        if (!p) empty++;
        else {
          if (empty) { out += empty; empty = 0; }
          out += p;
        }
      }
      if (empty) out += empty;
      if (r < 7) out += '/';
    }
    let cast = '';
    if (s.castling.K) cast += 'K';
    if (s.castling.Q) cast += 'Q';
    if (s.castling.k) cast += 'k';
    if (s.castling.q) cast += 'q';
    return [
      out,
      s.turn,
      cast || '-',
      s.ep >= 0 ? squareName(s.ep) : '-',
      s.halfmove,
      s.fullmove
    ].join(' ');
  }

  /* Key that identifies the position for repetition detection (no clocks). */
  function positionKey(s) {
    const f = toFEN(s).split(' ');
    return f[0] + ' ' + f[1] + ' ' + f[2] + ' ' + f[3];
  }

  function findKing(board, color) {
    const king = color === 'w' ? 'K' : 'k';
    for (let i = 0; i < 64; i++) if (board[i] === king) return i;
    return -1;
  }

  function isAttacked(board, sq, byColor) {
    const r = sq >> 3;
    const c = sq & 7;

    // Pawns
    const pawn = byColor === 'w' ? 'P' : 'p';
    const pawnRow = byColor === 'w' ? r + 1 : r - 1;
    if (pawnRow >= 0 && pawnRow < 8) {
      if (c > 0 && board[pawnRow * 8 + c - 1] === pawn) return true;
      if (c < 7 && board[pawnRow * 8 + c + 1] === pawn) return true;
    }

    // Knights
    const knight = byColor === 'w' ? 'N' : 'n';
    for (const [dr, dc] of KNIGHT_DELTAS) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
      if (board[nr * 8 + nc] === knight) return true;
    }

    // King
    const king = byColor === 'w' ? 'K' : 'k';
    for (const [dr, dc] of KING_DELTAS) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
      if (board[nr * 8 + nc] === king) return true;
    }

    // Sliding pieces
    const rook = byColor === 'w' ? 'R' : 'r';
    const bishop = byColor === 'w' ? 'B' : 'b';
    const queen = byColor === 'w' ? 'Q' : 'q';
    for (const [dr, dc] of ROOK_DIRS) {
      let nr = r + dr, nc = c + dc;
      while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
        const p = board[nr * 8 + nc];
        if (p) {
          if (p === rook || p === queen) return true;
          break;
        }
        nr += dr; nc += dc;
      }
    }
    for (const [dr, dc] of BISHOP_DIRS) {
      let nr = r + dr, nc = c + dc;
      while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
        const p = board[nr * 8 + nc];
        if (p) {
          if (p === bishop || p === queen) return true;
          break;
        }
        nr += dr; nc += dc;
      }
    }
    return false;
  }

  function inCheck(s, color) {
    const k = findKing(s.board, color);
    if (k < 0) return false;
    return isAttacked(s.board, k, opposite(color));
  }

  function addPawnMove(moves, from, to, color, promo) {
    if (promo) {
      const base = color === 'w' ? 'Q' : 'q';
      for (const p of ['q', 'r', 'b', 'n']) moves.push({ from, to, promo: p });
    } else {
      moves.push({ from, to, flags: 0 });
    }
  }

  function pseudoMoves(s) {
    const moves = [];
    const color = s.turn;
    const board = s.board;

    for (let sq = 0; sq < 64; sq++) {
      const p = board[sq];
      if (!p || pieceColor(p) !== color) continue;
      const type = p.toLowerCase();
      const r = sq >> 3;
      const c = sq & 7;

      if (type === 'p') {
        const dir = color === 'w' ? -1 : 1;
        const startRow = color === 'w' ? 6 : 1;
        const promoRow = color === 'w' ? 0 : 7;
        const oneRow = r + dir;
        if (oneRow >= 0 && oneRow < 8) {
          const one = oneRow * 8 + c;
          if (!board[one]) {
            addPawnMove(moves, sq, one, color, oneRow === promoRow);
            const twoRow = r + 2 * dir;
            if (r === startRow) {
              const two = twoRow * 8 + c;
              if (!board[two]) moves.push({ from: sq, to: two, flags: FLAG.DOUBLE });
            }
          }
          for (const dc of [-1, 1]) {
            const nc = c + dc;
            if (nc < 0 || nc > 7) continue;
            const to = oneRow * 8 + nc;
            const target = board[to];
            if (target && pieceColor(target) !== color) {
              addPawnMove(moves, sq, to, color, oneRow === promoRow);
            } else if (!target && to === s.ep) {
              moves.push({ from: sq, to, flags: FLAG.EP });
            }
          }
        }
        continue;
      }

      if (type === 'n' || type === 'k') {
        const deltas = type === 'n' ? KNIGHT_DELTAS : KING_DELTAS;
        for (const [dr, dc] of deltas) {
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
          const to = nr * 8 + nc;
          const target = board[to];
          if (target && pieceColor(target) === color) continue;
          moves.push({ from: sq, to, flags: 0 });
        }
        continue;
      }

      const dirs = type === 'b' ? BISHOP_DIRS : type === 'r' ? ROOK_DIRS : QUEEN_DIRS;
      for (const [dr, dc] of dirs) {
        let nr = r + dr, nc = c + dc;
        while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
          const to = nr * 8 + nc;
          const target = board[to];
          if (target) {
            if (pieceColor(target) !== color) moves.push({ from: sq, to, flags: 0 });
            break;
          }
          moves.push({ from: sq, to, flags: 0 });
          nr += dr; nc += dc;
        }
      }
    }

    // Castling
    const kingSq = color === 'w' ? 60 : 4;
    const enemy = opposite(color);
    if (board[kingSq] && board[kingSq].toLowerCase() === 'k' && board[kingSq] === (color === 'w' ? 'K' : 'k')) {
      const canK = color === 'w' ? s.castling.K : s.castling.k;
      const canQ = color === 'w' ? s.castling.Q : s.castling.q;
      const rook = color === 'w' ? 'R' : 'r';
      if (canK &&
          board[kingSq + 1] === null && board[kingSq + 2] === null && board[kingSq + 3] === rook &&
          !isAttacked(board, kingSq, enemy) &&
          !isAttacked(board, kingSq + 1, enemy) &&
          !isAttacked(board, kingSq + 2, enemy)) {
        moves.push({ from: kingSq, to: kingSq + 2, flags: FLAG.CASTLE_K });
      }
      if (canQ &&
          board[kingSq - 1] === null && board[kingSq - 2] === null && board[kingSq - 3] === null &&
          board[kingSq - 4] === rook &&
          !isAttacked(board, kingSq, enemy) &&
          !isAttacked(board, kingSq - 1, enemy) &&
          !isAttacked(board, kingSq - 2, enemy)) {
        moves.push({ from: kingSq, to: kingSq - 2, flags: FLAG.CASTLE_Q });
      }
    }

    return moves;
  }

  function makeMove(s, mv) {
    const undo = {
      board: s.board.slice(),
      turn: s.turn,
      castling: { ...s.castling },
      ep: s.ep,
      halfmove: s.halfmove,
      fullmove: s.fullmove,
      mv
    };
    const piece = s.board[mv.from];
    const color = pieceColor(piece);
    const captured = s.board[mv.to];

    s.board[mv.from] = null;

    if (mv.flags & FLAG.EP) {
      const capSq = color === 'w' ? mv.to + 8 : mv.to - 8;
      s.board[capSq] = null;
    }

    s.board[mv.to] = mv.promo
      ? (color === 'w' ? mv.promo.toUpperCase() : mv.promo)
      : piece;

    if (mv.flags & FLAG.CASTLE_K) {
      const rf = color === 'w' ? 63 : 7;
      const rt = color === 'w' ? 61 : 5;
      s.board[rt] = s.board[rf];
      s.board[rf] = null;
    } else if (mv.flags & FLAG.CASTLE_Q) {
      const rf = color === 'w' ? 56 : 0;
      const rt = color === 'w' ? 59 : 3;
      s.board[rt] = s.board[rf];
      s.board[rf] = null;
    }

    const type = piece.toLowerCase();
    if (type === 'k') {
      if (color === 'w') { s.castling.K = s.castling.Q = false; }
      else { s.castling.k = s.castling.q = false; }
    }
    if (mv.from === 63 || mv.to === 63) s.castling.K = false;
    if (mv.from === 56 || mv.to === 56) s.castling.Q = false;
    if (mv.from === 7 || mv.to === 7) s.castling.k = false;
    if (mv.from === 0 || mv.to === 0) s.castling.q = false;

    s.ep = (mv.flags & FLAG.DOUBLE) ? (mv.from + mv.to) >> 1 : -1;

    if (type === 'p' || captured || (mv.flags & FLAG.EP)) s.halfmove = 0;
    else s.halfmove++;
    if (color === 'b') s.fullmove++;

    s.turn = opposite(color);
    return undo;
  }

  function unmakeMove(s, undo) {
    s.board = undo.board;
    s.turn = undo.turn;
    s.castling = undo.castling;
    s.ep = undo.ep;
    s.halfmove = undo.halfmove;
    s.fullmove = undo.fullmove;
  }

  function generateMoves(s, opts) {
    const pseudo = pseudoMoves(s);
    if (opts && opts.legal === false) return pseudo;
    const legal = [];
    const color = s.turn;
    for (const mv of pseudo) {
      const undo = makeMove(s, mv);
      if (!inCheck(s, color)) legal.push(mv);
      unmakeMove(s, undo);
    }
    return legal;
  }

  function toSAN(s, mv) {
    const piece = s.board[mv.from];
    const color = pieceColor(piece);
    const type = piece.toLowerCase();
    const legal = generateMoves(s);
    const targetPiece = s.board[mv.to];
    const isCapture = !!targetPiece || !!(mv.flags & FLAG.EP);
    let san;

    if (mv.flags & FLAG.CASTLE_K) san = 'O-O';
    else if (mv.flags & FLAG.CASTLE_Q) san = 'O-O-O';
    else if (type === 'p') {
      san = '';
      if (isCapture) san += FILES[mv.from & 7] + 'x';
      san += squareName(mv.to);
      if (mv.promo) san += '=' + mv.promo.toUpperCase();
    } else {
      san = type.toUpperCase();
      const others = legal.filter(m => m.to === mv.to && m.from !== mv.from &&
        s.board[m.from] && s.board[m.from].toLowerCase() === type);
      if (others.length) {
        const sameFile = others.some(m => (m.from & 7) === (mv.from & 7));
        const sameRank = others.some(m => (m.from >> 3) === (mv.from >> 3));
        if (!sameFile) san += FILES[mv.from & 7];
        else if (!sameRank) san += String(8 - (mv.from >> 3));
        else san += squareName(mv.from);
      }
      if (isCapture) san += 'x';
      san += squareName(mv.to);
    }

    const undo = makeMove(s, mv);
    const opponentCheck = inCheck(s, s.turn);
    const opponentHasMoves = generateMoves(s).length > 0;
    unmakeMove(s, undo);

    if (opponentCheck) san += opponentHasMoves ? '+' : '#';
    return san;
  }

  function insufficientMaterial(s) {
    const pieces = [];
    for (let i = 0; i < 64; i++) {
      const p = s.board[i];
      if (p && p.toLowerCase() !== 'k') pieces.push(p);
    }
    if (pieces.length === 0) return true;
    if (pieces.length === 1 && (pieces[0].toLowerCase() === 'b' || pieces[0].toLowerCase() === 'n')) return true;
    if (pieces.length === 2 && pieces.every(p => p.toLowerCase() === 'b')) {
      const colors = [];
      for (let i = 0; i < 64; i++) {
        const p = s.board[i];
        if (p && p.toLowerCase() === 'b') colors.push(((i >> 3) + (i & 7)) % 2);
      }
      if (colors[0] === colors[1]) return true;
    }
    return false;
  }

  function gameStatus(s) {
    const moves = generateMoves(s);
    const check = inCheck(s, s.turn);
    if (moves.length === 0) {
      if (check) return { over: true, winner: opposite(s.turn), reason: 'checkmate', check };
      return { over: true, winner: null, reason: 'stalemate', check };
    }
    if (s.halfmove >= 100) return { over: true, winner: null, reason: 'fifty-move rule', check };
    if (insufficientMaterial(s)) return { over: true, winner: null, reason: 'insufficient material', check };
    return { over: false, winner: null, reason: '', check };
  }

  function perft(s, depth) {
    if (depth === 0) return 1;
    const moves = generateMoves(s);
    if (depth === 1) return moves.length;
    let total = 0;
    for (const mv of moves) {
      const undo = makeMove(s, mv);
      total += perft(s, depth - 1);
      unmakeMove(s, undo);
    }
    return total;
  }

  return {
    START_FEN,
    FLAG,
    parseFEN,
    toFEN,
    positionKey,
    squareName,
    pieceColor,
    opposite,
    generateMoves,
    makeMove,
    unmakeMove,
    inCheck,
    toSAN,
    gameStatus,
    perft
  };
});
