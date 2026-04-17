import { move } from './mouse-motion.js';
import type {
  MotionNature,
  MouseControllerEvents,
  MouseControllerOptions,
  MouseEventListener,
  MouseEventName,
  MouseEventPayload,
  Point,
} from './types.js';

export class MouseController {
  private readonly nature: MotionNature;
  private readonly options: MouseControllerOptions;
  private readonly listeners: {
    [E in MouseEventName]: Set<MouseEventListener<E>>;
  } = {
    start: new Set(),
    complete: new Set(),
    cancelled: new Set(),
  };

  private controller: AbortController | undefined;
  private _target: Point | null = null;
  private _isMoving = false;

  constructor(nature: MotionNature, options: MouseControllerOptions = {}) {
    this.nature = nature;
    this.options = options;
  }

  get isMoving(): boolean {
    return this._isMoving;
  }

  get target(): Point | null {
    return this._target;
  }

  on<E extends MouseEventName>(event: E, listener: MouseEventListener<E>): void {
    this.listeners[event].add(listener as MouseEventListener<MouseEventName>);
  }

  off<E extends MouseEventName>(event: E, listener: MouseEventListener<E>): void {
    this.listeners[event].delete(listener as MouseEventListener<MouseEventName>);
  }

  async moveTo(x: number, y: number): Promise<void> {
    // Supersede any in-flight movement: emit cancelled for the previous one,
    // then replace the controller reference so the old moveTo() knows it was superseded.
    if (this._isMoving && this.controller) {
      const pos = this.nature.systemCalls.getMousePosition();
      this.controller.abort();
      this.emit('cancelled', pos);
    }

    const controller = new AbortController();
    this.controller = controller;
    this._target = { x, y };
    this._isMoving = true;

    const startPos = this.nature.systemCalls.getMousePosition();
    this.emit('start', startPos);

    try {
      await move(this.nature, x, y, { signal: controller.signal });

      if (this.controller !== controller) return;

      const pos = this.nature.systemCalls.getMousePosition();
      this.emit('complete', pos);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Superseded by another moveTo() — cancelled was already emitted by the new call.
        if (this.controller !== controller) return;

        // External cancel() — emit cancelled and re-throw so awaiters see the abort.
        const pos = this.nature.systemCalls.getMousePosition();
        this.emit('cancelled', pos);
        throw err;
      }
      throw err;
    } finally {
      if (this.controller === controller) {
        this.controller = undefined;
        this._target = null;
        this._isMoving = false;
      }
    }
  }

  async click(): Promise<void> {
    await this.invokeClick('left');
  }

  async rightClick(): Promise<void> {
    await this.invokeClick('right');
  }

  cancel(): void {
    this.controller?.abort();
  }

  private async invokeClick(button: 'left' | 'right'): Promise<void> {
    if (!this.options.click) {
      throw new Error(
        `MouseController.${button === 'left' ? 'click' : 'rightClick'}() requires a 'click' callback in options`,
      );
    }
    await this.options.click(button);
  }

  private emit<E extends MouseEventName>(
    event: E,
    payload: MouseControllerEvents[E],
  ): void {
    for (const listener of this.listeners[event]) {
      listener(payload as MouseEventPayload & MouseControllerEvents[E]);
    }
  }
}
