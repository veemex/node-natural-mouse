# natural-mouse-motion

Human-like mouse movement generation for Node.js — pluggable, async, zero native deps.

Generate realistic mouse trajectories with deviation arcs, hand shakiness, overshoots, and speed variation. Ported from [NaturalMouseMotion](https://github.com/JoonasVali/NaturalMouseMotion) (Java) via [CNaturalMouseMotion](https://github.com/barrybingo/CNaturalMouseMotion) (C++), rewritten as pure TypeScript.

## Install

```bash
pnpm add natural-mouse-motion
```

## Quick Start

```ts
import { move, createAverageUserNature } from 'natural-mouse-motion';
import type { SystemCalls } from 'natural-mouse-motion';

// 1. Provide your mouse control backend
const backend: SystemCalls = {
  currentTimeMillis: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  getScreenSize: () => ({ width: 1920, height: 1080 }),
  setMousePosition: (x, y) => { /* your mouse control here */ },
  getMousePosition: () => ({ x: 0, y: 0 }), // return current cursor position
};

// 2. Pick a preset
const nature = createAverageUserNature(backend);

// 3. Move the mouse (async, non-blocking)
await move(nature, 500, 300);
```

## Backend Adapters

The library doesn't move the mouse itself — you provide a `SystemCalls` implementation. Here are adapters for popular libraries:

### robotjs

```bash
pnpm add robotjs
```

```ts
import robot from 'robotjs';
import type { SystemCalls } from 'natural-mouse-motion';

const backend: SystemCalls = {
  currentTimeMillis: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  getScreenSize: () => robot.getScreenSize(),
  setMousePosition: (x, y) => robot.moveMouse(x, y),
  getMousePosition: () => robot.getMousePos(),
};
```

### Custom / Browser

Any environment that can get and set cursor position works:

```ts
const backend: SystemCalls = {
  currentTimeMillis: () => performance.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  getScreenSize: () => ({ width: window.innerWidth, height: window.innerHeight }),
  setMousePosition: (x, y) => {
    // dispatch synthetic mouse events, control a canvas cursor, etc.
  },
  getMousePosition: () => ({ x: lastKnownX, y: lastKnownY }),
};
```

## Presets

Four ready-made natures with different movement personalities:

```ts
import {
  createGrannyNature,
  createFastGamerNature,
  createAverageUserNature,
  createRobotNature,
} from 'natural-mouse-motion';

// Slow, shaky, lots of overshoots — like a non-technical user
const granny = createGrannyNature(backend);

// Quick, direct, small overshoots — like a competitive gamer
const gamer = createFastGamerNature(backend);

// Medium speed, average noise — standard computer user
const average = createAverageUserNature(backend);

// Constant speed, straight line, zero noise — robotic
// Second arg = milliseconds per 100 pixels of travel
const robot = createRobotNature(backend, 200);
```

## Generating Paths Without Moving

Use `generatePath()` to get the full trajectory as an array of points — no mouse movement, no async, instant:

```ts
import { generatePath, createFastGamerNature, MockSystemCalls } from 'natural-mouse-motion';

const mock = new MockSystemCalls(1920, 1080);
const nature = createFastGamerNature(mock);

const path = generatePath(nature, { x: 100, y: 100 }, 800, 600);
// → Point[] with every intermediate position

// Draw on a canvas
ctx.beginPath();
ctx.moveTo(path[0].x, path[0].y);
for (const p of path) ctx.lineTo(p.x, p.y);
ctx.stroke();
```

This is useful for:
- Visualizing trajectories before executing them
- Pre-computing paths for custom timing
- Testing and validation
- Canvas/SVG animations

## Customizing Movement

Every aspect of the movement is configurable. You can start from a preset and override individual properties:

```ts
import {
  createAverageUserNature,
  DefaultNoiseProvider,
  SinusoidalDeviationProvider,
  DefaultOvershootManager,
  DefaultSpeedManager,
  variatingFlow,
  slowStartupFlow,
} from 'natural-mouse-motion';

const nature = createAverageUserNature(backend);

// Less noise (steadier hand)
nature.noiseProvider = new DefaultNoiseProvider(4.0);

// Wider arcs
nature.deviationProvider = new SinusoidalDeviationProvider(6);

// Fewer overshoots
nature.overshootManager = new DefaultOvershootManager(Math.random, {
  overshoots: 1,
  minDistanceForOvershoots: 50,
});

// Custom speed with specific flow templates
nature.speedManager = new DefaultSpeedManager(
  [variatingFlow(), slowStartupFlow()],
  Math.random,
  600, // base time in ms
);
```

### Build a Nature From Scratch

```ts
import type { MotionNature } from 'natural-mouse-motion';
import {
  DefaultNoiseProvider,
  SinusoidalDeviationProvider,
  DefaultOvershootManager,
  DefaultSpeedManager,
  variatingFlow,
  jaggedFlow,
} from 'natural-mouse-motion';

const nature: MotionNature = {
  systemCalls: backend,
  random: Math.random,
  deviationProvider: new SinusoidalDeviationProvider(10),
  noiseProvider: new DefaultNoiseProvider(2),
  overshootManager: new DefaultOvershootManager(Math.random, { overshoots: 2 }),
  speedManager: new DefaultSpeedManager([variatingFlow(), jaggedFlow()], Math.random, 500),
  timeToStepsDivider: 8,
  minSteps: 10,
  effectFadeSteps: 15,
  reactionTimeBaseMs: 20,
  reactionTimeVariationMs: 120,
  directionBias: 0.15, // vertical movements 15% slower (biomechanical realism)
};
```

### Observer

Watch every step of the movement:

```ts
const nature = createAverageUserNature(backend);
nature.observer = (x, y) => {
  console.log(`Cursor at (${x}, ${y})`);
};
await move(nature, 500, 300);
```

### Deterministic Movements

Inject a seeded random for reproducible paths:

```ts
function seededRandom(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const nature = createFastGamerNature(backend, seededRandom(123));
// Same seed → same trajectory every time
```

## Direction Bias

Humans move the mouse faster horizontally (wrist pivot) than vertically (forearm/shoulder). The `directionBias` option models this:

```ts
// All human presets default to 0.15 (15% slower vertical movement)
nature.directionBias = 0.2;  // stronger bias
nature.directionBias = 0;    // disable (robot default)
```

## Flow Templates

Flows define the speed curve of a movement — how the cursor accelerates, decelerates, pauses, or jitters:

```ts
import {
  constantSpeed,      // flat, no variation
  variatingFlow,      // natural acceleration/deceleration
  interruptedFlow,    // mid-movement pause (hesitation)
  interruptedFlow2,   // alternative interrupted pattern
  slowStartupFlow,    // slow start, fast finish
  slowStartup2Flow,   // alternative slow start
  jaggedFlow,         // erratic, shaky movement
  stoppingFlow,       // fast start, then stop
  adjustingFlow,      // small fine-tuning movement
  randomFlow,         // fully random
} from 'natural-mouse-motion';
```

### Flow Utilities

Stretch or reduce flow arrays to different lengths:

```ts
import { stretchFlow, reduceFlow } from 'natural-mouse-motion';

const flow = variatingFlow(); // 100 elements
const stretched = stretchFlow(flow, 200); // interpolate to 200
const reduced = reduceFlow(flow, 30);     // compress to 30
```

## MockSystemCalls

For testing and visualization without real mouse control:

```ts
import { MockSystemCalls } from 'natural-mouse-motion';

// Virtual 1920x1080 screen, cursor starting at (0, 0)
const mock = new MockSystemCalls(1920, 1080, 0, 0);

// Use with any preset — tracks position internally
const nature = createAverageUserNature(mock);
await move(nature, 500, 300);
console.log(mock.getMousePosition()); // { x: 500, y: 300 }
```

## API Reference

### Core Functions

| Function | Description |
|----------|-------------|
| `move(nature, x, y)` | Async. Move cursor to (x, y) using the given nature. |
| `generatePath(nature, from, x, y)` | Sync. Generate trajectory as `Point[]` without moving. |

### Preset Factories

| Function | Style |
|----------|-------|
| `createGrannyNature(sc, random?)` | Slow, noisy, lots of overshoots |
| `createFastGamerNature(sc, random?)` | Fast, precise, small overshoots |
| `createAverageUserNature(sc, random?)` | Medium speed, average noise |
| `createRobotNature(sc, msPer100px, random?)` | Constant speed, zero noise |

### Interfaces

| Interface | Purpose |
|-----------|---------|
| `SystemCalls` | Pluggable backend — mouse control + timing |
| `MotionNature` | Full movement configuration |
| `NoiseProvider` | Hand shakiness simulation |
| `DeviationProvider` | Arc trajectory deviation |
| `SpeedManager` | Speed + flow selection |
| `OvershootManager` | Intentional target misses |
| `MouseMotionObserver` | Step-by-step position callback |

### Types

| Type | Description |
|------|-------------|
| `Point` | `{ x: number, y: number }` |
| `Dimension` | `{ width: number, height: number }` |
| `FlowWithTime` | `{ flow: Flow, time: number }` |
| `Movement` | Single movement segment data |

## How It Works

Each mouse movement follows this pipeline:

1. **Plan overshoots** — MovementFactory creates a sequence of sub-movements (overshoot targets + final target)
2. **For each sub-movement:**
   - Calculate step count from duration and distance
   - For each step:
     - Get **flow-based step size** (speed curve)
     - Add **deviation** (sinusoidal arc from straight line)
     - Add **noise** (random hand shake, accumulating)
     - Apply **effect fade** (reduce noise/deviation near target for accuracy)
     - Move cursor, sleep for step duration
   - If landed off-target, snap to exact position
3. **Between overshoots** — sleep for human reaction time, then correct

## Examples

Run the included examples:

```bash
# Visualize trajectories in browser (no extra deps)
npx tsx examples/visualize.ts

# Move the real mouse cursor (requires robotjs)
pnpm add -D robotjs
npx tsx examples/demo-real-mouse.ts
```

## Credits

- Original Java implementation: [JoonasVali/NaturalMouseMotion](https://github.com/JoonasVali/NaturalMouseMotion)
- C++11 port: [barrybingo/CNaturalMouseMotion](https://github.com/barrybingo/CNaturalMouseMotion)

## License

MIT
