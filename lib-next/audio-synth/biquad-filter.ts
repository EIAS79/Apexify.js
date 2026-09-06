import type { FilterOptions } from "../types";

interface FilterState {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

interface Coefficients {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

function coefficients(filter: FilterOptions, sampleRate: number): Coefficients {
  const cutoff = Math.min(sampleRate * 0.499999, Math.max(1, filter.cutoff));
  const q = filter.q ?? Math.SQRT1_2;
  const w0 = (2 * Math.PI * cutoff) / sampleRate;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const alpha = sin / (2 * q);
  const a0 = 1 + alpha;
  const a1 = (-2 * cos) / a0;
  const a2 = (1 - alpha) / a0;

  if (filter.type === "lowpass") {
    return {
      b0: ((1 - cos) / 2) / a0,
      b1: (1 - cos) / a0,
      b2: ((1 - cos) / 2) / a0,
      a1,
      a2,
    };
  }

  return {
    b0: ((1 + cos) / 2) / a0,
    b1: (-(1 + cos)) / a0,
    b2: ((1 + cos) / 2) / a0,
    a1,
    a2,
  };
}

export interface BiquadProcessor {
  process(sample: number, channel?: number): number;
}

/** RBJ cookbook low/high-pass biquad with state isolated per channel and per operation. */
export function createBiquadProcessor(filter: FilterOptions, sampleRate: number, channels = 1): BiquadProcessor {
  const c = coefficients(filter, sampleRate);
  const states: FilterState[] = Array.from({ length: channels }, () => ({ x1: 0, x2: 0, y1: 0, y2: 0 }));

  return {
    process(sample: number, channel = 0): number {
      const state = states[channel] ?? states[0]!;
      const out = c.b0 * sample + c.b1 * state.x1 + c.b2 * state.x2 - c.a1 * state.y1 - c.a2 * state.y2;
      state.x2 = state.x1;
      state.x1 = sample;
      state.y2 = state.y1;
      state.y1 = out;
      return out;
    },
  };
}

export function filterInterleavedInPlace(
  samples: Float32Array,
  channels: 1 | 2,
  sampleRate: number,
  filter: FilterOptions
): void {
  const processor = createBiquadProcessor(filter, sampleRate, channels);
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = processor.process(samples[i]!, i % channels);
  }
}
