import type { Command } from './commands';
import type { InputAdapter } from './InputAdapter';

// Keys that should suppress the browser's default scroll/page behaviour
const PREVENT_DEFAULT_KEYS = new Set([
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ',
]);

// Keys where held-down auto-repeat is intentional (paddle sliding)
const ALLOW_REPEAT = new Set(['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD']);

export class KeyboardAdapter implements InputAdapter {
  readonly id = 'keyboard';
  private emit: ((cmd: Command) => void) | null = null;
  private readonly handler: (e: KeyboardEvent) => void;

  constructor() {
    this.handler = (e: KeyboardEvent) => this.onKeyDown(e);
  }

  isApplicable(): boolean {
    return true; // always attach; keyboard may exist on any device
  }

  attach(emit: (cmd: Command) => void): void {
    this.emit = emit;
    window.addEventListener('keydown', this.handler);
  }

  detach(): void {
    window.removeEventListener('keydown', this.handler);
    this.emit = null;
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (!this.emit) return;
    if (e.repeat && !ALLOW_REPEAT.has(e.code)) return;

    const cmd = this.keyToCommand(e);
    if (!cmd) return;

    if (PREVENT_DEFAULT_KEYS.has(e.key)) e.preventDefault();
    this.emit(cmd);
  }

  private keyToCommand(e: KeyboardEvent): Command | null {
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        return { type: 'MOVE_LEFT' };
      case 'ArrowRight':
      case 'KeyD':
        return { type: 'MOVE_RIGHT' };
      case 'ArrowDown':
      case 'Space':
        return { type: 'DROP' };
      case 'ArrowUp':
      case 'KeyW':
        return { type: 'FLIP' };
      case 'KeyP':
      case 'Escape':
        return { type: 'PAUSE_TOGGLE' };
      case 'Enter':
        return { type: 'CONFIRM' };
      case 'Digit1':
      case 'Numpad1':
        return { type: 'START_CLASSIC' };
      case 'Digit2':
      case 'Numpad2':
        return { type: 'START_ENDLESS' };
      default:
        return null;
    }
  }
}
