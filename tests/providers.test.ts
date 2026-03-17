import { describe, expect, it } from 'vitest';
import {
  DefaultNoiseProvider,
  DefaultOvershootManager,
  DefaultSpeedManager,
  SinusoidalDeviationProvider,
} from '../src/providers.js';
import * as FlowTemplates from '../src/flow-templates.js';
import { Flow } from '../src/flow.js';

describe('DefaultNoiseProvider', () => {
  const provider = new DefaultNoiseProvider();
  const random = () => 0.5;

  it('should return zero noise for zero step sizes', () => {
    const noise = provider.getNoise(random, 0, 0);
    expect(noise.x).toBe(0);
    expect(noise.y).toBe(0);
  });

  it('should return noise within reasonable bounds', () => {
    for (let i = 0; i < 100; i++) {
      const noise = provider.getNoise(Math.random, 2, 2);
      expect(Math.abs(noise.x)).toBeLessThan(10);
      expect(Math.abs(noise.y)).toBeLessThan(10);
    }
  });

  it('should produce less noise for larger steps', () => {
    let smallStepNoiseCount = 0;
    let largeStepNoiseCount = 0;
    const iterations = 1000;

    for (let i = 0; i < iterations; i++) {
      const smallNoise = provider.getNoise(Math.random, 1, 1);
      const largeNoise = provider.getNoise(Math.random, 20, 20);
      if (smallNoise.x !== 0 || smallNoise.y !== 0) smallStepNoiseCount++;
      if (largeNoise.x !== 0 || largeNoise.y !== 0) largeStepNoiseCount++;
    }

    // Small steps should produce noise more often than large steps
    expect(smallStepNoiseCount).toBeGreaterThan(largeStepNoiseCount);
  });
});

describe('SinusoidalDeviationProvider', () => {
  const provider = new SinusoidalDeviationProvider();

  it('should return zero deviation at start (completion=0)', () => {
    const deviation = provider.getDeviation(100, 0);
    expect(deviation.x).toBeCloseTo(0, 5);
    expect(deviation.y).toBeCloseTo(0, 5);
  });

  it('should return near-zero deviation at end (completion≈1)', () => {
    const deviation = provider.getDeviation(100, 1);
    expect(deviation.x).toBeCloseTo(0, 5);
    expect(deviation.y).toBeCloseTo(0, 5);
  });

  it('should peak at midpoint (completion=0.5)', () => {
    const atStart = provider.getDeviation(100, 0);
    const atMid = provider.getDeviation(100, 0.5);
    const atEnd = provider.getDeviation(100, 1);
    expect(atMid.x).toBeGreaterThan(atStart.x);
    expect(atMid.x).toBeGreaterThan(atEnd.x);
  });

  it('should scale with distance', () => {
    const short = provider.getDeviation(50, 0.5);
    const long = provider.getDeviation(200, 0.5);
    expect(long.x).toBeGreaterThan(short.x);
  });
});

describe('DefaultOvershootManager', () => {
  const random = () => 0.5;
  const manager = new DefaultOvershootManager(random);

  it('should return 0 overshoots for short distances', () => {
    const flow = new Flow(FlowTemplates.constantSpeed());
    expect(manager.getOvershoots(flow, 100, 5)).toBe(0);
  });

  it('should return configured overshoots for long distances', () => {
    const flow = new Flow(FlowTemplates.constantSpeed());
    expect(manager.getOvershoots(flow, 100, 500)).toBe(3);
  });

  it('should return overshoot amounts', () => {
    const overshoot = manager.getOvershootAmount(100, 100, 500, 3);
    expect(typeof overshoot.x).toBe('number');
    expect(typeof overshoot.y).toBe('number');
  });

  it('should derive next movement time', () => {
    const nextTime = manager.deriveNextMouseMovementTimeMs(500, 2);
    expect(nextTime).toBeGreaterThan(0);
    expect(nextTime).toBeLessThanOrEqual(500);
  });

  it('should respect custom options', () => {
    const custom = new DefaultOvershootManager(random, {
      overshoots: 0,
    });
    const flow = new Flow(FlowTemplates.constantSpeed());
    expect(custom.getOvershoots(flow, 100, 500)).toBe(0);
  });
});

describe('DefaultSpeedManager', () => {
  const random = () => 0.5;

  it('should return a flow and time', () => {
    const manager = new DefaultSpeedManager(
      [FlowTemplates.constantSpeed(), FlowTemplates.variatingFlow()],
      random,
      500,
    );
    const { flow, time } = manager.getFlowWithTime(100);
    expect(flow).toBeInstanceOf(Flow);
    expect(time).toBeGreaterThan(0);
  });

  it('should throw with no flows', () => {
    const manager = new DefaultSpeedManager([], random);
    expect(() => manager.getFlowWithTime(100)).toThrow();
  });

  it('time should vary with randomness', () => {
    let callCount = 0;
    const seededRandom = () => {
      callCount++;
      return (callCount % 10) / 10;
    };

    const manager = new DefaultSpeedManager(
      [FlowTemplates.constantSpeed()],
      seededRandom,
      500,
    );

    const times = new Set<number>();
    for (let i = 0; i < 10; i++) {
      times.add(manager.getFlowWithTime(100).time);
    }
    // Should get at least some variation
    expect(times.size).toBeGreaterThan(1);
  });
});
