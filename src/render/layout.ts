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
  // In portrait, reserve a stack panel column to the right of the playfield
  // and a bottom HUD bar
  const stackPanelW = isPortrait ? 48 : 0; // only needed in portrait; landscape uses HUD
  const playAreaW = canvasW - (isPortrait ? stackPanelW : hudW);
  const playAreaH = isPortrait ? canvasH - 80 : canvasH;

  const marginH = isPortrait ? 8 : 16;
  const marginV = isPortrait ? 8 : 16;

  const cellByWidth = Math.floor((playAreaW - marginH * 2) / cols);
  const cellByHeight = Math.floor((playAreaH - marginV * 2) / totalRows);
  const cellSize = Math.max(20, Math.min(cellByWidth, cellByHeight));

  const playfieldWidth = cellSize * cols;
  const playfieldHeight = cellSize * totalRows;
  const playfieldX = Math.floor((playAreaW - playfieldWidth) / 2);
  const playfieldY = Math.floor((playAreaH - playfieldHeight) / 2);

  const conveyorOrigin = { x: playfieldX, y: playfieldY };
  const paddleOrigin = { x: playfieldX, y: playfieldY + cellSize * conveyorRows };
  const wellOrigin = { x: playfieldX, y: playfieldY + cellSize * (conveyorRows + 1) };

  const hudX = isPortrait ? 0 : playAreaW;
  const hudY = isPortrait ? canvasH - 80 : 0;
  const hudHeight = isPortrait ? 80 : canvasH;

  // Stack panel: to the right of the playfield (portrait) or embedded in the HUD (landscape)
  const stackCellSize = isPortrait ? 36 : Math.min(44, (hudW - 16) * 0.8);
  const stackX = isPortrait
    ? playfieldX + playfieldWidth + 6
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
