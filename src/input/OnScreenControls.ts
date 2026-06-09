import type { Command } from './commands';
import type { InputAdapter } from './InputAdapter';
import type { Phase, GameMode } from '../core/types';


export class OnScreenControls implements InputAdapter {
  readonly id = 'onscreen';
  private emit: ((cmd: Command) => void) | null = null;
  private container: HTMLElement | null = null;
  private confirmBtn: HTMLButtonElement | null = null;
  private modePicker: HTMLElement | null = null;
  private gameControls: HTMLElement | null = null;
  private fireBtn: HTMLButtonElement | null = null;
  private muteBtn: HTMLButtonElement | null = null;
  private onMuteToggle: (() => boolean) | null = null;
  private onVsOpen: (() => void) | null = null;

  setVsHandler(fn: () => void): void { this.onVsOpen = fn; }

  /** Caller wires a mute-toggle handler that returns the new muted state
   *  (so the button can render the correct icon). */
  setMuteHandler(fn: () => boolean): void { this.onMuteToggle = fn; }

  /** Sync the mute icon to the current state (call when settings change externally). */
  setMuteState(muted: boolean): void {
    if (this.muteBtn) this.muteBtn.textContent = muted ? '🔇' : '🔊';
  }

  isApplicable(): boolean {
    // Always attach — the mode picker on title / game-over is the only way to
    // choose a mode on touch devices, and a useful click target on desktop.
    // Game-play buttons (drop/flip/pause) are still hidden on desktop in update().
    return true;
  }

  private isTouchLike(): boolean {
    // True on phones/tablets (primary input is touch, no mouse hover).
    // Touch-screen laptops match maxTouchPoints > 0 but also have a fine
    // pointer (mouse), so the combined check excludes them.
    return matchMedia('(hover: none) and (pointer: coarse)').matches;
  }

  attach(emit: (cmd: Command) => void): void {
    this.emit = emit;
    this.container = this.build();
    document.getElementById('app')?.appendChild(this.container);
  }

  detach(): void {
    this.container?.remove();
    this.muteBtn?.remove();
    this.container = null;
    this.muteBtn = null;
    this.emit = null;
  }

  /** Call each frame so the control set reflects the current game phase. */
  update(phase: Phase, mode: GameMode = 'classic', powerMeter = 0): void {
    if (!this.container) return;
    const playing    = phase === 'playing' || phase === 'paused';
    const pickMode   = phase === 'title' || phase === 'gameOver';
    const showGame   = playing && this.isTouchLike();
    const anyVisible = pickMode || phase === 'waveClear' || showGame;

    this.container.style.display  = anyVisible ? '' : 'none';
    this.gameControls!.style.display = showGame    ? '' : 'none';
    this.modePicker!.style.display   = pickMode    ? '' : 'none';
    this.confirmBtn!.style.display   = phase === 'waveClear' ? '' : 'none';

    // FIRE button: visible during VS gameplay when meter is charged
    if (this.fireBtn) {
      const level = powerMeter >= 6000 ? 4 : powerMeter >= 4500 ? 3 : powerMeter >= 3000 ? 2 : powerMeter >= 1500 ? 1 : 0;
      const show  = showGame && mode === 'versus' && level > 0;
      this.fireBtn.style.display = show ? '' : 'none';
      if (show) this.fireBtn.textContent = `⚡ LV${level}`;
    }
  }

  private build(): HTMLElement {
    const c = document.createElement('div');
    c.id = 'osc';

    // Floating mute button — always visible, top-right of canvas area
    const muteBtn = document.createElement('button');
    muteBtn.id = 'osc-mute';
    muteBtn.className = 'osc-mute';
    muteBtn.textContent = '🔊';
    muteBtn.setAttribute('aria-label', 'Toggle mute');
    this.muteBtn = muteBtn;
    muteBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.onMuteToggle) this.setMuteState(this.onMuteToggle());
    });
    document.getElementById('app')?.appendChild(muteBtn);

    // Confirm button (only used for waveClear "NEXT WAVE")
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'osc-btn osc-confirm';
    confirmBtn.textContent = 'NEXT WAVE ▶';
    confirmBtn.setAttribute('aria-label', 'Continue');
    this.confirmBtn = confirmBtn;

    // Mode picker — title and gameOver
    const mp = document.createElement('div');
    mp.className = 'osc-mode-picker';
    mp.innerHTML = `
      <button class="osc-btn osc-mode" data-cmd="START_CLASSIC" aria-label="Classic mode">CLASSIC</button>
      <button class="osc-btn osc-mode" data-cmd="START_ENDLESS" aria-label="Endless mode">ENDLESS</button>
    `;
    // VS button — triggers the lobby overlay, not a direct game command
    const vsBtn = document.createElement('button');
    vsBtn.className = 'osc-btn osc-mode';
    vsBtn.textContent = 'VS ⚔';
    vsBtn.setAttribute('aria-label', 'Versus mode');
    vsBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onVsOpen?.();
    });
    mp.appendChild(vsBtn);
    this.modePicker = mp;

    // Game controls (playing / paused)
    const gc = document.createElement('div');
    gc.className = 'osc-game-controls';
    gc.innerHTML = `
      <div class="osc-row">
        <button class="osc-btn osc-nav" data-cmd="MOVE_LEFT"    aria-label="Move left">◀</button>
        <button class="osc-btn osc-nav osc-flip" data-cmd="FLIP" aria-label="Flip tile">▲ FLIP</button>
        <button class="osc-btn osc-nav" data-cmd="MOVE_RIGHT"   aria-label="Move right">▶</button>
      </div>
      <div class="osc-row">
        <button class="osc-btn osc-drop" data-cmd="DROP"         aria-label="Drop tile">▼ DROP</button>
        <button class="osc-btn osc-pause" data-cmd="PAUSE_TOGGLE" aria-label="Pause">⏸</button>
      </div>
    `;
    // FIRE button — VS only, shown/hidden by update()
    const fireBtn = document.createElement('button');
    fireBtn.className = 'osc-btn osc-fire';
    fireBtn.dataset['cmd'] = 'FIRE_POWER';
    fireBtn.textContent = '⚡ LV1';
    fireBtn.style.display = 'none';
    fireBtn.setAttribute('aria-label', 'Fire power');
    gc.appendChild(fireBtn);
    this.fireBtn = fireBtn;

    this.gameControls = gc;

    c.appendChild(confirmBtn);
    c.appendChild(mp);
    c.appendChild(gc);

    c.addEventListener('pointerdown', (e) => {
      if (!this.emit) return;
      e.preventDefault();

      const btn = (e.target as HTMLElement).closest('[data-cmd], .osc-confirm') as HTMLElement | null;
      if (!btn) return;

      if (btn.classList.contains('osc-confirm')) {
        this.emit({ type: 'CONFIRM' });
        return;
      }
      const type = btn.dataset['cmd'] as Command['type'];
      if (type) this.emit({ type } as Command);
    });

    return c;
  }
}
