import type { Command } from './commands';
import type { InputAdapter } from './InputAdapter';
import type { Layout } from '../render/layout';
import { pixelToLane } from '../render/layout';
import type { Phase } from '../core/types';

const SWIPE_THRESHOLD_PX = 14;
const TAP_MAX_MS = 250;

export class TouchAdapter implements InputAdapter {
  readonly id = 'touch';
  private emit: ((cmd: Command) => void) | null = null;

  private readonly element: HTMLElement;
  private readonly getLayout: () => Layout | null;
  private readonly getPaddleLane: () => number;
  private readonly getPhase: () => Phase;

  private touchStartX = 0;
  private touchStartY = 0;
  private touchStartTime = 0;
  private multiTouch = false;

  private readonly onStart: (e: TouchEvent) => void;
  private readonly onEnd: (e: TouchEvent) => void;

  constructor(
    element: HTMLElement,
    getLayout: () => Layout | null,
    getPaddleLane: () => number,
    getPhase: () => Phase
  ) {
    this.element = element;
    this.getLayout = getLayout;
    this.getPaddleLane = getPaddleLane;
    this.getPhase = getPhase;
    this.onStart = (e) => this.handleStart(e);
    this.onEnd = (e) => this.handleEnd(e);
  }

  isApplicable(): boolean {
    return navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;
  }

  attach(emit: (cmd: Command) => void): void {
    this.emit = emit;
    this.element.addEventListener('touchstart', this.onStart, { passive: false });
    this.element.addEventListener('touchend', this.onEnd, { passive: false });
  }

  detach(): void {
    this.element.removeEventListener('touchstart', this.onStart);
    this.element.removeEventListener('touchend', this.onEnd);
    this.emit = null;
  }

  private handleStart(e: TouchEvent): void {
    e.preventDefault();
    this.multiTouch = e.touches.length > 1;
    const t = e.changedTouches[0];
    this.touchStartX = t.clientX;
    this.touchStartY = t.clientY;
    this.touchStartTime = performance.now();
  }

  private handleEnd(e: TouchEvent): void {
    if (!this.emit || this.multiTouch) return;
    e.preventDefault();

    const t = e.changedTouches[0];
    const dx = t.clientX - this.touchStartX;
    const dy = t.clientY - this.touchStartY;
    const dist = Math.hypot(dx, dy);
    const elapsed = performance.now() - this.touchStartTime;
    const phase = this.getPhase();

    // In non-playing phases, any tap/swipe advances (CONFIRM)
    if (phase !== 'playing' && phase !== 'paused') {
      if (dist < SWIPE_THRESHOLD_PX && elapsed < TAP_MAX_MS) {
        this.emit({ type: 'CONFIRM' });
      }
      return;
    }
    if (phase === 'paused') {
      if (dist < SWIPE_THRESHOLD_PX && elapsed < TAP_MAX_MS) {
        this.emit({ type: 'PAUSE_TOGGLE' });
      }
      return;
    }

    if (dist < SWIPE_THRESHOLD_PX && elapsed < TAP_MAX_MS) {
      this.handleTap(t.clientX);
    } else if (dist >= SWIPE_THRESHOLD_PX) {
      this.handleSwipe(dx, dy);
    }
  }

  private handleTap(clientX: number): void {
    const layout = this.getLayout();
    if (!layout) return;

    const tappedLane = pixelToLane(layout, clientX);
    const currentLane = this.getPaddleLane();

    if (tappedLane === currentLane) {
      // Tap current lane → DROP
      this.emit!({ type: 'DROP' });
    } else {
      // Tap other lane → move there
      this.emit!({ type: 'MOVE_TO', lane: tappedLane });
    }
  }

  private handleSwipe(dx: number, dy: number): void {
    if (Math.abs(dx) >= Math.abs(dy)) {
      this.emit!(dx > 0 ? { type: 'MOVE_RIGHT' } : { type: 'MOVE_LEFT' });
    } else {
      this.emit!(dy > 0 ? { type: 'DROP' } : { type: 'FLIP' });
    }
  }
}
