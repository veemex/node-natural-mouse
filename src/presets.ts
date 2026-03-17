import { Flow } from './flow.js';
import * as FlowTemplates from './flow-templates.js';
import {
  DefaultNoiseProvider,
  DefaultOvershootManager,
  DefaultSpeedManager,
  SinusoidalDeviationProvider,
} from './providers.js';
import type { MotionNature, SystemCalls } from './types.js';

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULTS = {
  timeToStepsDivider: 8,
  minSteps: 10,
  effectFadeSteps: 15,
  reactionTimeBaseMs: 20,
  reactionTimeVariationMs: 120,
  directionBias: 0.15,
} as const;

function defaultRandom(): () => number {
  return Math.random;
}

// ─── Base Nature Builder ─────────────────────────────────────────────────────

function createBaseNature(systemCalls: SystemCalls, random = defaultRandom()): MotionNature {
  return {
    systemCalls,
    random,
    deviationProvider: new SinusoidalDeviationProvider(),
    noiseProvider: new DefaultNoiseProvider(),
    overshootManager: new DefaultOvershootManager(random),
    speedManager: new DefaultSpeedManager(
      [
        FlowTemplates.constantSpeed(),
        FlowTemplates.variatingFlow(),
        FlowTemplates.interruptedFlow(),
        FlowTemplates.interruptedFlow2(),
        FlowTemplates.slowStartupFlow(),
        FlowTemplates.slowStartup2Flow(),
        FlowTemplates.adjustingFlow(),
        FlowTemplates.jaggedFlow(),
        FlowTemplates.stoppingFlow(),
      ],
      random,
    ),
    ...DEFAULTS,
  };
}

// ─── Preset Factories ────────────────────────────────────────────────────────

/**
 * Stereotypical granny using a computer with a non-optical mouse from the 90s.
 * Low speed, variating flow, lots of noise in movement.
 */
export function createGrannyNature(systemCalls: SystemCalls, random = defaultRandom()): MotionNature {
  return {
    ...createBaseNature(systemCalls, random),
    timeToStepsDivider: DEFAULTS.timeToStepsDivider - 2,
    reactionTimeBaseMs: 100,
    deviationProvider: new SinusoidalDeviationProvider(9),
    noiseProvider: new DefaultNoiseProvider(1.6),
    overshootManager: new DefaultOvershootManager(random, {
      overshoots: 3,
      minDistanceForOvershoots: 3,
      minOvershootMovementMs: 400,
      overshootRandomModifierDivider:
        DefaultOvershootManager.DEFAULT_OVERSHOOT_RANDOM_MODIFIER_DIVIDER / 2,
      overshootSpeedupDivider:
        DefaultOvershootManager.DEFAULT_OVERSHOOT_SPEEDUP_DIVIDER * 2,
    }),
    speedManager: new DefaultSpeedManager(
      [
        FlowTemplates.jaggedFlow(),
        FlowTemplates.randomFlow(random),
        FlowTemplates.interruptedFlow(),
        FlowTemplates.interruptedFlow2(),
        FlowTemplates.adjustingFlow(),
        FlowTemplates.stoppingFlow(),
      ],
      random,
      1000,
    ),
  };
}

/**
 * Gamer with fast reflexes and quick mouse movements.
 * Quick movement, low noise, some deviation, lots of overshoots.
 */
export function createFastGamerNature(systemCalls: SystemCalls, random = defaultRandom()): MotionNature {
  return {
    ...createBaseNature(systemCalls, random),
    reactionTimeVariationMs: 100,
    overshootManager: new DefaultOvershootManager(random, {
      overshoots: 4,
    }),
    speedManager: new DefaultSpeedManager(
      [
        FlowTemplates.variatingFlow(),
        FlowTemplates.slowStartupFlow(),
        FlowTemplates.slowStartup2Flow(),
        FlowTemplates.adjustingFlow(),
        FlowTemplates.jaggedFlow(),
      ],
      random,
      250,
    ),
  };
}

/**
 * Standard computer user with average speed and movement mistakes.
 * Medium noise, medium speed, medium deviation.
 */
export function createAverageUserNature(systemCalls: SystemCalls, random = defaultRandom()): MotionNature {
  return {
    ...createBaseNature(systemCalls, random),
    reactionTimeVariationMs: 110,
    overshootManager: new DefaultOvershootManager(random, {
      overshoots: 4,
    }),
    speedManager: new DefaultSpeedManager(
      [
        FlowTemplates.variatingFlow(),
        FlowTemplates.interruptedFlow(),
        FlowTemplates.interruptedFlow2(),
        FlowTemplates.slowStartupFlow(),
        FlowTemplates.slowStartup2Flow(),
        FlowTemplates.adjustingFlow(),
        FlowTemplates.jaggedFlow(),
        FlowTemplates.stoppingFlow(),
      ],
      random,
      400,
    ),
  };
}

/**
 * Robotic fluent movement.
 * Custom speed, constant movement, no mistakes, no overshoots.
 *
 * @param motionTimeMsPer100Pixels - Approximate time per 100px of travel
 */
export function createRobotNature(
  systemCalls: SystemCalls,
  motionTimeMsPer100Pixels: number,
  random = defaultRandom(),
): MotionNature {
  const constantFlow = new Flow(FlowTemplates.constantSpeed());

  return {
    ...createBaseNature(systemCalls, random),
    directionBias: 0,
    deviationProvider: { getDeviation: () => ({ x: 0, y: 0 }) },
    noiseProvider: { getNoise: () => ({ x: 0, y: 0 }) },
    overshootManager: new DefaultOvershootManager(random, {
      overshoots: 0,
    }),
    speedManager: {
      getFlowWithTime(distance: number) {
        const timePerPixel = motionTimeMsPer100Pixels / 100;
        return { flow: constantFlow, time: Math.floor(timePerPixel * distance) };
      },
    },
  };
}
