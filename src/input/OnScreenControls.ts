import type { Command } from './commands';
import type { InputAdapter } from './InputAdapter';
import type { Phase } from '../core/types';


export class OnScreenControls implements InputAdapter {
  readonly id = 'onscreen';
  private emit: ((cmd: Command) => void) | null = null;
  private container: HTMLElement | null = null;
  private confirmBtn: HTMLButtonElement | null = null;
  private modePicker: HTMLElement | null = null;
  private gameControls: HTMLElement | null = null;

  isApplicable(): boolean {
    // Always attach — the mode picker on title / game-over is the only way to
    // choose a mode on touch devices, and a useful click target on desktop.
    // Game-play buttons (drop/flip/pause) are still hidden on desktop in update().
    return true;
  }

  private isTouchLike(): boolean {
    return navigator.maxTouchPoints > 0 || !matchMedia('(pointer: fine)').matches;
  }

  attach(emit: (cmd: Command) => void): void {
    this.emit = emit;
    this.container = this.build();
    document.getElementById('app')?.appendChild(this.container);
  }

  detach(): void {
    this.container?.remove();
    this.container = null;
    this.emit = null;
  }

  /** Call each frame so the control set reflects the current game phase. */
  update(phase: Phase): void {
    if (!this.container) return;
    const playing = phase === 'playing' || phase === 'paused';
    const pickMode = phase === 'title' || phase === 'gameOver';
    const showGameControls = playing && this.isTouchLike();
    // Hide the whole bar on desktop during gameplay to free up canvas room.
    const anyVisible = pickMode || (phase === 'waveClear') || showGameControls;

    this.container.style.display = anyVisible ? '' : 'none';
    this.gameControls!.style.display = showGameControls ? '' : 'none';
    this.modePicker!.style.display = pickMode ? '' : 'none';
    this.confirmBtn!.style.display = phase === 'waveClear' ? '' : 'none';
  }

  private build(): HTMLElement {
    const c = document.createElement('div');
    c.id = 'osc';

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
