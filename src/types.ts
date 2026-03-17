import type { Flow } from './flow.js';

// ─── Core Types ──────────────────────────────────────────────────────────────

export interface Point {
  x: number;
  y: number;
}

export interface Dimension {
  width: number;
  height: number;
}

/** Flow + planned movement time pair returned by SpeedManager */
export interface FlowWithTime {
  flow: Flow;
  time: number;
}

// ─── Provider Interfaces ─────────────────────────────────────────────────────

/**
 * Provides noise or mistakes in the mouse movement.
 *
 * Noise is offset from the original trajectory, simulating user and physical
 * errors on mouse movement. Noise is accumulating, so on average it should
 * create an equal chance of either positive or negative movement on each axis.
 *
 * Not every step needs to add noise — use randomness to only add noise
 * sometimes, otherwise return { x: 0, y: 0 }.
 */
export interface NoiseProvider {
  getNoise(random: () => number, xStepSize: number, yStepSize: number): Point;
}

/**
 * Creates arcs or deviation into mouse movement.
 *
 * Deviation is different from Noise because it works like a mathematical
 * function — the resulting Point is added to a single trajectory point and
 * will not have any effect in the next mouse movement step.
 *
 * It is recommended that deviation decreases when completionFraction nears 1.
 */
export interface DeviationProvider {
  getDeviation(totalDistanceInPixels: number, completionFraction: number): Point;
}

/**
 * SpeedManager controls how long it takes to complete a mouse movement
 * and how fast the cursor moves at a particular moment (the flow).
 */
export interface SpeedManager {
  getFlowWithTime(distance: number): FlowWithTime;
}

/**
 * Overshoots provide a realistic way to simulate the user trying to reach
 * the destination but missing, requiring correction.
 */
export interface OvershootManager {
  /**
   * Get the number of overshoots before reaching the final destination.
   * @returns the number of overshoots, or 0 for none
   */
  getOvershoots(flow: Flow, mouseMovementMs: number, distance: number): number;

  /**
   * Returns the overshoot amount added to the real target.
   */
  getOvershootAmount(
    distanceToRealTargetX: number,
    distanceToRealTargetY: number,
    mouseMovementMs: number,
    overshootsRemaining: number,
  ): Point;

  /**
   * Once the mouse reaches an overshoot target, derive the time for the next movement.
   */
  deriveNextMouseMovementTimeMs(mouseMovementMs: number, overshootsRemaining: number): number;
}

// ─── Pluggable Backend ───────────────────────────────────────────────────────

/**
 * System-level calls abstracted for pluggable backend support.
 *
 * Implement this interface to provide mouse control for your platform.
 * For example, use `robotjs`, `@nut-tree/nut-js`, or any other native
 * mouse control library.
 *
 * @example
 * ```ts
 * import robot from 'robotjs';
 *
 * const systemCalls: SystemCalls = {
 *   currentTimeMillis: () => Date.now(),
 *   sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
 *   getScreenSize: () => {
 *     const size = robot.getScreenSize();
 *     return { width: size.width, height: size.height };
 *   },
 *   setMousePosition: (x, y) => robot.moveMouse(x, y),
 *   getMousePosition: () => {
 *     const pos = robot.getMousePos();
 *     return { x: pos.x, y: pos.y };
 *   },
 * };
 * ```
 */
export interface SystemCalls {
  /** Get current time in milliseconds */
  currentTimeMillis(): number;

  /** Non-blocking sleep for the given duration in milliseconds */
  sleep(ms: number): Promise<void>;

  /** Get screen dimensions */
  getScreenSize(): Dimension;

  /** Set the mouse cursor position */
  setMousePosition(x: number, y: number): void | Promise<void>;

  /** Get current mouse cursor position */
  getMousePosition(): Point;
}

// ─── Observer ────────────────────────────────────────────────────────────────

/** Observe each step of the mouse movement */
export type MouseMotionObserver = (x: number, y: number) => void;

// ─── Motion Nature ───────────────────────────────────────────────────────────

/**
 * MotionNature defines the complete configuration for how the mouse moves.
 *
 * All provider fields are required. Use presets (e.g. `createFastGamerNature()`)
 * for ready-made configurations, or build your own.
 */
export interface MotionNature {
  /** System-level calls (mouse control, timing) — the pluggable backend */
  systemCalls: SystemCalls;

  /** Source of randomness. Must return doubles in range [0, 1) */
  random: () => number;

  /** Provides trajectory deviation (arc from straight line) */
  deviationProvider: DeviationProvider;

  /** Provides noise (hand shakiness simulation) */
  noiseProvider: NoiseProvider;

  /** Controls overshooting behavior */
  overshootManager: OvershootManager;

  /** Controls movement speed and flow selection */
  speedManager: SpeedManager;

  /** Optional observer for each movement step */
  observer?: MouseMotionObserver;

  /**
   * Time-to-steps divider. Higher = fewer steps = less smooth.
   * @default 8
   */
  timeToStepsDivider: number;

  /**
   * Minimum number of steps for any movement.
   * @default 10
   */
  minSteps: number;

  /**
   * Number of steps at the end where effects (noise, deviation) fade to zero.
   * @default 15
   */
  effectFadeSteps: number;

  /**
   * Base reaction time (ms) after an overshoot before next movement attempt.
   * @default 20
   */
  reactionTimeBaseMs: number;

  /**
   * Random variation (ms) added to reaction time after overshoot.
   * @default 120
   */
  reactionTimeVariationMs: number;

  /**
   * Direction-dependent speed bias.
   *
   * Humans move faster horizontally (wrist pivot) than vertically (forearm/shoulder).
   * This adds a time multiplier based on movement angle, making vertical movements
   * proportionally slower — matching real biomechanical behavior.
   *
   * Set to 0 to disable. Typical range: 0.1–0.2.
   * @default 0
   */
  directionBias?: number;
}
