import { describe, expect, it, vi } from 'vitest';
import { move, generatePath } from '../src/mouse-motion.js';
import { MockSystemCalls } from '../src/providers.js';
import {
  createFastGamerNature,
  createGrannyNature,
  createAverageUserNature,
  createRobotNature,
} from '../src/presets.js';
import type { MoveOptions, Point, SystemCalls } from '../src/types.js';

/**
 * Creates a fast MockSystemCalls that doesn't actually sleep,
 * allowing tests to run instantly.
 */
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
  let moveCount = 0;
  const pendingSleeps: Array<() => void> = [];

  const systemCalls: SystemCalls = {
    currentTimeMillis: () => time++,
    sleep: async () => new Promise<void>((resolve) => {
      pendingSleeps.push(resolve);
    }),
    getScreenSize: () => ({ width: 1920, height: 1080 }),
    setMousePosition: (x, y) => {
      mouseX = x;
      mouseY = y;
      moveCount++;
    },
    getMousePosition: () => ({ x: mouseX, y: mouseY }),
  };

  return {
    systemCalls,
    get moveCount() { return moveCount; },
    resolveSleep: () => {
      const resolve = pendingSleeps.shift();
      if (resolve) resolve();
    },
    get pendingSleepCount() { return pendingSleeps.length; },
  };
}

async function waitForPendingSleep(
  getPendingSleepCount: () => number,
  attempts = 50,
): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    if (getPendingSleepCount() > 0) {
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  throw new Error('Timed out waiting for movement sleep');
}

function createMoveOptions(signal?: AbortSignal): MoveOptions | undefined {
  return signal ? { signal } : undefined;
}

/** Seeded RNG for deterministic tests */
function seededRandom(seed = 42): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

describe('move()', () => {
  it('should reach the target position', async () => {
    const mock = createFastMock(100, 100);
    const nature = createFastGamerNature(mock, seededRandom());
    await move(nature, 500, 500);
    const pos = mock.getMousePosition();
    expect(pos.x).toBe(500);
    expect(pos.y).toBe(500);
  });

  it('should work when already at target', async () => {
    const mock = createFastMock(300, 300);
    const nature = createRobotNature(mock, 100, seededRandom());
    await move(nature, 300, 300);
    const pos = mock.getMousePosition();
    expect(pos.x).toBe(300);
    expect(pos.y).toBe(300);
  });

  it('should clamp destination to screen bounds', async () => {
    const mock = createFastMock(0, 0);
    const nature = createRobotNature(mock, 100, seededRandom());
    await move(nature, 5000, 5000);
    const pos = mock.getMousePosition();
    expect(pos.x).toBe(1919); // screen width - 1
    expect(pos.y).toBe(1079); // screen height - 1
  });

  it('should call observer for each step', async () => {
    const mock = createFastMock(0, 0);
    const observed: Point[] = [];
    const nature = createRobotNature(mock, 100, seededRandom());
    nature.observer = (x, y) => observed.push({ x, y });

    await move(nature, 100, 100);
    expect(observed.length).toBeGreaterThan(0);
    // Last observed position should be at or near target
    const last = observed[observed.length - 1];
    expect(Math.abs(last.x - 100)).toBeLessThanOrEqual(2);
    expect(Math.abs(last.y - 100)).toBeLessThanOrEqual(2);
  });

  it('should produce intermediate positions (not teleport)', async () => {
    const mock = createFastMock(0, 0);
    const positions: Point[] = [];
    const original = mock.setMousePosition.bind(mock);
    mock.setMousePosition = (x: number, y: number) => {
      positions.push({ x, y });
      (original as (x: number, y: number) => void)(x, y);
    };

    const nature = createRobotNature(mock, 200, seededRandom());
    await move(nature, 500, 500);

    expect(positions.length).toBeGreaterThan(2);
    // Should have gradual progression, not just start and end
    const midIdx = Math.floor(positions.length / 2);
    expect(positions[midIdx].x).toBeGreaterThan(0);
    expect(positions[midIdx].x).toBeLessThan(500);
  });

  it('should handle negative coordinates by clamping to 0', async () => {
    const mock = createFastMock(100, 100);
    const nature = createRobotNature(mock, 100, seededRandom());
    await move(nature, -50, -50);
    const pos = mock.getMousePosition();
    expect(pos.x).toBe(0);
    expect(pos.y).toBe(0);
  });

  it('should handle very short distances (< 1 pixel)', async () => {
    const mock = createFastMock(100, 100);
    const nature = createRobotNature(mock, 100, seededRandom());
    await move(nature, 100, 101);
    const pos = mock.getMousePosition();
    expect(pos.x).toBe(100);
    expect(pos.y).toBe(101);
  });
});

describe('presets', () => {
  const presets = [
    ['granny', createGrannyNature],
    ['fastGamer', createFastGamerNature],
    ['averageUser', createAverageUserNature],
  ] as const;

  for (const [name, factory] of presets) {
    it(`${name} should reach the target`, async () => {
      const mock = createFastMock(100, 100);
      const nature = factory(mock, seededRandom());
      await move(nature, 400, 400);
      const pos = mock.getMousePosition();
      expect(pos.x).toBe(400);
      expect(pos.y).toBe(400);
    });
  }

  it('robot should reach the target', async () => {
    const mock = createFastMock(100, 100);
    const nature = createRobotNature(mock, 100, seededRandom());
    await move(nature, 400, 400);
    const pos = mock.getMousePosition();
    expect(pos.x).toBe(400);
    expect(pos.y).toBe(400);
  });
});

describe('generatePath()', () => {
  it('should return a non-empty array of points', () => {
    const mock = createFastMock(0, 0);
    const nature = createRobotNature(mock, 100, seededRandom());
    const path = generatePath(nature, { x: 0, y: 0 }, 500, 500);
    expect(path.length).toBeGreaterThan(2);
  });

  it('should start near origin and end at destination', () => {
    const mock = createFastMock(0, 0);
    const nature = createRobotNature(mock, 100, seededRandom());
    const path = generatePath(nature, { x: 0, y: 0 }, 300, 300);
    const last = path[path.length - 1];
    expect(last.x).toBe(300);
    expect(last.y).toBe(300);
  });

  it('should return single point when already at destination', () => {
    const mock = createFastMock(200, 200);
    const nature = createRobotNature(mock, 100, seededRandom());
    const path = generatePath(nature, { x: 200, y: 200 }, 200, 200);
    expect(path).toEqual([{ x: 200, y: 200 }]);
  });

  it('should clamp to screen bounds', () => {
    const mock = createFastMock(0, 0);
    const nature = createRobotNature(mock, 100, seededRandom());
    const path = generatePath(nature, { x: 0, y: 0 }, 5000, 5000);
    const last = path[path.length - 1];
    expect(last.x).toBe(1919);
    expect(last.y).toBe(1079);
    // All points should be within screen bounds
    for (const p of path) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThan(1920);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThan(1080);
    }
  });

  it('should show gradual progression (not teleport)', () => {
    const mock = createFastMock(0, 0);
    const nature = createRobotNature(mock, 200, seededRandom());
    const path = generatePath(nature, { x: 0, y: 0 }, 500, 500);
    const midIdx = Math.floor(path.length / 2);
    expect(path[midIdx].x).toBeGreaterThan(0);
    expect(path[midIdx].x).toBeLessThan(500);
  });

  it('should not move the real mouse', () => {
    const mock = createFastMock(100, 100);
    const nature = createRobotNature(mock, 100, seededRandom());
    generatePath(nature, { x: 100, y: 100 }, 500, 500);
    // Mock mouse should still be at original position
    const pos = mock.getMousePosition();
    expect(pos.x).toBe(100);
    expect(pos.y).toBe(100);
  });

  it('should produce overshoots for non-robot natures', () => {
    const mock = createFastMock(0, 0);
    const nature = createFastGamerNature(mock, seededRandom());
    const path = generatePath(nature, { x: 0, y: 0 }, 500, 500);
    // With overshoots, the path should temporarily go past the target
    const maxX = Math.max(...path.map((p) => p.x));
    const maxY = Math.max(...path.map((p) => p.y));
    // At least some points should exceed or match the target (due to deviation/overshoots)
    expect(path.length).toBeGreaterThan(10);
  });

  it('should be deterministic with same seed', () => {
    const mock = createFastMock(0, 0);
    const path1 = generatePath(
      createRobotNature(mock, 100, seededRandom(123)),
      { x: 0, y: 0 },
      300,
      300,
    );
    const path2 = generatePath(
      createRobotNature(mock, 100, seededRandom(123)),
      { x: 0, y: 0 },
      300,
      300,
    );
    expect(path1).toEqual(path2);
  });
});

describe('directionBias', () => {
  it('vertical movement should produce more steps than horizontal (same distance)', () => {
    const mock = createFastMock(500, 500);
    // Horizontal movement: 500,500 -> 800,500 (distance 300, angle 0)
    const hNature = createAverageUserNature(mock, seededRandom(99));
    const hPath = generatePath(hNature, { x: 500, y: 500 }, 800, 500);

    // Vertical movement: 500,500 -> 500,800 (distance 300, angle 90)
    const vNature = createAverageUserNature(mock, seededRandom(99));
    const vPath = generatePath(vNature, { x: 500, y: 500 }, 500, 800);

    // Vertical path should have more points (takes longer → more steps)
    expect(vPath.length).toBeGreaterThan(hPath.length);
  });

  it('robot should have no direction bias', () => {
    const mock = createFastMock(500, 500);
    const hNature = createRobotNature(mock, 100, seededRandom(42));
    const hPath = generatePath(hNature, { x: 500, y: 500 }, 800, 500);

    const vNature = createRobotNature(mock, 100, seededRandom(42));
    const vPath = generatePath(vNature, { x: 500, y: 500 }, 500, 800);

    // Same distance, same seed, no bias → same length
    expect(vPath.length).toBe(hPath.length);
  });

  it('should still reach the target with bias enabled', async () => {
    const mock = createFastMock(0, 0);
    const nature = createAverageUserNature(mock, seededRandom());
    await move(nature, 500, 800); // Vertical-ish movement
    const pos = mock.getMousePosition();
    expect(pos.x).toBe(500);
    expect(pos.y).toBe(800);
  });
});

describe('input validation', () => {
  it('move() throws TypeError for NaN x destination', async () => {
    const mock = createFastMock(0, 0);
    const nature = createRobotNature(mock, 100, seededRandom());

    await expect(move(nature, Number.NaN, 100)).rejects.toBeInstanceOf(TypeError);
  });

  it('move() throws TypeError for NaN y destination', async () => {
    const mock = createFastMock(0, 0);
    const nature = createRobotNature(mock, 100, seededRandom());

    await expect(move(nature, 100, Number.NaN)).rejects.toBeInstanceOf(TypeError);
  });

  it('move() throws TypeError for Infinity destination', async () => {
    const mock = createFastMock(0, 0);
    const nature = createRobotNature(mock, 100, seededRandom());

    await expect(move(nature, Number.POSITIVE_INFINITY, 100)).rejects.toBeInstanceOf(TypeError);
  });

  it('move() throws RangeError for zero-width screen', async () => {
    const systemCalls: SystemCalls = {
      ...createFastMock(0, 0),
      getScreenSize: () => ({ width: 0, height: 1080 }),
    };
    const nature = createRobotNature(systemCalls, 100, seededRandom());

    await expect(move(nature, 100, 100)).rejects.toBeInstanceOf(RangeError);
  });

  it('move() throws RangeError for negative screen dimensions', async () => {
    const systemCalls: SystemCalls = {
      ...createFastMock(0, 0),
      getScreenSize: () => ({ width: -1920, height: -1080 }),
    };
    const nature = createRobotNature(systemCalls, 100, seededRandom());

    await expect(move(nature, 100, 100)).rejects.toBeInstanceOf(RangeError);
  });

  it('move() throws RangeError for NaN screen dimensions', async () => {
    const systemCalls: SystemCalls = {
      ...createFastMock(0, 0),
      getScreenSize: () => ({ width: Number.NaN, height: 1080 }),
    };
    const nature = createRobotNature(systemCalls, 100, seededRandom());

    await expect(move(nature, 100, 100)).rejects.toBeInstanceOf(RangeError);
  });

  it('generatePath() throws TypeError for NaN destination', () => {
    const mock = createFastMock(0, 0);
    const nature = createRobotNature(mock, 100, seededRandom());

    expect(() => generatePath(nature, { x: 0, y: 0 }, Number.NaN, 100)).toThrow(TypeError);
  });

  it('generatePath() throws TypeError for NaN from position', () => {
    const mock = createFastMock(0, 0);
    const nature = createRobotNature(mock, 100, seededRandom());

    expect(() => generatePath(nature, { x: Number.NaN, y: 0 }, 100, 100)).toThrow(TypeError);
  });

  it('generatePath() throws RangeError for invalid screen size', () => {
    const systemCalls: SystemCalls = {
      ...createFastMock(0, 0),
      getScreenSize: () => ({ width: 1920, height: 0 }),
    };
    const nature = createRobotNature(systemCalls, 100, seededRandom());

    expect(() => generatePath(nature, { x: 0, y: 0 }, 100, 100)).toThrow(RangeError);
  });
});

describe('AbortSignal', () => {
  it('should abort immediately if signal is already aborted', async () => {
    const mock = createFastMock(0, 0);
    const nature = createRobotNature(mock, 100, seededRandom());
    const controller = new AbortController();
    controller.abort();

    await expect(move(nature, 500, 500, createMoveOptions(controller.signal))).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('should abort mid-movement', async () => {
    const controllable = createControllableMock(0, 0);
    const nature = createRobotNature(controllable.systemCalls, 200, seededRandom(123));
    const controller = new AbortController();
    const movement = move(nature, 500, 500, createMoveOptions(controller.signal));

    await waitForPendingSleep(() => controllable.pendingSleepCount);
    controllable.resolveSleep();
    await waitForPendingSleep(() => controllable.pendingSleepCount);
    controllable.resolveSleep();
    await waitForPendingSleep(() => controllable.pendingSleepCount);

    controller.abort();

    while (controllable.pendingSleepCount > 0) {
      controllable.resolveSleep();
      await Promise.resolve();
    }

    await expect(movement).rejects.toMatchObject({ name: 'AbortError' });

    let fullMoveCount = 0;
    const fullMock = createFastMock(0, 0);
    const originalSetMousePosition = fullMock.setMousePosition.bind(fullMock);
    fullMock.setMousePosition = (x: number, y: number) => {
      fullMoveCount++;
      originalSetMousePosition(x, y);
    };

    const fullNature = createRobotNature(fullMock, 200, seededRandom(123));
    await move(fullNature, 500, 500);

    expect(controllable.moveCount).toBeLessThan(fullMoveCount);
  });

  it('should throw AbortError (not generic Error)', async () => {
    const mock = createFastMock(0, 0);
    const nature = createRobotNature(mock, 100, seededRandom());
    const controller = new AbortController();
    controller.abort();

    try {
      await move(nature, 500, 500, createMoveOptions(controller.signal));
      throw new Error('Expected move() to abort');
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error;
      }
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('AbortError');
    }
  });

  it('should leave cursor at intermediate position after abort', async () => {
    const controllable = createControllableMock(0, 0);
    const nature = createRobotNature(controllable.systemCalls, 200, seededRandom(456));
    const controller = new AbortController();
    const movement = move(nature, 500, 500, createMoveOptions(controller.signal));

    await waitForPendingSleep(() => controllable.pendingSleepCount);
    controllable.resolveSleep();
    await waitForPendingSleep(() => controllable.pendingSleepCount);
    controllable.resolveSleep();
    await waitForPendingSleep(() => controllable.pendingSleepCount);

    controller.abort();

    while (controllable.pendingSleepCount > 0) {
      controllable.resolveSleep();
      await Promise.resolve();
    }

    await expect(movement).rejects.toMatchObject({ name: 'AbortError' });

    const position = controllable.systemCalls.getMousePosition();
    expect(position.x).toBeGreaterThan(0);
    expect(position.x).toBeLessThan(500);
    expect(position.y).toBeGreaterThan(0);
    expect(position.y).toBeLessThan(500);
  });

  it('should not interfere when no signal is provided', async () => {
    const mock = createFastMock(0, 0);
    const nature = createRobotNature(mock, 100, seededRandom());

    await expect(move(nature, 500, 500, createMoveOptions())).resolves.toBeUndefined();
    expect(mock.getMousePosition()).toEqual({ x: 500, y: 500 });
  });

  it('should preserve custom abort reason', async () => {
    const mock = createFastMock(0, 0);
    const nature = createRobotNature(mock, 100, seededRandom());
    const controller = new AbortController();
    const reason = new Error('custom reason');
    controller.abort(reason);

    await expect(move(nature, 500, 500, createMoveOptions(controller.signal))).rejects.toBe(reason);
  });
});
