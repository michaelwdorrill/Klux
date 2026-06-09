import type { Command } from './commands';
import type { InputAdapter } from './InputAdapter';

export class InputManager {
  private readonly queue: Command[] = [];
  private readonly adapters: InputAdapter[] = [];

  private readonly emit = (cmd: Command): void => {
    this.queue.push(cmd);
  };

  register(adapter: InputAdapter): void {
    this.adapters.push(adapter);
    if (adapter.isApplicable()) {
      adapter.attach(this.emit);
    }
  }

  /** Directly enqueue a command (used for server-pushed VS events). */
  inject(cmd: Command): void {
    this.queue.push(cmd);
  }

  /** Pull all queued commands and clear the queue. Called once per fixed step. */
  drain(): Command[] {
    return this.queue.splice(0);
  }

  destroy(): void {
    for (const a of this.adapters) a.detach();
    this.adapters.length = 0;
  }
}
