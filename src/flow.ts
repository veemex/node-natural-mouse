/**
 * Flow defines how slow or fast the cursor moves at a particular moment.
 *
 * It does not define the trajectory — only the speed characteristics:
 * how jagged or smooth, accelerating or decelerating the movement is.
 *
 * The characteristics array is normalized so the average bucket value is 100.
 * Each element represents a proportional time slice of the movement.
 *
 * Example: [1, 2, 3, 4] means the movement accelerates —
 * in the last 25% of time, the cursor is 4x faster than the first 25%.
 */
export class Flow {
  private static readonly AVERAGE_BUCKET_VALUE = 100;

  private readonly buckets: number[];

  constructor(characteristics: number[]) {
    this.buckets = Flow.normalizeBuckets(characteristics);
  }

  getFlowCharacteristics(): number[] {
    return [...this.buckets];
  }

  getBucketCount(): number {
    return this.buckets.length;
  }

  /**
   * Get the step size for a single axis at the given completion point.
   *
   * @param distance - Total distance on this axis from start to target (pixels)
   * @param steps - Total number of steps in the movement
   * @param completion - Value between 0 and 1 describing movement completion in time
   * @returns The step size to take next
   */
  getStepSize(distance: number, steps: number, completion: number): number {
    const completionStep = 1.0 / steps;
    const bucketFrom = completion * this.buckets.length;
    const bucketUntil = (completion + completionStep) * this.buckets.length;
    const bucketContents = this.getBucketsContents(bucketFrom, bucketUntil);
    const distancePerBucketContent = distance / (this.buckets.length * Flow.AVERAGE_BUCKET_VALUE);
    return bucketContents * distancePerBucketContent;
  }

  /**
   * Sums bucket contents from bucketFrom to bucketUntil, handling fractional indices.
   *
   * Example: getBucketsContents(0.6, 2.4) returns
   *   0.4 * bucket[0] + 1 * bucket[1] + 0.4 * bucket[2]
   */
  private getBucketsContents(bucketFrom: number, bucketUntil: number): number {
    let sum = 0;
    for (let i = Math.floor(bucketFrom); i < bucketUntil; i++) {
      let value = this.buckets[i];
      let endMultiplier = 1;
      let startMultiplier = 0;

      if (bucketUntil < i + 1) {
        endMultiplier = bucketUntil - Math.floor(bucketUntil);
      }
      if (Math.floor(bucketFrom) === i) {
        startMultiplier = bucketFrom - Math.floor(bucketFrom);
      }
      value *= endMultiplier - startMultiplier;
      sum += value;
    }
    return sum;
  }

  /**
   * Normalizes characteristics so the average bucket value equals AVERAGE_BUCKET_VALUE.
   */
  private static normalizeBuckets(characteristics: number[]): number[] {
    if (characteristics.length === 0) {
      throw new Error('FlowCharacteristics must not be empty');
    }

    let sum = 0;
    for (const v of characteristics) {
      if (v < 0) {
        throw new Error('Invalid FlowCharacteristics: values must be non-negative');
      }
      sum += v;
    }

    if (sum === 0) {
      throw new Error('Invalid FlowCharacteristics: all elements cannot be 0');
    }

    const multiplier = (Flow.AVERAGE_BUCKET_VALUE * characteristics.length) / sum;
    return characteristics.map((v) => v * multiplier);
  }
}
