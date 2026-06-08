# KLUX

A Klax-inspired tile matching game — playable in any browser, installable as a PWA. One codebase, desktop and mobile.

> **Note:** KLUX is an original game inspired by classic tile-matching mechanics. It is not affiliated with Atari or the Klax trademark. All art is programmatically generated; all audio is synthesized via the Web Audio API.

## Play

**[Play KLUX →](https://michaelwdorrill.github.io/klux/)**

## Controls

### Desktop (keyboard)
| Key | Action |
|-----|--------|
| ← / A | Move paddle left |
| → / D | Move paddle right |
| ↓ / Space | Drop tile into well |
| ↑ / W | Flip tile back to conveyor |
| P / Esc | Pause |
| Enter | Confirm / Start |

### Mobile (touch)
- **Tap a column** → move paddle there; tap your current column to drop
- **Swipe left/right** → move paddle
- **Swipe down** → drop tile
- **Swipe up** → flip tile
- On-screen ◀ DROP ▶ FLIP ⏸ buttons also available

## How to Play

Tiles fall down a conveyor toward your paddle. Catch them, then drop them into the 5×5 well to form lines of 3 or more matching colors — **KLUXes**. Lines can be horizontal, vertical, or diagonal. Diagonals score big.

Each wave has a goal (e.g. "Score 5000" or "Make 4 diagonal KLUXes"). Clear the goal to advance. You have 3 drops — miss tiles or overfill columns and you lose one. Lose all 3 and it's game over.

**Scoring:**
- Horizontal / Vertical KLUX (3 tiles): 1,000 pts
- Diagonal KLUX (3 tiles): 5,000 pts
- Each extra tile beyond 3: +1,000 pts
- Big KLUX (5 in a row): +5,000 bonus
- Multi-KLUX (multiple lines from one drop): score × number of lines
- Chain (cascade): score × chain depth
- Wave clear bonus: drops remaining × 1,000 pts

## Development

### Prerequisites
- Node.js 18+
- npm 9+

### Setup
```bash
npm install
```

### Dev server
```bash
npm run dev
```

### Run tests
```bash
npm test
```

### Production build
```bash
npm run build
```

### Deploy (GitHub Pages)
Push to `main` — GitHub Actions deploys automatically to `gh-pages`.

## Architecture

```
src/
├── main.ts              # bootstrap: game loop, wires modules
├── config.ts            # GameConfig defaults + tuning constants
├── core/                # Pure logic — no DOM, no canvas (unit-tested)
│   ├── types.ts
│   ├── board.ts         # well grid, gravity/compaction
│   ├── matcher.ts       # KLUX detection (H/V/diagonal), chain resolution
│   ├── paddle.ts        # stack model
│   ├── rng.ts           # seedable PRNG
│   ├── scoring.ts
│   ├── waves.ts         # wave/goal definitions + progression
│   └── game.ts          # GameState + pure step() reducer
├── input/               # Device → Command abstraction
│   ├── commands.ts      # Command union type (the contract)
│   ├── InputManager.ts
│   ├── KeyboardAdapter.ts
│   ├── TouchAdapter.ts
│   ├── PointerAdapter.ts
│   └── OnScreenControls.ts
├── render/
│   ├── Renderer.ts      # canvas setup, DPI, draw(state)
│   ├── layout.ts        # cell sizes + playfield geometry
│   ├── tiles.ts         # tile drawing + animations
│   └── effects.ts       # particles, screen shake
├── audio/
│   └── Audio.ts         # Web Audio SFX, autoplay unlock, mute
├── ui/
│   ├── Hud.ts           # score, drops, wave goal
│   └── Screens.ts       # title / pause / wave-clear / game-over
└── persistence/
    └── store.ts         # high scores + settings (localStorage)
```

**Core isolation rule:** nothing in `src/core/` imports from render, input, audio, ui, or persistence. The core runs in plain Node for tests.

## Build Phases

- [x] **Phase 1** — Scaffold: Vite + TS + ESLint + Vitest + canvas loop
- [x] **Phase 2** — Pure core + headless tests
- [x] **Phase 3** — Render static game state
- [x] **Phase 4** — Keyboard adapter + playable desktop game
- [x] **Phase 5** — Conveyor timing, waves, game-over
- [ ] **Phase 6** — Touch + on-screen controls
- [ ] **Phase 7** — Audio (synthesized SFX)
- [ ] **Phase 8** — Polish FX (particles, screen shake, colorblind cues)
- [ ] **Phase 9** — UI screens + persistence
- [ ] **Phase 10** — PWA + GitHub Pages deploy
- [ ] **Phase 11** — Perspective/pseudo-3D renderer (render-only swap; see §16 of SPEC.md)
- [ ] **Phase 12** — Global leaderboard (Cloudflare Worker + D1; see §16 of SPEC.md)

## Tech Stack

| Concern | Choice |
|---------|--------|
| Language | TypeScript (strict) |
| Build | Vite |
| Rendering | HTML5 Canvas 2D |
| Audio | Web Audio API |
| PWA | vite-plugin-pwa |
| Tests | Vitest |

## License

MIT
