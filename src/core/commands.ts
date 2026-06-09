// Command union — defined in core so game.ts stays import-isolated from input/
export type Command =
  | { type: 'MOVE_LEFT' }
  | { type: 'MOVE_RIGHT' }
  | { type: 'MOVE_TO'; lane: number }
  | { type: 'DROP' }
  | { type: 'FLIP' }
  | { type: 'PAUSE_TOGGLE' }
  | { type: 'CONFIRM' }
  | { type: 'QUIT_TO_TITLE' }
  | { type: 'START_CLASSIC' }
  | { type: 'START_ENDLESS' }
  | { type: 'START_VS'; seed: number }  // seed synced from server
  | { type: 'FIRE_POWER' }             // player releases power meter
  // Effects injected by opponent's power use
  | { type: 'VS_LOCKED' }             // level 1: locked tile on conveyor
  | { type: 'VS_EXTRA_SPAWN' }        // level 2: force an extra tile now
  | { type: 'VS_SPEED_BOOST' }        // level 3: 10s double-speed
  | { type: 'VS_NEGATIVE_TILES' }     // level 4: next 3 tiles are negative
  | { type: 'VS_WIN' };               // opponent ran out of lives
