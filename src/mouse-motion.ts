import { MovementFactory } from './movement-factory.js';
import type { Dimension, MotionNature, Point } from './types.js';
import { roundTowards } from './utils.js';

const SLEEP_AFTER_ADJUSTMENT_MS = 2;

/**
 * Move the mouse cursor smoothly to the destination coordinates,
 * simulating human-like movement based on the provided MotionNature.
 *
 * This is an async operation that resolves when the cursor reaches
 * its final position (including any overshoot corrections).
 *
 * @param nature - The motion nature configuration (providers, timing, backend)
 * @param xDest - Target X coordinate
 * @param yDest - Target Y coordinate
 */
export async function move(nature: MotionNature, xDest: number, yDest: number): Promise<void> {
  const screenSize: Dimension = nature.systemCalls.getScreenSize();
  let mousePosition: Point = nature.systemCalls.getMousePosition();

  // Clamp destination to screen bounds
  const clampedX = Math.max(0, Math.min(screenSize.width - 1, Math.round(xDest)));
  const clampedY = Math.max(0, Math.min(screenSize.height - 1, Math.round(yDest)));

  const factory = new MovementFactory(nature, clampedX, clampedY);

  // Already at destination — nothing to do
  if (mousePosition.x === clampedX && mousePosition.y === clampedY) {
    return;
  }

  let movements = factory.createMovements(mousePosition);
  while (mousePosition.x !== clampedX || mousePosition.y !== clampedY) {
    if (movements.length === 0) {
      // Shouldn't normally happen, but re-attempt from current position if needed
      mousePosition = nature.systemCalls.getMousePosition();
      movements = factory.createMovements(mousePosition);
    }

    const movement = movements.shift();
    if (!movement) {
      break;
    }

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

      // Sleep for remaining step time (compensating for execution time)
      const timeLeft = endTime - nature.systemCalls.currentTimeMillis();
      if (timeLeft > 0) {
        await nature.systemCalls.sleep(timeLeft);
      }
    }

    mousePosition = nature.systemCalls.getMousePosition();

    // If we didn't land exactly on the sub-target, correct
    if (mousePosition.x !== movement.destX || mousePosition.y !== movement.destY) {
      await nature.systemCalls.setMousePosition(movement.destX, movement.destY);
      await nature.systemCalls.sleep(SLEEP_AFTER_ADJUSTMENT_MS);
      mousePosition = nature.systemCalls.getMousePosition();
    }

    // If this was an overshoot (not final target), simulate human reaction time
    if (mousePosition.x !== clampedX || mousePosition.y !== clampedY) {
      const reactionTime =
        nature.reactionTimeBaseMs +
        Math.floor(nature.random() * nature.reactionTimeVariationMs);
      await nature.systemCalls.sleep(reactionTime);
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
  const screenSize: Dimension = nature.systemCalls.getScreenSize();
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
