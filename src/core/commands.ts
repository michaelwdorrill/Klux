// Command union — defined in core so game.ts stays import-isolated from input/
export type Command =
  | { type: 'MOVE_LEFT' }
  | { type: 'MOVE_RIGHT' }
  | { type: 'MOVE_TO'; lane: number }
  | { type: 'DROP' }
  | { type: 'FLIP' }
  | { type: 'PAUSE_TOGGLE' }
  | { type: 'CONFIRM' };
