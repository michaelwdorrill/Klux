import type { Command } from './commands';

export interface InputAdapter {
  readonly id: string;
  attach(emit: (cmd: Command) => void): void;
  detach(): void;
  isApplicable(): boolean;
}
