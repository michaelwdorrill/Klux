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

Each wave has a goal on the arcade-faithful 5-cycle: **KLUX → DIAGONAL → SURVIVE → POINTS → HORIZONTAL**, with targets scaling each cycle. Clear the goal to advance. You have 3 drops — miss tiles or overfill columns and you lose one. Lose all 3 and it's game over.

**Two modes:**
- **Classic** — pause between waves, see your next goal, auto-advance
- **Endless** — no breaks, waves and tempo keep escalating until you die

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

### Regenerate PWA icons
```bash
npm run icons
```
Outputs to `public/icons/` (192, 512, maskable 512, apple-touch 180, source SVG).

### Deploy (GitHub Pages)
Push to `main` — `.github/workflows/deploy.yml` runs tests, builds, and ships
the `dist/` artifact to GitHub Pages via the official `actions/deploy-pages`
flow. **One-time setup:** in the repo's *Settings → Pages*, set *Source* to
*GitHub Actions*.

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
- [x] **Phase 6** — Touch + on-screen controls
- [x] **Phase 7** — Audio (synthesized SFX)
- [x] **Phase 8** — Polish FX (particles, screen shake, score popups, foul flash)
- [x] **Phase 9** — UI screens + persistence (mode picker, per-mode high scores, persisted mute)
- [x] **Phase 10** — PWA + GitHub Pages deploy (icons, manifest, Workbox precache, CI workflow)
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
