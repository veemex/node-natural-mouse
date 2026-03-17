import { Flow } from './flow.js';
import type {
  DeviationProvider,
  FlowWithTime,
  NoiseProvider,
  OvershootManager,
  Point,
  SpeedManager,
  SystemCalls,
} from './types.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const SMALL_DELTA = 1e-5;

// ─── Default Noise Provider ──────────────────────────────────────────────────

/**
 * Provides random mistakes in the mouse trajectory, simulating hand shakiness.
 *
 * Noise is small and probabilistic — larger steps produce less noise
 * (since the user is moving quickly and errors are less noticeable).
 */
export class DefaultNoiseProvider implements NoiseProvider {
  constructor(private readonly noisinessDivider: number = 2.0) {}

  getNoise(random: () => number, xStepSize: number, yStepSize: number): Point {
    if (Math.abs(xStepSize) < SMALL_DELTA && Math.abs(yStepSize) < SMALL_DELTA) {
      return { x: 0, y: 0 };
    }

    const stepSize = Math.hypot(xStepSize, yStepSize);
    const noisiness = Math.max(0, 8 - stepSize) / 50;

    if (random() < noisiness) {
      const noiseX = ((random() - 0.5) * Math.max(0, 8 - stepSize)) / this.noisinessDivider;
      const noiseY = ((random() - 0.5) * Math.max(0, 8 - stepSize)) / this.noisinessDivider;
      return { x: noiseX, y: noiseY };
    }

    return { x: 0, y: 0 };
  }
}

// ─── Sinusoidal Deviation Provider ───────────────────────────────────────────

/**
 * Creates smooth arcs in the trajectory using a sinusoidal function.
 *
 * The deviation peaks at the midpoint of movement and returns to zero
 * at both start and end, creating a natural curved path.
 */
export class SinusoidalDeviationProvider implements DeviationProvider {
  constructor(private readonly slopeDivider: number = 10) {}

  getDeviation(totalDistanceInPixels: number, completionFraction: number): Point {
    const deviationFunctionResult = (1 - Math.cos(completionFraction * Math.PI * 2)) / 2;
    const deviationX = totalDistanceInPixels / this.slopeDivider;
    const deviationY = totalDistanceInPixels / this.slopeDivider;
    return {
      x: deviationFunctionResult * deviationX,
      y: deviationFunctionResult * deviationY,
    };
  }
}

// ─── Default Overshoot Manager ───────────────────────────────────────────────

export interface DefaultOvershootManagerOptions {
  overshoots?: number;
  minDistanceForOvershoots?: number;
  minOvershootMovementMs?: number;
  overshootRandomModifierDivider?: number;
  overshootSpeedupDivider?: number;
}

/**
 * Default overshoot behavior: the cursor intentionally misses the target
 * and has to correct, simulating human imprecision.
 */
export class DefaultOvershootManager implements OvershootManager {
  static readonly DEFAULT_OVERSHOOTS = 3;
  static readonly DEFAULT_MIN_DISTANCE_FOR_OVERSHOOTS = 10;
  static readonly DEFAULT_MIN_OVERSHOOT_MOVEMENT_MS = 40;
  static readonly DEFAULT_OVERSHOOT_RANDOM_MODIFIER_DIVIDER = 20;
  static readonly DEFAULT_OVERSHOOT_SPEEDUP_DIVIDER = 1.8;

  overshoots: number;
  minDistanceForOvershoots: number;
  minOvershootMovementMs: number;
  overshootRandomModifierDivider: number;
  overshootSpeedupDivider: number;

  constructor(
    private readonly random: () => number,
    options?: DefaultOvershootManagerOptions,
  ) {
    this.overshoots = options?.overshoots ?? DefaultOvershootManager.DEFAULT_OVERSHOOTS;
    this.minDistanceForOvershoots =
      options?.minDistanceForOvershoots ?? DefaultOvershootManager.DEFAULT_MIN_DISTANCE_FOR_OVERSHOOTS;
    this.minOvershootMovementMs =
      options?.minOvershootMovementMs ?? DefaultOvershootManager.DEFAULT_MIN_OVERSHOOT_MOVEMENT_MS;
    this.overshootRandomModifierDivider =
      options?.overshootRandomModifierDivider ?? DefaultOvershootManager.DEFAULT_OVERSHOOT_RANDOM_MODIFIER_DIVIDER;
    this.overshootSpeedupDivider =
      options?.overshootSpeedupDivider ?? DefaultOvershootManager.DEFAULT_OVERSHOOT_SPEEDUP_DIVIDER;
  }

  getOvershoots(_flow: Flow, _mouseMovementMs: number, distance: number): number {
    if (distance < this.minDistanceForOvershoots) {
      return 0;
    }
    return this.overshoots;
  }

  getOvershootAmount(
    distanceToRealTargetX: number,
    distanceToRealTargetY: number,
    _mouseMovementMs: number,
    overshootsRemaining: number,
  ): Point {
    const distanceToRealTarget = Math.hypot(distanceToRealTargetX, distanceToRealTargetY);
    const randomModifier = distanceToRealTarget / this.overshootRandomModifierDivider;
    const x = Math.floor(this.random() * randomModifier - randomModifier / 2) * overshootsRemaining;
    const y = Math.floor(this.random() * randomModifier - randomModifier / 2) * overshootsRemaining;
    return { x, y };
  }

  deriveNextMouseMovementTimeMs(mouseMovementMs: number, _overshootsRemaining: number): number {
    return Math.max(
      Math.floor(mouseMovementMs / this.overshootSpeedupDivider),
      this.minOvershootMovementMs,
    );
  }
}

// ─── Default Speed Manager ───────────────────────────────────────────────────

/**
 * Controls movement duration and selects a random flow from the provided templates.
 *
 * The movement time is baseTimeMs + random * baseTimeMs, so movements
 * take between 1x and 2x the base time.
 */
export class DefaultSpeedManager implements SpeedManager {
  private readonly flows: Flow[];

  constructor(
    flowCharacteristics: number[][],
    private readonly random: () => number,
    private readonly baseTimeMs: number = 500,
  ) {
    this.flows = flowCharacteristics.map((chars) => new Flow(chars));
  }

  getFlowWithTime(_distance: number): FlowWithTime {
    if (this.flows.length === 0) {
      throw new Error('No flows configured');
    }

    let time = this.baseTimeMs + Math.floor(this.random() * this.baseTimeMs);

    // Pick a random flow
    const flow = this.flows[Math.floor(this.random() * this.flows.length) % this.flows.length];

    // Compensate for zero-buckets (add time for buckets with zero flow)
    const characteristics = flow.getFlowCharacteristics();
    const timePerBucket = time / characteristics.length;
    for (const bucket of characteristics) {
      if (Math.abs(bucket) < SMALL_DELTA) {
        time += Math.floor(timePerBucket);
      }
    }

    return { flow, time };
  }
}

// ─── Default System Calls ────────────────────────────────────────────────────

/**
 * A no-op SystemCalls implementation for testing and dry-run purposes.
 *
 * Tracks the virtual mouse position without actually moving any cursor.
 * Use this for testing trajectories or when you don't have a real backend.
 */
export class MockSystemCalls implements SystemCalls {
  private mouseX = 0;
  private mouseY = 0;

  constructor(
    private readonly screenWidth: number = 1920,
    private readonly screenHeight: number = 1080,
    startX: number = 0,
    startY: number = 0,
  ) {
    this.mouseX = startX;
    this.mouseY = startY;
  }

  currentTimeMillis(): number {
    return Date.now();
  }

  async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getScreenSize() {
    return { width: this.screenWidth, height: this.screenHeight };
  }

  setMousePosition(x: number, y: number): void {
    this.mouseX = x;
    this.mouseY = y;
  }

  getMousePosition(): Point {
    return { x: this.mouseX, y: this.mouseY };
  }
}
