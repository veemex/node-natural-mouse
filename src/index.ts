// ─── Core ────────────────────────────────────────────────────────────────────
export { move, generatePath } from './mouse-motion.js';

// ─── Types & Interfaces ─────────────────────────────────────────────────────
export type {
  Point,
  Dimension,
  FlowWithTime,
  NoiseProvider,
  DeviationProvider,
  SpeedManager,
  OvershootManager,
  SystemCalls,
  MouseMotionObserver,
  MotionNature,
} from './types.js';

// ─── Flow System ─────────────────────────────────────────────────────────────
export { Flow } from './flow.js';

export {
  constantSpeed,
  variatingFlow,
  interruptedFlow,
  interruptedFlow2,
  slowStartupFlow,
  slowStartup2Flow,
  jaggedFlow,
  stoppingFlow,
  adjustingFlow,
  randomFlow,
} from './flow-templates.js';

export { reduceFlow, stretchFlow } from './flow-utils.js';
export type { FlowModifier } from './flow-utils.js';

// ─── Default Providers ───────────────────────────────────────────────────────
export {
  DefaultNoiseProvider,
  SinusoidalDeviationProvider,
  DefaultOvershootManager,
  DefaultSpeedManager,
  MockSystemCalls,
} from './providers.js';
export type { DefaultOvershootManagerOptions } from './providers.js';

// ─── Movement ────────────────────────────────────────────────────────────────
export { MovementFactory } from './movement-factory.js';
export type { Movement } from './movement-factory.js';

// ─── Presets ─────────────────────────────────────────────────────────────────
export {
  createGrannyNature,
  createFastGamerNature,
  createAverageUserNature,
  createRobotNature,
} from './presets.js';

// ─── Utils ───────────────────────────────────────────────────────────────────
export { roundTowards } from './utils.js';
