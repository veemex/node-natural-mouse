/**
 * Rounds a value towards a target integer.
 * If target is above value, rounds up; otherwise rounds down.
 */
export function roundTowards(value: number, target: number): number {
  return target > value ? Math.ceil(value) : Math.floor(value);
}
