/**
 * Utilities for manipulating flow characteristic arrays.
 */

export type FlowModifier = (value: number) => number;

/**
 * Reduces a flow array to a shorter target length.
 *
 * Reduction causes loss of information, so the resulting flow is
 * 'good enough' but not guaranteed to be equivalent — just shorter.
 */
export function reduceFlow(flow: number[], targetLength: number): number[] {
  if (flow.length <= targetLength) {
    throw new Error('Target length must be smaller than current flow length');
  }

  const multiplier = targetLength / flow.length;
  const result = new Array<number>(targetLength).fill(0);

  for (let i = 0; i < flow.length; i++) {
    const index = i * multiplier;
    const untilIndex = (i + 1) * multiplier;
    const indexInt = Math.floor(index);
    const untilIndexInt = Math.floor(untilIndex);

    if (indexInt !== untilIndexInt) {
      const resultIndexPortion = 1 - (index - indexInt);
      const nextResultIndexPortion = untilIndex - untilIndexInt;
      result[indexInt] += flow[i] * resultIndexPortion;
      if (untilIndexInt < result.length) {
        result[untilIndexInt] += flow[i] * nextResultIndexPortion;
      }
    } else {
      result[indexInt] += flow[i] * (untilIndex - index);
    }
  }

  return result;
}

/**
 * Stretches a flow array to a longer target length, filling gaps with interpolated values.
 *
 * @param flow - The original flow array
 * @param targetLength - Desired output length (must be >= flow.length)
 * @param modifier - Optional function to modify each resulting value (e.g. add noise)
 */
export function stretchFlow(
  flow: number[],
  targetLength: number,
  modifier?: FlowModifier,
): number[] {
  if (targetLength < flow.length) {
    throw new Error('Target length must be >= current flow length');
  }

  // Single-element flow: just fill with that value
  if (flow.length === 1) {
    const result = new Array<number>(targetLength).fill(flow[0]);
    return modifier ? result.map(modifier) : result;
  }

  let tempLength = targetLength;

  if (flow.length !== 1 && (tempLength - flow.length) % (flow.length - 1) !== 0) {
    tempLength = (flow.length - 1) * (tempLength - flow.length) + 1;
  }

  const result = new Array<number>(tempLength);
  const insider = flow.length - 2;
  const stepLength = Math.floor((tempLength - 2) / (insider + 1)) + 1;
  let countToNextStep = stepLength;
  let fillValueIndex = 0;

  for (let i = 0; i < tempLength; i++) {
    const fillValueBottom = flow[fillValueIndex];
    const fillValueTop =
      fillValueIndex + 1 < flow.length ? flow[fillValueIndex + 1] : flow[fillValueIndex];

    const completion = (stepLength - countToNextStep) / stepLength;
    result[i] = fillValueBottom * (1 - completion) + fillValueTop * completion;

    countToNextStep--;
    if (countToNextStep === 0) {
      countToNextStep = stepLength;
      fillValueIndex++;
    }
  }

  let finalResult = tempLength !== targetLength ? reduceFlow(result, targetLength) : result;

  if (modifier) {
    finalResult = finalResult.map(modifier);
  }

  return finalResult;
}
