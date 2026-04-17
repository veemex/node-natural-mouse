import { MovementFactory } from './movement-factory.js';
import type { Dimension, MoveOptions, MotionNature, Point, SystemCalls } from './types.js';
import { roundTowards } from './utils.js';

const SLEEP_AFTER_ADJUSTMENT_MS = 2;

function getAbortReason(signal?: AbortSignal): unknown {
  if (signal?.reason !== undefined) return signal.reason;
  const err = new Error('The operation was aborted.');
  err.name = 'AbortError';
  return err;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw getAbortReason(signal);
}

function abortableSleep(
  systemCalls: SystemCalls,
  ms: number,
  signal?: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);
  if (!signal) return systemCalls.sleep(ms);

  return new Promise<void>((resolve, reject) => {
    const onAbort = () => reject(getAbortReason(signal));
    signal.addEventListener('abort', onAbort, { once: true });
    systemCalls.sleep(ms).then(
      () => { signal.removeEventListener('abort', onAbort); resolve(); },
      (err) => { signal.removeEventListener('abort', onAbort); reject(err); },
    );
  });
}

function validateCoordinates(x: number, y: number, label: string): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new TypeError(
      `Invalid ${label}: (${x}, ${y}). Coordinates must be finite numbers.`,
    );
  }
}

function validateScreenSize(screenSize: Dimension): void {
  if (
    !Number.isFinite(screenSize.width) || screenSize.width <= 0 ||
    !Number.isFinite(screenSize.height) || screenSize.height <= 0
  ) {
    throw new RangeError(
      `Invalid screen size: ${screenSize.width}x${screenSize.height}. Dimensions must be positive.`,
    );
  }
}

/**
 * Move the mouse cursor smoothly to the destination coordinates,
 * simulating human-like movement based on the provided MotionNature.
 *
 * This is an async operation that resolves when the cursor reaches
 * its final position (including any overshoot corrections).
 *
 * **Concurrency:** This function does not protect against concurrent calls.
 * If you call move() while a previous move() is still in flight, both will
 * race on setMousePosition(). Use AbortSignal to cancel a previous movement:
 *
 * @example
 * ```ts
 * let controller: AbortController | undefined;
 *
 * async function moveTo(nature: MotionNature, x: number, y: number) {
 *   controller?.abort();
 *   controller = new AbortController();
 *   try {
 *     await move(nature, x, y, { signal: controller.signal });
 *   } catch (err) {
 *     if (err instanceof Error && err.name === 'AbortError') return;
 *     throw err;
 *   }
 * }
 * ```
 *
 * @param nature - The motion nature configuration (providers, timing, backend)
 * @param xDest - Target X coordinate
 * @param yDest - Target Y coordinate
 * @param options - Optional configuration (AbortSignal for cancellation)
 */
export async function move(
  nature: MotionNature,
  xDest: number,
  yDest: number,
  options?: MoveOptions,
): Promise<void> {
  const signal = options?.signal;

  validateCoordinates(xDest, yDest, 'destination');

  const screenSize: Dimension = nature.systemCalls.getScreenSize();
  validateScreenSize(screenSize);

  throwIfAborted(signal);

  let mousePosition: Point = nature.systemCalls.getMousePosition();

  const clampedX = Math.max(0, Math.min(screenSize.width - 1, Math.round(xDest)));
  const clampedY = Math.max(0, Math.min(screenSize.height - 1, Math.round(yDest)));

  const factory = new MovementFactory(nature, clampedX, clampedY);

  if (mousePosition.x === clampedX && mousePosition.y === clampedY) {
    return;
  }

  let movements = factory.createMovements(mousePosition);

  throwIfAborted(signal);

  while (mousePosition.x !== clampedX || mousePosition.y !== clampedY) {
    if (movements.length === 0) {
      mousePosition = nature.systemCalls.getMousePosition();
      movements = factory.createMovements(mousePosition);
    }

    const movement = movements.shift();
    if (!movement) {
      break;
    }

    throwIfAborted(signal);

    const distance = movement.distance;
    const mouseMovementMs = movement.time;
    const flow = movement.flow;
    const xDistance = movement.xDistance;
    const yDistance = movement.yDistance;

    // Calculate steps: limited by min steps and distance (no more steps than pixels)
    const steps = Math.max(1, Math.ceil(
      Math.min(
        distance,
        Math.max(mouseMovementMs / nature.timeToStepsDivider, nature.minSteps),
      ),
    ));

    const startTime = nature.systemCalls.currentTimeMillis();
    const stepTime = mouseMovementMs / steps;

    mousePosition = nature.systemCalls.getMousePosition();
    let simulatedMouseX = mousePosition.x;
    let simulatedMouseY = mousePosition.y;

    const deviationMultiplierX = (nature.random() - 0.5) * 2;
    const deviationMultiplierY = (nature.random() - 0.5) * 2;

    let completedXDistance = 0;
    let completedYDistance = 0;
    let noiseX = 0;
    let noiseY = 0;

    for (let i = 0; i < steps; i++) {
      // Time completion: 0..1 describing how far along we are
      const timeCompletion = i / steps;

      // Effect fade: linearly reduce noise/deviation in final steps for accuracy
      const effectFadeStep = Math.max(i - (steps - nature.effectFadeSteps) + 1, 0);
      const effectFadeMultiplier =
        (nature.effectFadeSteps - effectFadeStep) / nature.effectFadeSteps;

      const xStepSize = flow.getStepSize(xDistance, steps, timeCompletion);
      const yStepSize = flow.getStepSize(yDistance, steps, timeCompletion);

      completedXDistance += xStepSize;
      completedYDistance += yStepSize;
      const completedDistance = Math.hypot(completedXDistance, completedYDistance);
      const completion = distance > 0 ? Math.min(1.0, completedDistance / distance) : 1.0;

      const noise = nature.noiseProvider.getNoise(nature.random, xStepSize, yStepSize);
      const deviation = nature.deviationProvider.getDeviation(distance, completion);

      noiseX += noise.x;
      noiseY += noise.y;
      simulatedMouseX += xStepSize;
      simulatedMouseY += yStepSize;

      const endTime = startTime + stepTime * (i + 1);

      let mousePosX = roundTowards(
        simulatedMouseX +
          deviation.x * deviationMultiplierX * effectFadeMultiplier +
          noiseX * effectFadeMultiplier,
        movement.destX,
      );

      let mousePosY = roundTowards(
        simulatedMouseY +
          deviation.y * deviationMultiplierY * effectFadeMultiplier +
          noiseY * effectFadeMultiplier,
        movement.destY,
      );

      // Clamp to screen bounds
      mousePosX = Math.max(0, Math.min(screenSize.width - 1, mousePosX));
      mousePosY = Math.max(0, Math.min(screenSize.height - 1, mousePosY));

      await nature.systemCalls.setMousePosition(mousePosX, mousePosY);

      // Notify observer if present
      if (nature.observer) {
        nature.observer(mousePosX, mousePosY);
      }

      // Absolute-time scheduling: each step targets a fixed wall-clock time.
      // If a step overshoots its budget, subsequent sleeps shrink to compensate.
      const timeLeft = endTime - nature.systemCalls.currentTimeMillis();
      if (timeLeft > 0) {
        await abortableSleep(nature.systemCalls, timeLeft, signal);
      }
    }

    mousePosition = nature.systemCalls.getMousePosition();

    if (mousePosition.x !== movement.destX || mousePosition.y !== movement.destY) {
      throwIfAborted(signal);
      await nature.systemCalls.setMousePosition(movement.destX, movement.destY);
      await abortableSleep(nature.systemCalls, SLEEP_AFTER_ADJUSTMENT_MS, signal);
      mousePosition = nature.systemCalls.getMousePosition();
    }

    if (mousePosition.x !== clampedX || mousePosition.y !== clampedY) {
      const reactionTime =
        nature.reactionTimeBaseMs +
        Math.floor(nature.random() * nature.reactionTimeVariationMs);
      await abortableSleep(nature.systemCalls, reactionTime, signal);
    }
  }
}

/**
 * Generate the full trajectory path without moving the mouse.
 *
 * Returns every intermediate position the cursor would visit,
 * including overshoot corrections. Useful for:
 * - Visualizing paths (canvas, SVG)
 * - Testing trajectory quality
 * - Pre-computing paths for custom timing control
 * - Browser animations
 *
 * This is a synchronous, pure function — it does not touch any
 * system calls (no mouse movement, no sleep).
 *
 * @param nature - The motion nature configuration
 * @param from - Starting position
 * @param xDest - Target X coordinate
 * @param yDest - Target Y coordinate
 * @returns Array of points describing the full trajectory
 */
export function generatePath(
  nature: MotionNature,
  from: Point,
  xDest: number,
  yDest: number,
): Point[] {
  validateCoordinates(xDest, yDest, 'destination');
  validateCoordinates(from.x, from.y, 'from position');

  const screenSize: Dimension = nature.systemCalls.getScreenSize();
  validateScreenSize(screenSize);

  const path: Point[] = [];

  const clampedX = Math.max(0, Math.min(screenSize.width - 1, Math.round(xDest)));
  const clampedY = Math.max(0, Math.min(screenSize.height - 1, Math.round(yDest)));

  let mouseX = from.x;
  let mouseY = from.y;

  // Already at destination
  if (mouseX === clampedX && mouseY === clampedY) {
    return [{ x: mouseX, y: mouseY }];
  }

  // Create a virtual nature with overridden mouse position for path generation.
  // Use explicit delegation instead of spread to preserve class prototype methods.
  const sc = nature.systemCalls;
  const virtualNature: MotionNature = {
    ...nature,
    systemCalls: {
      currentTimeMillis: () => sc.currentTimeMillis(),
      sleep: (ms) => sc.sleep(ms),
      getScreenSize: () => sc.getScreenSize(),
      setMousePosition: () => {},
      getMousePosition: () => ({ x: mouseX, y: mouseY }),
    },
  };

  const factory = new MovementFactory(virtualNature, clampedX, clampedY);
  const movements = factory.createMovements({ x: mouseX, y: mouseY });

  for (const movement of movements) {
    const distance = movement.distance;
    const mouseMovementMs = movement.time;
    const flow = movement.flow;
    const xDistance = movement.xDistance;
    const yDistance = movement.yDistance;

    const steps = Math.max(1, Math.ceil(
      Math.min(
        distance,
        Math.max(mouseMovementMs / nature.timeToStepsDivider, nature.minSteps),
      ),
    ));

    let simulatedMouseX = mouseX;
    let simulatedMouseY = mouseY;

    const deviationMultiplierX = (nature.random() - 0.5) * 2;
    const deviationMultiplierY = (nature.random() - 0.5) * 2;

    let completedXDistance = 0;
    let completedYDistance = 0;
    let noiseX = 0;
    let noiseY = 0;

    for (let i = 0; i < steps; i++) {
      const timeCompletion = i / steps;

      const effectFadeStep = Math.max(i - (steps - nature.effectFadeSteps) + 1, 0);
      const effectFadeMultiplier =
        (nature.effectFadeSteps - effectFadeStep) / nature.effectFadeSteps;

      const xStepSize = flow.getStepSize(xDistance, steps, timeCompletion);
      const yStepSize = flow.getStepSize(yDistance, steps, timeCompletion);

      completedXDistance += xStepSize;
      completedYDistance += yStepSize;
      const completedDistance = Math.hypot(completedXDistance, completedYDistance);
      const completion = distance > 0 ? Math.min(1.0, completedDistance / distance) : 1.0;

      const noise = nature.noiseProvider.getNoise(nature.random, xStepSize, yStepSize);
      const deviation = nature.deviationProvider.getDeviation(distance, completion);

      noiseX += noise.x;
      noiseY += noise.y;
      simulatedMouseX += xStepSize;
      simulatedMouseY += yStepSize;

      let mousePosX = roundTowards(
        simulatedMouseX +
          deviation.x * deviationMultiplierX * effectFadeMultiplier +
          noiseX * effectFadeMultiplier,
        movement.destX,
      );

      let mousePosY = roundTowards(
        simulatedMouseY +
          deviation.y * deviationMultiplierY * effectFadeMultiplier +
          noiseY * effectFadeMultiplier,
        movement.destY,
      );

      mousePosX = Math.max(0, Math.min(screenSize.width - 1, mousePosX));
      mousePosY = Math.max(0, Math.min(screenSize.height - 1, mousePosY));

      path.push({ x: mousePosX, y: mousePosY });
    }

    // Snap to segment target (overshoot or final destination)
    mouseX = movement.destX;
    mouseY = movement.destY;

    const last = path[path.length - 1];
    if (!last || last.x !== movement.destX || last.y !== movement.destY) {
      path.push({ x: movement.destX, y: movement.destY });
    }
  }

  return path;
}
