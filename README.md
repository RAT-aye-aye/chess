# Chess — Pass & Play

A two-player chess game for one Android phone: make your move, then hand the
phone to your opponent. Runs fully offline once loaded.

## Play it

```sh
./serve.sh          # serves on http://127.0.0.1:8123
```

Open the link in the phone's browser. To make it feel like an app:

1. Open the link in Chrome.
2. Menu (⋮) → **Add to Home screen** / **Install app**.
3. Launch it from the home-screen icon — it opens full screen, no address bar.

The service worker caches everything, so the game still opens after the local
server is stopped (as long as you don't clear site data).

## Features

- Complete chess rules: castling, en passant, promotion (choose Q/R/B/N),
  check, checkmate, stalemate, 50-move rule, threefold repetition and
  insufficient material.
- Tap a piece to see its legal moves, tap a highlighted square to move.
  Captures are ringed, quiet moves dotted.
- **Auto flip**: the board rotates to whoever is on move — ideal for passing
  the phone back and forth.
- Move list in standard algebraic notation (SAN), last-move highlight,
  check highlight, captured-piece trays with material score.
- Unlimited undo, new game, manual flip.
- The game is saved automatically; close the browser and come back later.

## HTML Lab

The site also ships a small, public HTML playground at `/lab/` (linked as
"HTML Lab" under the board): type HTML/CSS/JS, press **Run** (or Ctrl/Cmd +
Enter) and it renders in a sandboxed preview iframe. Nothing is uploaded and
nothing runs on a server; the last snippet is kept in `localStorage`. Three
starter examples are included (card, canvas animation, clock).

## Hidden extras

- `↑ ↑ ↓ ↓ ← → ← → B A` toggles a retro CRT theme.
- On a phone (no keyboard): tap the round turn indicator above the board 7 times.

Both do the same thing; nothing is hidden from anyone, it's just an Easter egg.

## Layout

| File | Purpose |
| --- | --- |
| `index.html` | App shell and markup |
| `style.css` | Mobile-first UI styling |
| `engine.js` | Rules engine (move generation, SAN, game state) |
| `app.js` | Board rendering, input handling, saved games |
| `manifest.json`, `icon*.png`, `sw.js` | Installable / offline app |
| `tools/make_icon.py` | Regenerates the PNG icons (no image libs needed) |
| `lab/index.html` | Public HTML playground at `/lab/` |
| `tools/test-ui.js` | Headless UI tests (jsdom) |
| `tools/test-lab.js` | Headless tests for the lab page |

## Tests

```sh
node test-engine.js        # perft + SAN + game-state tests
# UI tests need jsdom:
NODE_PATH=/tmp/opencode/domtest/node_modules node tools/test-ui.js
NODE_PATH=/tmp/opencode/domtest/node_modules node tools/test-lab.js
```

The engine is verified against the standard perft suite (start position to
depth 4, Kiwipete to depth 3, plus the en-passant, castling and promotion
positions).
