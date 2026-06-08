import type { Command } from './commands';
import type { InputAdapter } from './InputAdapter';
import type { Layout } from '../render/layout';
import { pixelToLane } from '../render/layout';

/**
 * Mouse / trackpad adapter.
 *
 * - Hover  → highlights the lane under the cursor (via hoveredLane getter)
 * - Click  → MOVE_TO the hovered lane; if already on that lane, DROP
 * - Right-click → DROP
 * - Scroll up / middle-click → FLIP
 * - Works only when a fine pointer is available; degrades gracefully on touch-only devices.
 */
export class PointerAdapter implements InputAdapter {
  readonly id = 'pointer';

  private emit: ((cmd: Command) => void) | null = null;
  private _hoveredLane: number | null = null;

  private readonly onPointerMove: (e: PointerEvent) => void;
  private readonly onPointerLeave: (e: PointerEvent) => void;
  private readonly onClick: (e: MouseEvent) => void;
  private readonly onContextMenu: (e: MouseEvent) => void;
  private readonly onWheel: (e: WheelEvent) => void;
  private readonly onAuxClick: (e: MouseEvent) => void;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly getLayout: () => Layout | null,
    private readonly getPaddleLane: () => number,
  ) {
    this.onPointerMove = (e) => this.handleMove(e);
    this.onPointerLeave = () => { this._hoveredLane = null; };
    this.onClick = (e) => this.handleClick(e);
    this.onContextMenu = (e) => this.handleContextMenu(e);
    this.onWheel = (e) => this.handleWheel(e);
    this.onAuxClick = (e) => this.handleAuxClick(e);
  }

  /** The lane (0-based) currently under the mouse, or null if outside the playfield. */
  get hoveredLane(): number | null { return this._hoveredLane; }

  isApplicable(): boolean {
    // Only attach when a fine pointer (mouse/trackpad/stylus) is present.
    // On touch-only devices this returns false and the adapter stays detached.
    return window.matchMedia('(pointer: fine)').matches;
  }

  attach(emit: (cmd: Command) => void): void {
    this.emit = emit;
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerleave', this.onPointerLeave);
    this.canvas.addEventListener('click', this.onClick);
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.canvas.addEventListener('auxclick', this.onAuxClick);
  }

  detach(): void {
    this.emit = null;
    this._hoveredLane = null;
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.canvas.removeEventListener('click', this.onClick);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('auxclick', this.onAuxClick);
  }

  private canvasXY(e: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    // Convert to CSS-pixel space (layout is in CSS pixels)
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  private laneAt(e: MouseEvent): number | null {
    const layout = this.getLayout();
    if (!layout) return null;
    const { x, y } = this.canvasXY(e);
    // Only respond within the playfield columns vertically
    const pfTop = layout.playfieldY;
    const pfBottom = layout.playfieldY + layout.playfieldHeight;
    if (y < pfTop || y > pfBottom) return null;
    const lane = pixelToLane(layout, x);
    return lane;
  }

  private handleMove(e: PointerEvent): void {
    if (e.pointerType === 'touch') return; // let TouchAdapter own touch events
    this._hoveredLane = this.laneAt(e);
  }

  private handleClick(e: MouseEvent): void {
    if (!this.emit) return;
    const lane = this.laneAt(e);
    if (lane === null) return;

    if (lane === this.getPaddleLane()) {
      // Already on this lane — treat click as DROP
      this.emit({ type: 'DROP' });
    } else {
      this.emit({ type: 'MOVE_TO', lane });
    }
  }

  private handleContextMenu(e: MouseEvent): void {
    e.preventDefault();
    if (!this.emit) return;
    const lane = this.laneAt(e);
    if (lane === null) return;
    this.emit({ type: 'DROP' });
  }

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();
    if (!this.emit) return;
    const lane = this.laneAt(e);
    if (lane === null) return;
    // Scroll up → FLIP; scroll down → DROP
    if (e.deltaY < 0) {
      this.emit({ type: 'FLIP' });
    } else {
      this.emit({ type: 'DROP' });
    }
  }

  private handleAuxClick(e: MouseEvent): void {
    // Middle-click → FLIP
    if (e.button !== 1) return;
    e.preventDefault();
    if (!this.emit) return;
    const lane = this.laneAt(e);
    if (lane === null) return;
    this.emit({ type: 'FLIP' });
  }
}
