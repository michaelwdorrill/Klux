import type { Command } from './commands';
import type { InputAdapter } from './InputAdapter';
import type { Phase } from '../core/types';


export class OnScreenControls implements InputAdapter {
  readonly id = 'onscreen';
  private emit: ((cmd: Command) => void) | null = null;
  private container: HTMLElement | null = null;
  private confirmBtn: HTMLButtonElement | null = null;
  private gameControls: HTMLElement | null = null;

  isApplicable(): boolean {
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
    this.gameControls!.style.display = playing ? '' : 'none';
    this.confirmBtn!.style.display = playing ? 'none' : '';
    this.confirmBtn!.textContent = confirmLabel(phase);
  }

  private build(): HTMLElement {
    const c = document.createElement('div');
    c.id = 'osc';

    // Confirm button (title / wave-clear / game-over)
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'osc-btn osc-confirm';
    confirmBtn.textContent = 'TAP TO PLAY';
    confirmBtn.setAttribute('aria-label', 'Confirm');
    this.confirmBtn = confirmBtn;

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
    c.appendChild(gc);

    // Single delegated handler for all buttons
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

function confirmLabel(phase: Phase): string {
  if (phase === 'title')     return 'TAP TO PLAY';
  if (phase === 'waveClear') return 'NEXT WAVE ▶';
  if (phase === 'gameOver')  return 'PLAY AGAIN';
  return 'CONTINUE';
}
