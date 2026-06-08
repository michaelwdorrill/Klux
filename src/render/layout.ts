export interface Layout {
  cellSize: number;
  cols: number;
  rows: number;
  conveyorRows: number;
  wellOrigin: { x: number; y: number };
  paddleOrigin: { x: number; y: number };
  conveyorOrigin: { x: number; y: number };
  playfieldX: number;
  playfieldY: number;
  playfieldWidth: number;
  playfieldHeight: number;
  hudX: number;
  hudY: number;
  hudW: number;
  hudH: number;
  // Stack panel: small column to the right of the playfield showing held tiles
  stackX: number;
  stackY: number;
  stackCellSize: number;
  isPortrait: boolean;
}

export function computeLayout(
  canvasW: number,
  canvasH: number,
  cols: number,
  rows: number
): Layout {
  const conveyorRows = rows;
  const totalRows = conveyorRows + 1 + rows; // conveyor + paddle + well
  const isPortrait = canvasH >= canvasW;

  // In landscape, reserve space on the right for a HUD panel
  const hudW = isPortrait ? canvasW : Math.min(160, canvasW * 0.22);
  // In portrait the stack panel is pinned to the right edge (not reserved in play area)
  // so the playfield can be centred on the full canvas.
  const playAreaW = isPortrait ? canvasW : canvasW - hudW;
  const playAreaH = isPortrait ? canvasH - 80 : canvasH;

  const marginH = isPortrait ? 8 : 16;
  const marginV = isPortrait ? 8 : 16;

  const cellByWidth = Math.floor((playAreaW - marginH * 2) / cols);
  const cellByHeight = Math.floor((playAreaH - marginV * 2) / totalRows);
  const cellSize = Math.max(20, Math.min(cellByWidth, cellByHeight));

  const playfieldWidth = cellSize * cols;
  const playfieldHeight = cellSize * totalRows;
  // Centre the playfield on the full canvas (not just the play area) so the
  // board is visually centred regardless of HUD/stack-panel placement.
  const playfieldX = Math.floor((canvasW - playfieldWidth) / 2);
  const playfieldY = Math.floor((playAreaH - playfieldHeight) / 2);

  const conveyorOrigin = { x: playfieldX, y: playfieldY };
  const paddleOrigin = { x: playfieldX, y: playfieldY + cellSize * conveyorRows };
  const wellOrigin = { x: playfieldX, y: playfieldY + cellSize * (conveyorRows + 1) };

  const hudX = isPortrait ? 0 : canvasW - hudW;
  const hudY = isPortrait ? canvasH - 80 : 0;
  const hudHeight = isPortrait ? 80 : canvasH;

  // Stack panel: pinned to the right edge in portrait; embedded in HUD in landscape.
  // Use a smaller cell size (28px) so it fits without reserving layout space.
  const stackCellSize = isPortrait ? 28 : Math.min(44, (hudW - 16) * 0.8);
  const stackX = isPortrait
    ? Math.min(playfieldX + playfieldWidth + 4, canvasW - stackCellSize - 2)
    : hudX + (hudW - stackCellSize) / 2;
  const stackY = isPortrait
    ? paddleOrigin.y - 4  // aligned with the paddle row
    : hudHeight * 0.5;    // will be positioned by HUD draw code

  return {
    cellSize,
    cols,
    rows,
    conveyorRows,
    wellOrigin,
    paddleOrigin,
    conveyorOrigin,
    playfieldX,
    playfieldY,
    playfieldWidth,
    playfieldHeight,
    hudX,
    hudY,
    hudW,
    hudH: hudHeight,
    stackX,
    stackY,
    stackCellSize,
    isPortrait,
  };
}

export function laneToX(layout: Layout, lane: number): number {
  return layout.conveyorOrigin.x + lane * layout.cellSize;
}

export function pixelToLane(layout: Layout, x: number): number {
  const lane = Math.floor((x - layout.conveyorOrigin.x) / layout.cellSize);
  return Math.max(0, Math.min(layout.cols - 1, lane));
}
