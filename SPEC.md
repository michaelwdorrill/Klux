# Build Spec: "KLUX" — a Klax-inspired tile game (web, desktop + mobile)

> **Purpose of this document.** This is a self-contained instruction set for Claude Code to
> build a complete, playable, single-codebase web game that runs equally well as a desktop web
> app (keyboard/mouse) and a mobile web app (touch), installable as a PWA. It is written to be
> dropped into an empty repository and worked through phase by phase. Read the whole spec before
> writing any code; later sections constrain earlier ones.

---

## 0. Naming and IP (read first)

"Klax" is a trademark of Atari, and the original tile art/sounds are copyrighted. **Do not copy
Atari's name, logo, tile graphics, or audio.** Build an original, *Klax-inspired* game:

- Working title: **KLUX** .
- All art is generated programmatically or drawn fresh (flat vector tiles, original palette).
- All audio is synthesized via the Web Audio API or uses original/CC0 samples.
- It is fine to replicate *game mechanics* — mechanics are not copyrightable — but not the
  presentation or branding.

If the user later wants the literal Klax look, flag it and stop; that's an IP decision, not an
engineering one.

---

## 1. Goals and non-goals

### Goals
1. **One codebase, one URL, two (or more) control schemes.** The same deployed site detects
   device capabilities and adapts; it is never two separate builds.
2. **Faithful Klax mechanics** (see §3) — conveyor of falling tiles, a movable paddle that holds
   a stack, a 5-column well, matches of 3+ ("Klaxes") that clear, wave goals, and a drop/life
   budget.
3. **Responsive layout** — portrait-first on phones, landscape/windowed on desktop, with the
   playfield scaling crisply on any DPI.
4. **Installable PWA** — works offline, has a manifest + icons, "Add to Home Screen" works.
5. **Deterministic, testable core** — game logic is pure and unit-tested independently of
   rendering and input.

### Non-goals (for v1)
- No backend, no accounts, no online leaderboard (high scores are local only).
- No multiplayer.
- No level editor.
- No 3D/perspective rendering — use a clean top-down/orthographic 2D presentation.

---

## 2. Tech stack (recommended)

Use a **lightweight, framework-light** stack. A tile game is a tight render loop, not a DOM app,
so a heavy UI framework adds cost without benefit.

| Concern | Choice | Why |
|---|---|---|
| Language | **TypeScript** (strict) | Types make the game model and the input contracts self-documenting and refactor-safe. |
| Build/dev server | **Vite** | Fast HMR, zero-config TS, trivial static build for any host. |
| Rendering | **HTML5 Canvas 2D** | One canvas, full control of scaling/DPI, no per-tile DOM. Sufficient for flat tiles + particles. |
| State | Plain TS classes/objects | The model is small; no Redux/etc. needed. |
| Audio | **Web Audio API** | Synthesize SFX; handle mobile autoplay-unlock correctly. |
| PWA | **vite-plugin-pwa** (Workbox under the hood) | Manifest + service worker + offline precache with minimal config. |
| Tests | **Vitest** | Same toolchain as Vite; fast; runs the pure core in Node. |
| Lint/format | ESLint + Prettier | Keep it boring and consistent. |

**Acceptable alternative:** Phaser 3 if the user prefers a batteries-included game engine. It
brings its own scene/input/audio systems, which would *replace* much of §6–§9 below. Default to
the vanilla-Canvas approach unless the user asks otherwise; it keeps the input-abstraction layer
(the whole point of this spec) explicit and under our control.

**Do not** use `localStorage`/`sessionStorage` inside any sandboxed preview environment, but in
this *real, deployed* project `localStorage` is the correct place for high scores and settings
(§11). (This caveat only matters if code is ever pasted into a restricted artifact sandbox.)

---

## 3. Game mechanics reference (authoritative)

Implement exactly this model. Where the original arcade values are fuzzy, the spec gives a
**configurable default**; expose every such value in a single `GameConfig` object (§5) so the
game is tunable without touching logic.

### 3.1 The board

```
        [conveyor: N lanes, tiles slide down toward the player]
                    │ │ │ │ │
                  ┌─┴─┴─┴─┴─┴─┐
                  │  paddle    │   ← moves across the lanes; holds a stack of up to 5 tiles
                  └────────────┘
                  ┌─┬─┬─┬─┬─┬─┐
                  │ │ │ │ │ │ │   ← the WELL: 5 columns × 5 rows (default), fills bottom-up
                  └─┴─┴─┴─┴─┴─┘
```

- **Lanes / columns:** `cols = 5` (configurable 3–8). Conveyor lanes align 1:1 with well columns.
- **Well height:** `rows = 5` (configurable).
- **Tile colors:** `colorCount = 5` (configurable 3–8; raise to increase difficulty).

### 3.2 The conveyor

- Tiles spawn at the top of a random lane on a timer and slide toward the paddle lip over
  `tileTravelMs` (decreases as the wave progresses — see §3.7).
- When a tile reaches the lip in lane *L*:
  - If the paddle is at lane *L* **and** the paddle stack has < 5 tiles → the tile is **caught**
    onto the top of the paddle stack.
  - Otherwise → the tile **falls off** → counts as a **drop** (see §3.6).

### 3.3 The paddle

- Holds a **LIFO stack** of up to `paddleCapacity = 5` tiles. The most-recently-caught tile is
  on top.
- Moves left/right one lane per command, clamped to `[0, cols-1]`. (Touch may also move it
  *directly* to a tapped lane — see §7.)
- Paddle actions:
  - **DROP** — release the **top** tile of the paddle stack into the well column at the paddle's
    current lane. The tile lands on top of that column's contents.
    - If that column is **full** (`rows` tiles already) → this is a **foul**: costs one drop
      (§3.6). Do *not* silently no-op; the failure must be legible to the player.
    - If the paddle stack is empty → no-op (and a soft "denied" cue).
  - **FLIP** — throw the **top** tile of the paddle stack back **up the conveyor** in the current
    lane (it re-enters as a fresh sliding tile). Used to reposition or buy time. No-op if stack
    empty.

### 3.4 Klaxes (matches)

A **Klax** is a run of **3 or more** same-colored tiles in a straight line within the well:
- **horizontal** (along a row),
- **vertical** (up a column),
- **diagonal** (both diagonals).

Matching rules:
- Evaluate matches **after every well change** (after a DROP and after gravity settles).
- A single tile may participate in multiple simultaneous Klaxes (an L/T/X shape) — count each
  distinct line.
- All tiles in all detected Klaxes clear **simultaneously** in one resolution step.

### 3.5 Gravity and chains

- After tiles clear, every column **compacts downward** (tiles above the gap fall to fill it).
- Re-run match detection on the settled board. If new Klaxes formed, clear again → this is a
  **chain**. Continue until no matches remain. Chains award escalating bonuses (§3.8).

### 3.6 Drops / lives

- The player has a budget of **`maxDrops = 3`** (configurable). A "drop" is consumed when:
  - a tile falls off the lip uncaught (§3.2), or
  - a foul DROP into a full column (§3.3).
- When drops remaining hits 0 on the next infraction → **game over**.
- Display drops remaining prominently.

### 3.7 Waves (levels) and speed

- The game is a sequence of **waves**. Each wave has a **goal** (§3.9) and a starting speed.
- Within a wave, difficulty ramps: `tileTravelMs` decreases and/or spawn interval shortens as
  more tiles are fed. Use a smooth curve, e.g.:
  ```
  tileTravelMs(t) = max(minTravel, baseTravel - rampPerTile * tilesFedThisWave)
  spawnIntervalMs   = clamp(baseSpawn - waveIndex * spawnStep, minSpawn, baseSpawn)
  ```
  Tune constants in `GameConfig`; expose them so play-feel can be adjusted without code edits.
- Completing a wave's goal → brief "wave clear" screen → next wave (faster, possibly more colors).

### 3.8 / 3.9 Goals and scoring

**Goal types** (each wave picks one, with a target number):
- `SCORE` — reach N points this wave.
- `KLAXES` — make N Klaxes (any orientation).
- `HORIZONTALS` — make N horizontal Klaxes.
- `DIAGONALS` — make N diagonal Klaxes.
- `SURVIVE` — process N tiles without running out of drops.

**Scoring table** (defaults; configurable):

| Event | Points |
|---|---|
| Horizontal Klax (3) | 1000 |
| Vertical Klax (3) | 1000 |
| Diagonal Klax (3) | 5000 |
| Each extra tile in a run beyond 3 (4th, 5th…) | +1000 each |
| Big Klax (a run of 5) | +5000 bonus |
| Multi-Klax (≥2 Klaxes from one drop) | ×(number of Klaxes) multiplier on that resolution |
| Chain step *k* (k = 2,3,…) | ×k multiplier on that step |
| Wave-clear bonus | (drops remaining) × 1000 |

Diagonals score higher than orthogonals because they're harder to set up — preserve that
relationship even if exact numbers are retuned.

---

## 4. Project structure

```
klux/
├─ index.html
├─ package.json
├─ tsconfig.json            # strict: true
├─ vite.config.ts           # + vite-plugin-pwa
├─ public/
│  ├─ icons/                # PWA icons: 192, 512, maskable
│  └─ manifest.webmanifest  # (or generated by the plugin)
├─ src/
│  ├─ main.ts               # bootstrap: build config, wire modules, start loop
│  ├─ config.ts             # GameConfig defaults + difficulty presets
│  ├─ core/                 # PURE logic — no DOM, no canvas, no window. Unit-tested.
│  │  ├─ types.ts
│  │  ├─ board.ts           # well grid ops, gravity/compaction
│  │  ├─ matcher.ts         # Klax detection (H/V/diag), chain resolution
│  │  ├─ paddle.ts          # stack model
│  │  ├─ rng.ts             # seedable PRNG (for deterministic tests/replays)
│  │  ├─ scoring.ts
│  │  ├─ waves.ts           # wave/goal definitions + progression
│  │  └─ game.ts            # GameState + reducer: applies Commands, advances time
│  ├─ input/                # the abstraction layer — see §7
│  │  ├─ commands.ts        # the Command union (the contract)
│  │  ├─ InputManager.ts    # owns active adapters, fans events into a command queue
│  │  ├─ KeyboardAdapter.ts
│  │  ├─ TouchAdapter.ts
│  │  ├─ PointerAdapter.ts  # mouse / trackpad / stylus
│  │  └─ OnScreenControls.ts# DOM buttons for touch fallback
│  ├─ render/
│  │  ├─ Renderer.ts        # canvas setup, DPI/resize, draw(state)
│  │  ├─ layout.ts          # computes cell sizes & origins for current viewport
│  │  ├─ tiles.ts           # tile drawing (color, shape, caught/falling anim)
│  │  └─ effects.ts         # clear particles, chain flashes, screen shake
│  ├─ audio/
│  │  └─ Audio.ts           # Web Audio synth SFX + mute + autoplay unlock
│  ├─ ui/
│  │  ├─ Hud.ts             # score, drops, wave goal progress
│  │  └─ Screens.ts         # title / pause / wave-clear / game-over overlays
│  └─ persistence/
│     └─ store.ts           # high scores + settings (localStorage, with safe fallback)
└─ tests/
   ├─ matcher.test.ts
   ├─ gravity.test.ts
   ├─ scoring.test.ts
   └─ game.test.ts
```

**Hard rule:** nothing in `src/core/**` may import from `render`, `input`, `audio`, `ui`,
`persistence`, or touch `window`/`document`. The core must run in plain Node for tests.

---

## 5. Core data model (`src/core/types.ts`)

Implement these (adjust names for taste, keep the shapes):

```ts
export type Color = number; // 0..colorCount-1

export interface GameConfig {
  cols: number;            // default 5
  rows: number;            // default 5
  colorCount: number;      // default 5
  paddleCapacity: number;  // default 5
  maxDrops: number;        // default 3
  minRun: number;          // default 3 (tiles in a row to make a Klax)

  baseTravelMs: number;    // tile lane-travel time at wave start
  minTravelMs: number;
  rampPerTile: number;
  baseSpawnMs: number;
  minSpawnMs: number;
  spawnStepPerWave: number;

  scoring: ScoringConfig;
  seed?: number;           // for deterministic runs
}

export interface Tile { id: number; color: Color; }

export type Cell = Tile | null;
export type Well = Cell[][];           // well[row][col]; row 0 = bottom

export interface FallingTile {
  tile: Tile;
  lane: number;            // 0..cols-1
  progress: number;        // 0 (top) → 1 (at lip)
}

export type GoalType = 'SCORE' | 'KLAXES' | 'HORIZONTALS' | 'DIAGONALS' | 'SURVIVE';
export interface Wave { index: number; goal: GoalType; target: number; }

export type Phase = 'title' | 'playing' | 'waveClear' | 'paused' | 'gameOver';

export interface GameState {
  config: GameConfig;
  phase: Phase;
  well: Well;
  paddle: Tile[];          // index 0 = bottom of stack, last = top
  paddleLane: number;
  conveyor: FallingTile[];
  score: number;
  dropsRemaining: number;
  wave: Wave;
  waveProgress: number;    // toward goal.target
  tilesFedThisWave: number;
  rng: RngState;
  // transient FX hints for the renderer (cleared each frame after draw):
  fx: { clears: ClearEvent[]; chainStep: number; lastFoul?: 'fullColumn' | 'missed'; };
}
```

The reducer in `game.ts` is the single source of truth:

```ts
// Pure: same (state, input) → same next state. No I/O.
export function step(state: GameState, dtMs: number, commands: Command[]): GameState;
```

`step` (1) applies queued commands, (2) advances conveyor by `dtMs`, (3) resolves catches/misses,
(4) on DROP runs matcher → gravity → chain loop, (5) updates score/goal/phase. Everything the
renderer needs is read off the returned `GameState`.

---

## 6. Game loop (`src/main.ts`)

Use a **fixed-timestep accumulator** so physics/speed are framerate-independent (a 144 Hz desktop
and a throttled phone must play identically):

```ts
const FIXED_MS = 1000 / 60;
let acc = 0, last = performance.now();

function frame(now: number) {
  acc += Math.min(now - last, 250); // clamp to avoid spiral-of-death after tab-away
  last = now;
  while (acc >= FIXED_MS) {
    const commands = input.drain();       // pull queued semantic commands
    state = step(state, FIXED_MS, commands);
    acc -= FIXED_MS;
  }
  renderer.draw(state, acc / FIXED_MS);   // pass interpolation alpha for smooth tiles
  audio.consume(state.fx);                // play SFX for this frame's events
  state.fx.clears.length = 0;             // clear transient FX after consumption
  requestAnimationFrame(frame);
}
```

Pause on `visibilitychange` (tab hidden) and on the pause screen.

---

## 7. Input abstraction — THE CENTRAL DESIGN

This is the part that makes "same site, multiple control schemes" work. The principle:

> **Raw device events → adapters → a single `Command` queue → the game reducer.**
> The game model has *no idea* whether a DROP came from the Down-arrow, a swipe, or a button.
> The renderer has no idea either. Devices are plug-ins.

### 7.1 The contract (`src/input/commands.ts`)

```ts
export type Command =
  | { type: 'MOVE_LEFT' }
  | { type: 'MOVE_RIGHT' }
  | { type: 'MOVE_TO'; lane: number }   // absolute — natural for touch/mouse
  | { type: 'DROP' }
  | { type: 'FLIP' }
  | { type: 'PAUSE_TOGGLE' }
  | { type: 'CONFIRM' };                // start game / advance wave / restart
```

Everything the player can do is one of these. Adding a control scheme = adding an adapter that
emits these. Changing key bindings never touches game logic.

### 7.2 The adapter interface

```ts
export interface InputAdapter {
  readonly id: string;
  attach(emit: (cmd: Command) => void): void;  // wire DOM listeners
  detach(): void;                                // remove them
  isApplicable(): boolean;                       // capability check (NOT user-agent sniffing)
}
```

### 7.3 InputManager

- Holds an internal **command queue**; `drain()` returns and clears it each fixed step.
- Activates **all applicable adapters simultaneously** — do not gate by device type. A Surface or
  a touchscreen laptop should accept keyboard *and* touch; a desktop with a mouse should accept
  keyboard *and* pointer. Capability detection decides which adapters *attach*, never an exclusive
  either/or. This also makes desktop testing of the touch UI trivial.
- Detects capabilities via feature/media queries, re-evaluated on change:
  - touch available: `matchMedia('(pointer: coarse)')` or `navigator.maxTouchPoints > 0`
  - fine pointer: `matchMedia('(pointer: fine)')`
  - keyboard: assume present on non-coarse-only devices; also attach if any `keydown` is ever seen.
- Drives layout hints (§8): which on-screen controls to show, where the playfield sits.

### 7.4 KeyboardAdapter (desktop primary)

| Key | Command |
|---|---|
| ← / A | `MOVE_LEFT` |
| → / D | `MOVE_RIGHT` |
| ↓ / Space | `DROP` |
| ↑ / W | `FLIP` |
| P / Esc | `PAUSE_TOGGLE` |
| Enter | `CONFIRM` |

- Use `keydown` with `event.repeat` allowed for movement (held-key auto-repeat for paddle
  sliding feels right), but **suppress repeat for DROP/FLIP** (one action per press).
- `preventDefault()` on arrows/space so the page doesn't scroll.

### 7.5 TouchAdapter (mobile primary)

Support **two coexisting touch idioms** (pick via a settings toggle; default = direct):

1. **Direct tap (default):** tap a column → `MOVE_TO {lane}`. Tap on the paddle/well column the
   paddle is in → `DROP`. Two-finger tap or a dedicated FLIP button → `FLIP`.
2. **Gestures:** horizontal swipe → `MOVE_LEFT`/`MOVE_RIGHT` per swipe; swipe **down** → `DROP`;
   swipe **up** → `FLIP`; long-press → `PAUSE_TOGGLE`.

Implementation notes:
- Listen with `{ passive: false }` and `preventDefault()` to stop scroll/zoom/pull-to-refresh on
  the play surface; add `touch-action: none` CSS to the canvas and `user-select: none`.
- Disambiguate tap vs swipe with a movement threshold (~12px) and a time threshold (~200ms).
- Map touch coordinates to lanes through `layout.ts` (single source of geometry — never duplicate
  the math).
- Add CSS `env(safe-area-inset-*)` padding so controls clear notches and the home indicator.

### 7.6 OnScreenControls (touch fallback / discoverability)

Render large DOM buttons (not canvas-drawn) below/around the playfield in portrait: **◀  FLIP  ▶**
on one row and a big **DROP** button, plus **⏸**. These emit the same Commands. They guarantee a
usable scheme even if gestures confuse the player, and they're keyboard/screen-reader focusable
for basic accessibility. Hide them when only a fine pointer + keyboard are present (toggleable).

### 7.7 PointerAdapter (mouse/trackpad)

- Hovering a column highlights it; click a column → `MOVE_TO {lane}` then `DROP` (or click = move,
  right-click = drop — pick one and document it). Scroll wheel up → `FLIP`. Optional; keyboard is
  the desktop primary, so keep this thin.

**Net effect:** to add (say) gamepad support later, write a `GamepadAdapter` emitting the same
`Command`s and register it. Zero changes to `core/`, `render/`, or `ui/`.

---

## 8. Responsive layout & rendering (`src/render/`)

### 8.1 One canvas, correct DPI

```ts
function resize(canvas: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
  canvas.width  = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels, render at device pixels → crisp
}
```
Re-run on `resize` and `orientationchange`.

### 8.2 Two orientations, one geometry function

`layout.ts` computes cell size + playfield origin from the available CSS box and current
orientation. **Both the renderer and the TouchAdapter must call the same `layout()`** so a tapped
pixel maps to the same lane that's drawn there.

- **Portrait (phones):** playfield centered and tall; conveyor + paddle + well stacked
  vertically; on-screen controls pinned to the bottom inside the safe area.
- **Landscape / desktop windowed:** playfield centered with comfortable margins; HUD to the side;
  on-screen controls hidden by default (keyboard drives it).
- Maintain the field's aspect ratio with letterboxing rather than stretching tiles.

### 8.3 Drawing

- Tiles: flat rounded-rect with a distinct **hue + secondary cue** (small icon/pattern per color)
  so it's colorblind-friendly — never rely on hue alone.
- Animate: tiles sliding the conveyor (interpolate with the loop's alpha), catching (small
  squash), dropping into the well, clearing (particle burst from `effects.ts`), chains (flash +
  light screen shake scaled to chain depth).
- Keep a consistent palette in `config.ts`; expose a high-contrast theme toggle.

---

## 9. Audio (`src/audio/Audio.ts`)

- Synthesize SFX with Web Audio oscillators/noise: catch (short blip), drop (thud), Klax (rising
  arpeggio), chain (pitch climbs per step), foul (buzz), wave-clear (jingle).
- **Mobile autoplay unlock:** create/resume the `AudioContext` on the **first user gesture**
  (first pointerdown/keydown). Until then, stay silent; never throw.
- Global mute toggle persisted in settings; respect `prefers-reduced-motion` for screen shake.

---

## 10. UI / screens (`src/ui/`)

- **Title:** name, Play (`CONFIRM`), settings (control idiom, mute, high-contrast), best score.
- **HUD (in-game):** score, drops remaining (as icons), current wave + goal text + progress
  (e.g., "Diagonals 2 / 4").
- **Pause:** resume / restart / quit to title. Reachable by `PAUSE_TOGGLE` and the ⏸ button.
- **Wave clear:** goal met, bonus tally, "Next" (`CONFIRM`).
- **Game over:** final score, new-best indicator, restart (`CONFIRM`).

All overlays are DOM (easier text/focus/accessibility) layered over the canvas, and all
advance via the same `CONFIRM` command so every input scheme can navigate menus.

---

## 11. Persistence (`src/persistence/store.ts`)

- Store `bestScore`, settings (control idiom, mute, contrast) in `localStorage` under a single
  namespaced key (e.g., `klux.v1`). JSON-serialize one object.
- **Wrap every access in try/catch** (Safari private mode / sandboxes can throw) and fall back to
  an in-memory object so the game never crashes on storage failure.
- Version the schema (`v1`) so future migrations are clean.

---

## 12. PWA (installable, offline)

- Configure `vite-plugin-pwa` with `registerType: 'autoUpdate'`, precache the built assets.
- `manifest.webmanifest`: name, short_name, `display: 'standalone'`, `orientation: 'any'`,
  theme/background colors, and **192 / 512 / maskable** icons in `public/icons/`.
- Verify: Lighthouse PWA checks pass; "Add to Home Screen" works on Android Chrome and iOS Safari;
  the game loads with no network after first visit.

---

## 13. Testing (`tests/`, Vitest)

Because the core is pure, test it directly with hand-built boards:

- **matcher.test.ts:** horizontal/vertical/both-diagonal detection at edges/corners; a tile in two
  lines counted twice; no false positive on runs of 2.
- **gravity.test.ts:** compaction after a mid-column clear; multi-gap columns settle correctly.
- **scoring.test.ts:** diagonal > orthogonal; multi-Klax multiplier; chain multipliers escalate.
- **game.test.ts (integration of the reducer):** seeded RNG → feed a scripted `Command[]` and
  assert deterministic end state; catching fills the paddle; full-column DROP costs a drop;
  missed tile costs a drop; drops==0 → `gameOver`; wave goal met → `waveClear`.

Target meaningful coverage of `core/`; rendering/input/audio are validated manually + by the
acceptance checklist (§15).

---

## 14. Build order for Claude Code (phased — commit per phase)

Work strictly in this order. Each phase ends in a committable, runnable state.

1. **Scaffold.** Vite + TS (strict) + ESLint/Prettier + Vitest. Blank canvas filling the
   viewport, fixed-timestep loop drawing a placeholder. Verify HMR and the resize/DPI handling.
2. **Pure core, headless.** `types`, `rng`, `board`, `matcher`, `paddle`, `scoring`, `waves`,
   `game.step`. Write §13 tests first or alongside. No rendering yet — prove it in Node.
3. **Render the state.** `layout` + `Renderer` draw a *static* `GameState` (well, paddle,
   conveyor) for both a portrait and a landscape test viewport.
4. **Keyboard adapter + command queue.** Wire `InputManager` → `KeyboardAdapter` → `game.step`.
   Fully playable on desktop with the keyboard. This is the first "real game" milestone.
5. **Conveyor timing & waves.** Spawning, speed ramp, catches/misses, drops budget, wave
   goals + progression, game-over. Tune `GameConfig` for feel.
6. **Touch + on-screen controls.** `TouchAdapter` (direct + gesture idioms), `OnScreenControls`,
   portrait layout, safe areas, `touch-action: none`. Test on a real phone or device emulation.
   Confirm keyboard and touch both work in the same build with no branching in game logic.
7. **Audio.** Synth SFX, autoplay unlock, mute. **`prefers-reduced-motion`** respected.
8. **Polish FX.** Catch/drop/clear/chain animations, particles, screen shake, colorblind cues,
   high-contrast theme.
9. **UI screens + persistence.** Title/pause/wave-clear/game-over, settings, best score in
   `localStorage` with safe fallback.
10. **PWA + ship.** Manifest, icons, service worker, offline verification, Lighthouse pass.
11. **PointerAdapter (optional)** and any stretch goals (§16).

---

## 15. Definition of done (acceptance checklist)

- [ ] Single URL; loads on desktop and mobile with no separate builds.
- [ ] **Desktop:** fully playable with keyboard only; arrows + space/up/enter/esc behave per §7.4;
      arrows don't scroll the page.
- [ ] **Mobile:** fully playable by touch only; direct-tap *and* gesture idioms both work; nothing
      scrolls/zooms during play; controls clear the notch/home indicator.
- [ ] Both input schemes are **active in the same session** where the device supports both, with
      zero device-type branching inside `core/` or `render/`.
- [ ] Klaxes detect H/V/diagonal; gravity + chains resolve; scoring matches §3.8 relationships.
- [ ] Drops budget, fouls (full-column drop, missed tile), and game-over all work.
- [ ] Waves progress with the correct goal types and increasing speed.
- [ ] Identical play feel at 30/60/144 Hz (fixed timestep verified).
- [ ] Crisp on HiDPI; correct on portrait and landscape; survives resize/rotate mid-game.
- [ ] Audio unlocks on first gesture; mute works; reduced-motion respected.
- [ ] PWA installs and runs offline; Lighthouse PWA checks pass.
- [ ] `core/` unit tests pass and contain no DOM/window references.
- [ ] No copyrighted Atari/Klax assets or branding anywhere.

---

## 16. Stretch goals (out of scope for v1, design so they're easy)

- Gamepad adapter (drop-in per §7.7's pattern).
- Seeded "daily challenge" (the `rng` seed already supports this) + shareable result string.
- Replay capture (record the `Command[]` + seed; the pure reducer makes replays exact).
- Difficulty presets and an endless mode.
- Online leaderboard (would introduce a backend — flag as a separate decision).

---

## 17. Conventions for Claude Code

- TypeScript **strict**; no `any` in `core/`.
- `core/` stays pure and import-isolated (enforce with an ESLint `no-restricted-imports` rule
  banning `render/`, `input/`, `audio/`, `ui/`, `persistence/`, and `window`/`document` usage
  inside `core/`).
- Small, focused commits matching the §14 phases; each phase must `build` and `test` green.
- Put all tunable numbers in `config.ts` — no magic numbers buried in logic.
- Prefer clarity over cleverness in the render loop; profile before optimizing.
