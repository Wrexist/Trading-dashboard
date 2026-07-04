/**
 * Bad-tick filter (§2.2): reject a value more than N robust deviations from
 * the rolling median. Pure function, no I/O. Uses MAD (median absolute
 * deviation, scaled to σ) so a burst of bad ticks can't drag the yardstick.
 */

export interface BadTickOptions {
  /** Below this many samples we can't judge — nothing is rejected. */
  minSamples?: number;
  /** Robust σ multiplier; generous by default to only catch true garbage. */
  maxDeviations?: number;
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

const MAD_TO_SIGMA = 1.4826;

export function isBadTick(
  value: number,
  window: readonly number[],
  { minSamples = 10, maxDeviations = 8 }: BadTickOptions = {},
): boolean {
  if (!Number.isFinite(value) || value <= 0) return true;
  if (window.length < minSamples) return false;

  const sorted = [...window].sort((a, b) => a - b);
  const med = median(sorted);
  const deviations = window.map((x) => Math.abs(x - med)).sort((a, b) => a - b);
  const mad = median(deviations);

  if (mad === 0) {
    // Flat window (e.g. identical closes): fall back to a relative bound.
    return Math.abs(value - med) / med > 0.25;
  }
  return Math.abs(value - med) > maxDeviations * MAD_TO_SIGMA * mad;
}

/** Fixed-size rolling window helper for per-symbol tick history. */
export class RollingWindow {
  #values: number[] = [];
  #capacity: number;

  constructor(capacity = 120) {
    this.#capacity = capacity;
  }

  push(value: number): void {
    this.#values.push(value);
    if (this.#values.length > this.#capacity) this.#values.shift();
  }

  get values(): readonly number[] {
    return this.#values;
  }
}
