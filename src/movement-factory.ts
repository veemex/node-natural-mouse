import type { Flow } from './flow.js';
import type { Dimension, MotionNature, Point } from './types.js';

// ─── Movement ────────────────────────────────────────────────────────────────

/** A single movement segment from one point to another */
export interface Movement {
  destX: number;
  destY: number;
  distance: number;
  xDistance: number;
  yDistance: number;
  time: number;
  flow: Flow;
}

// ─── Movement Factory ────────────────────────────────────────────────────────

/**
 * Creates a sequence of Movement segments from the current mouse position
 * to the destination, including any overshoot targets.
 */
export class MovementFactory {
  private readonly screenSize: Dimension;

  constructor(
    private readonly nature: MotionNature,
    private readonly xDest: number,
    private readonly yDest: number,
  ) {
    this.screenSize = nature.systemCalls.getScreenSize();
  }

  createMovements(currentMousePosition: Point): Movement[] {
    const movements: Movement[] = [];
    let lastMousePositionX = currentMousePosition.x;
    let lastMousePositionY = currentMousePosition.y;
    let xDistance = this.xDest - lastMousePositionX;
    let yDistance = this.yDest - lastMousePositionY;
    const initialDistance = Math.hypot(xDistance, yDistance);

    const { flow, time: baseTime } = this.nature.speedManager.getFlowWithTime(initialDistance);
    let currentTime = applyDirectionBias(baseTime, xDistance, yDistance, this.nature.directionBias);
    const overshoots = this.nature.overshootManager.getOvershoots(flow, currentTime, initialDistance);

    if (overshoots === 0) {
      movements.push({
        destX: this.xDest,
        destY: this.yDest,
        distance: initialDistance,
        xDistance,
        yDistance,
        time: currentTime,
        flow,
      });
      return movements;
    }

    // Generate overshoot targets
    for (let i = overshoots; i > 0; i--) {
      const overshoot = this.nature.overshootManager.getOvershootAmount(
        this.xDest - lastMousePositionX,
        this.yDest - lastMousePositionY,
        currentTime,
        i,
      );
      const currentDestinationX = this.limitByScreenWidth(this.xDest + overshoot.x);
      const currentDestinationY = this.limitByScreenHeight(this.yDest + overshoot.y);

      xDistance = currentDestinationX - lastMousePositionX;
      yDistance = currentDestinationY - lastMousePositionY;
      const distance = Math.hypot(xDistance, yDistance);

      if (distance > 0) {
        const overshootFlow = this.nature.speedManager.getFlowWithTime(distance).flow;
        movements.push({
          destX: currentDestinationX,
          destY: currentDestinationY,
          distance,
          xDistance,
          yDistance,
          time: currentTime,
          flow: overshootFlow,
        });
        lastMousePositionX = currentDestinationX;
        lastMousePositionY = currentDestinationY;
        currentTime = this.nature.overshootManager.deriveNextMouseMovementTimeMs(currentTime, i - 1);
      }
    }

    // Prune movements that accidentally land on the target (from the end)
    while (movements.length > 0) {
      const last = movements[movements.length - 1];
      if (last.destX === this.xDest && last.destY === this.yDest) {
        lastMousePositionX = last.destX - last.xDistance;
        lastMousePositionY = last.destY - last.yDistance;
        movements.pop();
      } else {
        break;
      }
    }

    // Add final movement to real target
    xDistance = this.xDest - lastMousePositionX;
    yDistance = this.yDest - lastMousePositionY;
    const distance = Math.hypot(xDistance, yDistance);
    const { flow: finalFlow, time: finalBaseTime } = this.nature.speedManager.getFlowWithTime(distance);
    const finalMovementTime = this.nature.overshootManager.deriveNextMouseMovementTimeMs(finalBaseTime, 0);

    movements.push({
      destX: this.xDest,
      destY: this.yDest,
      distance,
      xDistance,
      yDistance,
      time: finalMovementTime,
      flow: finalFlow,
    });

    return movements;
  }

  private limitByScreenWidth(value: number): number {
    return Math.max(0, Math.min(this.screenSize.width - 1, value));
  }

  private limitByScreenHeight(value: number): number {
    return Math.max(0, Math.min(this.screenSize.height - 1, value));
  }
}

/**
 * Adjusts movement time based on direction angle.
 * Vertical movements are slower (forearm/shoulder) than horizontal (wrist pivot).
 */
function applyDirectionBias(
  timeMs: number,
  xDistance: number,
  yDistance: number,
  bias?: number,
): number {
  if (!bias || (xDistance === 0 && yDistance === 0)) return timeMs;
  const angle = Math.atan2(yDistance, xDistance);
  const verticalComponent = Math.abs(Math.sin(angle));
  return Math.floor(timeMs * (1.0 + bias * verticalComponent));
}
