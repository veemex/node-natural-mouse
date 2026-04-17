import { describe, expect, it, vi } from 'vitest';
import { MouseController } from '../src/mouse-controller.js';
import { createFastGamerNature, createRobotNature } from '../src/presets.js';
import type { MouseEventPayload, SystemCalls } from '../src/types.js';

function createFastMock(startX = 0, startY = 0): SystemCalls {
  let mouseX = startX;
  let mouseY = startY;
  let time = 0;

  return {
    currentTimeMillis: () => time++,
    sleep: async () => {},
    getScreenSize: () => ({ width: 1920, height: 1080 }),
    setMousePosition: (x, y) => {
      mouseX = x;
      mouseY = y;
    },
    getMousePosition: () => ({ x: mouseX, y: mouseY }),
  };
}

function createControllableMock(startX = 0, startY = 0) {
  let mouseX = startX;
  let mouseY = startY;
  let time = 0;
  const pendingSleeps: Array<() => void> = [];

  const systemCalls: SystemCalls = {
    currentTimeMillis: () => time++,
    sleep: () =>
      new Promise<void>((resolve) => {
        pendingSleeps.push(resolve);
      }),
    getScreenSize: () => ({ width: 1920, height: 1080 }),
    setMousePosition: (x, y) => {
      mouseX = x;
      mouseY = y;
    },
    getMousePosition: () => ({ x: mouseX, y: mouseY }),
  };

  return {
    systemCalls,
    drainAll: async () => {
      while (pendingSleeps.length > 0) {
        const batch = pendingSleeps.splice(0);
        for (const resolve of batch) resolve();
        await new Promise<void>((r) => setImmediate(r));
      }
    },
    resolveOneSleep: () => {
      const resolve = pendingSleeps.shift();
      resolve?.();
    },
    get pendingSleepCount() {
      return pendingSleeps.length;
    },
  };
}

function seededRandom(seed = 42): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

async function flushMicrotasks(times = 3): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

describe('MouseController.moveTo()', () => {
  it('should move cursor to the target', async () => {
    const mock = createFastMock(100, 100);
    const nature = createFastGamerNature(mock, seededRandom());
    const mouse = new MouseController(nature);

    await mouse.moveTo(500, 400);

    const pos = mock.getMousePosition();
    expect(pos.x).toBe(500);
    expect(pos.y).toBe(400);
  });

  it('should emit start then complete on normal movement', async () => {
    const mock = createFastMock(0, 0);
    const nature = createRobotNature(mock, 100, seededRandom());
    const mouse = new MouseController(nature);
    const events: string[] = [];

    mouse.on('start', () => events.push('start'));
    mouse.on('complete', () => events.push('complete'));
    mouse.on('cancelled', () => events.push('cancelled'));

    await mouse.moveTo(300, 200);

    expect(events).toEqual(['start', 'complete']);
  });

  it('complete payload should match final cursor position', async () => {
    const mock = createFastMock(0, 0);
    const nature = createRobotNature(mock, 100, seededRandom());
    const mouse = new MouseController(nature);
    let completePayload: MouseEventPayload | undefined;

    mouse.on('complete', (p) => { completePayload = p; });
    await mouse.moveTo(300, 200);

    expect(completePayload).toEqual({ x: 300, y: 200 });
  });

  it('isMoving should reflect state during and after movement', async () => {
    const ctrl = createControllableMock(0, 0);
    const nature = createRobotNature(ctrl.systemCalls, 100, seededRandom());
    const mouse = new MouseController(nature);

    expect(mouse.isMoving).toBe(false);

    const promise = mouse.moveTo(500, 300);
    await flushMicrotasks();
    expect(mouse.isMoving).toBe(true);
    expect(mouse.target).toEqual({ x: 500, y: 300 });

    await ctrl.drainAll();
    await promise;

    expect(mouse.isMoving).toBe(false);
    expect(mouse.target).toBeNull();
  });
});

describe('MouseController.cancel()', () => {
  it('should be a no-op when not moving', () => {
    const mock = createFastMock(0, 0);
    const nature = createRobotNature(mock, 100, seededRandom());
    const mouse = new MouseController(nature);

    expect(() => mouse.cancel()).not.toThrow();
    expect(mouse.isMoving).toBe(false);
  });

  it('should cause in-flight moveTo() to reject with AbortError', async () => {
    const ctrl = createControllableMock(0, 0);
    const nature = createRobotNature(ctrl.systemCalls, 100, seededRandom());
    const mouse = new MouseController(nature);

    const promise = mouse.moveTo(500, 300);
    const captured = promise.catch((err: Error) => err);

    await flushMicrotasks();
    mouse.cancel();
    await ctrl.drainAll();

    const err = await captured;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).name).toBe('AbortError');
  });

  it('should emit cancelled event on explicit cancel', async () => {
    const ctrl = createControllableMock(0, 0);
    const nature = createRobotNature(ctrl.systemCalls, 100, seededRandom());
    const mouse = new MouseController(nature);
    const events: string[] = [];

    mouse.on('start', () => events.push('start'));
    mouse.on('cancelled', () => events.push('cancelled'));
    mouse.on('complete', () => events.push('complete'));

    const promise = mouse.moveTo(500, 300);
    const swallow = promise.catch(() => {});

    await flushMicrotasks();
    mouse.cancel();
    await ctrl.drainAll();
    await swallow;

    expect(events).toEqual(['start', 'cancelled']);
  });

  it('should clear isMoving state after cancel', async () => {
    const ctrl = createControllableMock(0, 0);
    const nature = createRobotNature(ctrl.systemCalls, 100, seededRandom());
    const mouse = new MouseController(nature);

    const promise = mouse.moveTo(500, 300);
    const swallow = promise.catch(() => {});

    await flushMicrotasks();
    mouse.cancel();
    await ctrl.drainAll();
    await swallow;

    expect(mouse.isMoving).toBe(false);
    expect(mouse.target).toBeNull();
  });
});

describe('MouseController auto-cancel (supersede)', () => {
  it('should auto-cancel previous movement when moveTo() is called again', async () => {
    const ctrl = createControllableMock(0, 0);
    const nature = createRobotNature(ctrl.systemCalls, 100, seededRandom());
    const mouse = new MouseController(nature);

    const first = mouse.moveTo(500, 300);
    await flushMicrotasks();

    const second = mouse.moveTo(800, 600);
    await ctrl.drainAll();

    await first;
    await second;

    const pos = ctrl.systemCalls.getMousePosition();
    expect(pos.x).toBe(800);
    expect(pos.y).toBe(600);
  });

  it('should resolve (not reject) superseded promise silently', async () => {
    const ctrl = createControllableMock(0, 0);
    const nature = createRobotNature(ctrl.systemCalls, 100, seededRandom());
    const mouse = new MouseController(nature);

    const first = mouse.moveTo(500, 300);
    await flushMicrotasks();

    const second = mouse.moveTo(800, 600);
    await ctrl.drainAll();

    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBeUndefined();
  });

  it('should emit cancelled for previous then start for new', async () => {
    const ctrl = createControllableMock(0, 0);
    const nature = createRobotNature(ctrl.systemCalls, 100, seededRandom());
    const mouse = new MouseController(nature);
    const events: string[] = [];

    mouse.on('start', () => events.push('start'));
    mouse.on('complete', () => events.push('complete'));
    mouse.on('cancelled', () => events.push('cancelled'));

    const first = mouse.moveTo(500, 300);
    await flushMicrotasks();

    const second = mouse.moveTo(800, 600);
    await ctrl.drainAll();

    await first;
    await second;

    expect(events).toEqual(['start', 'cancelled', 'start', 'complete']);
  });

  it('target should reflect the latest moveTo', async () => {
    const ctrl = createControllableMock(0, 0);
    const nature = createRobotNature(ctrl.systemCalls, 100, seededRandom());
    const mouse = new MouseController(nature);

    const first = mouse.moveTo(500, 300);
    await flushMicrotasks();

    const second = mouse.moveTo(800, 600);
    await flushMicrotasks();

    expect(mouse.target).toEqual({ x: 800, y: 600 });

    await ctrl.drainAll();
    await first;
    await second;
  });
});

describe('MouseController.click() / rightClick()', () => {
  it('should invoke click callback with "left" for click()', async () => {
    const mock = createFastMock(0, 0);
    const nature = createRobotNature(mock, 100, seededRandom());
    const clickSpy = vi.fn();
    const mouse = new MouseController(nature, { click: clickSpy });

    await mouse.click();

    expect(clickSpy).toHaveBeenCalledWith('left');
  });

  it('should invoke click callback with "right" for rightClick()', async () => {
    const mock = createFastMock(0, 0);
    const nature = createRobotNature(mock, 100, seededRandom());
    const clickSpy = vi.fn();
    const mouse = new MouseController(nature, { click: clickSpy });

    await mouse.rightClick();

    expect(clickSpy).toHaveBeenCalledWith('right');
  });

  it('should await async click callbacks', async () => {
    const mock = createFastMock(0, 0);
    const nature = createRobotNature(mock, 100, seededRandom());
    let clickDone = false;
    const mouse = new MouseController(nature, {
      click: async () => {
        await new Promise((r) => setTimeout(r, 10));
        clickDone = true;
      },
    });

    await mouse.click();
    expect(clickDone).toBe(true);
  });

  it('click() should throw if no callback configured', async () => {
    const mock = createFastMock(0, 0);
    const nature = createRobotNature(mock, 100, seededRandom());
    const mouse = new MouseController(nature);

    await expect(mouse.click()).rejects.toThrow(/click.*callback/);
  });

  it('rightClick() should throw if no callback configured', async () => {
    const mock = createFastMock(0, 0);
    const nature = createRobotNature(mock, 100, seededRandom());
    const mouse = new MouseController(nature);

    await expect(mouse.rightClick()).rejects.toThrow(/rightClick.*callback/);
  });
});

describe('MouseController event management', () => {
  it('should support multiple listeners per event', async () => {
    const mock = createFastMock(0, 0);
    const nature = createRobotNature(mock, 100, seededRandom());
    const mouse = new MouseController(nature);
    const a = vi.fn();
    const b = vi.fn();

    mouse.on('complete', a);
    mouse.on('complete', b);

    await mouse.moveTo(200, 200);

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('off() should remove a registered listener', async () => {
    const mock = createFastMock(0, 0);
    const nature = createRobotNature(mock, 100, seededRandom());
    const mouse = new MouseController(nature);
    const listener = vi.fn();

    mouse.on('complete', listener);
    mouse.off('complete', listener);

    await mouse.moveTo(200, 200);

    expect(listener).not.toHaveBeenCalled();
  });

  it('off() with unregistered listener should be a no-op', () => {
    const mock = createFastMock(0, 0);
    const nature = createRobotNature(mock, 100, seededRandom());
    const mouse = new MouseController(nature);
    const listener = vi.fn();

    expect(() => mouse.off('complete', listener)).not.toThrow();
  });
});
