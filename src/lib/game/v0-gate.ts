import {
  DEFAULT_PHYSICS_PARAMS,
  FIXED_DT,
  simulateThrow,
  type PhysicsParams,
} from "../physics/engine";
import {
  ANGLE_MAX_DEG,
  ANGLE_MIN_DEG,
  ANGLE_PERIOD_S,
  POWER_HALF_PERIOD_S,
  SPEED_MAX,
  SPEED_MIN,
  lerp,
  sineWave01,
  triangleWave,
} from "./tuning";

export interface GateOptions {
  seed: number;
  noviceThrows: number;
  skilledThrows: number;
  timingSigmaS: number;
  mixedTesters: number;
  mixedThrowsPerTester: number;
  angleSweepStepDeg: number;
  maxTicks: number;
}

export const DEFAULT_GATE_OPTIONS: GateOptions = {
  seed: 42,
  noviceThrows: 4000,
  skilledThrows: 4000,
  timingSigmaS: 0.06,
  mixedTesters: 5,
  mixedThrowsPerTester: 20,
  angleSweepStepDeg: 0.5,
  maxTicks: 60 * 30,
};

export const NOVICE_RATIO_THRESHOLD = 3;
export const MAX_DURATION_THRESHOLD_S = 15;

export const POWER_PERIOD_S = POWER_HALF_PERIOD_S * 2;
export const FULL_POWER_TAP_S = POWER_HALF_PERIOD_S;

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussian(rng: Rng): number {
  const u = 1 - rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function wrapTime(timeS: number, periodS: number): number {
  return ((timeS % periodS) + periodS) % periodS;
}

export function angleAtTap(tapS: number): number {
  const t = wrapTime(tapS, ANGLE_PERIOD_S);
  return lerp(ANGLE_MIN_DEG, ANGLE_MAX_DEG, sineWave01(t, ANGLE_PERIOD_S));
}

export function speedAtTap(tapS: number): number {
  const t = wrapTime(tapS, POWER_PERIOD_S);
  return lerp(SPEED_MIN, SPEED_MAX, triangleWave(t, POWER_HALF_PERIOD_S));
}

export function angleTapTime(angleDeg: number): number {
  const u = (angleDeg - ANGLE_MIN_DEG) / (ANGLE_MAX_DEG - ANGLE_MIN_DEG);
  const clamped = Math.min(1, Math.max(0, u));
  const t = (ANGLE_PERIOD_S / (2 * Math.PI)) * Math.asin(2 * clamped - 1);
  return wrapTime(t, ANGLE_PERIOD_S);
}

export interface ThrowSample {
  angleTapS: number;
  powerTapS: number;
  angleDeg: number;
  speed: number;
  distanceM: number;
  ticks: number;
  durationS: number;
  bounces: number;
  truncated: boolean;
}

export function simulateTap(
  angleTapS: number,
  powerTapS: number,
  params: PhysicsParams = DEFAULT_PHYSICS_PARAMS,
  maxTicks: number = DEFAULT_GATE_OPTIONS.maxTicks,
): ThrowSample {
  const angleDeg = angleAtTap(angleTapS);
  const speed = speedAtTap(powerTapS);
  const result = simulateThrow(speed, angleDeg, params, maxTicks);
  return {
    angleTapS,
    powerTapS,
    angleDeg,
    speed,
    distanceM: result.distanceMeters,
    ticks: result.ticks,
    durationS: result.ticks * FIXED_DT,
    bounces: result.finalState.bounceCount,
    truncated: !result.finalState.stopped,
  };
}

export interface OptimalAngle {
  angleDeg: number;
  distanceM: number;
  durationS: number;
  tapS: number;
}

export function findOptimalAngle(
  params: PhysicsParams = DEFAULT_PHYSICS_PARAMS,
  stepDeg: number = DEFAULT_GATE_OPTIONS.angleSweepStepDeg,
  maxTicks: number = DEFAULT_GATE_OPTIONS.maxTicks,
): OptimalAngle {
  let best: OptimalAngle = { angleDeg: ANGLE_MIN_DEG, distanceM: -1, durationS: 0, tapS: 0 };
  const steps = Math.round((ANGLE_MAX_DEG - ANGLE_MIN_DEG) / stepDeg);
  for (let i = 0; i <= steps; i += 1) {
    const angleDeg = Math.min(ANGLE_MAX_DEG, ANGLE_MIN_DEG + i * stepDeg);
    const result = simulateThrow(SPEED_MAX, angleDeg, params, maxTicks);
    if (result.distanceMeters > best.distanceM) {
      best = {
        angleDeg,
        distanceM: result.distanceMeters,
        durationS: result.ticks * FIXED_DT,
        tapS: angleTapTime(angleDeg),
      };
    }
  }
  return best;
}

export function noviceTap(rng: Rng): { angleTapS: number; powerTapS: number } {
  return {
    angleTapS: rng() * ANGLE_PERIOD_S,
    powerTapS: rng() * POWER_PERIOD_S,
  };
}

export function skilledTap(
  rng: Rng,
  optimalAngleTapS: number,
  timingSigmaS: number,
): { angleTapS: number; powerTapS: number } {
  return {
    angleTapS: optimalAngleTapS + gaussian(rng) * timingSigmaS,
    powerTapS: FULL_POWER_TAP_S + gaussian(rng) * timingSigmaS,
  };
}

export function sampleNovice(
  rng: Rng,
  count: number,
  params: PhysicsParams,
  maxTicks: number,
): ThrowSample[] {
  const samples: ThrowSample[] = [];
  for (let i = 0; i < count; i += 1) {
    const tap = noviceTap(rng);
    samples.push(simulateTap(tap.angleTapS, tap.powerTapS, params, maxTicks));
  }
  return samples;
}

export function sampleSkilled(
  rng: Rng,
  count: number,
  optimalAngleTapS: number,
  timingSigmaS: number,
  params: PhysicsParams,
  maxTicks: number,
): ThrowSample[] {
  const samples: ThrowSample[] = [];
  for (let i = 0; i < count; i += 1) {
    const tap = skilledTap(rng, optimalAngleTapS, timingSigmaS);
    samples.push(simulateTap(tap.angleTapS, tap.powerTapS, params, maxTicks));
  }
  return samples;
}

export function sampleMixed(
  rng: Rng,
  testers: number,
  throwsPerTester: number,
  optimalAngleTapS: number,
  timingSigmaS: number,
  params: PhysicsParams,
  maxTicks: number,
): ThrowSample[] {
  const samples: ThrowSample[] = [];
  for (let tester = 0; tester < testers; tester += 1) {
    for (let i = 0; i < throwsPerTester; i += 1) {
      const progress = throwsPerTester > 1 ? i / (throwsPerTester - 1) : 1;
      const tap =
        rng() < progress
          ? skilledTap(rng, optimalAngleTapS, timingSigmaS)
          : noviceTap(rng);
      samples.push(simulateTap(tap.angleTapS, tap.powerTapS, params, maxTicks));
    }
  }
  return samples;
}

export function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return Number.NaN;
  const index = (p / 100) * (sortedValues.length - 1);
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  const weight = index - lo;
  return sortedValues[lo] + (sortedValues[hi] - sortedValues[lo]) * weight;
}

export interface PopulationStats {
  name: string;
  count: number;
  p5M: number;
  p50M: number;
  p95M: number;
  maxM: number;
  ratioP95OverP50: number;
  medianDurationS: number;
  maxDurationS: number;
  medianBounces: number;
  maxBounces: number;
  truncatedCount: number;
}

export function summarize(name: string, samples: ThrowSample[]): PopulationStats {
  const distances = samples.map((s) => s.distanceM).sort((a, b) => a - b);
  const durations = samples.map((s) => s.durationS).sort((a, b) => a - b);
  const bounces = samples.map((s) => s.bounces).sort((a, b) => a - b);
  const p50M = percentile(distances, 50);
  const p95M = percentile(distances, 95);
  return {
    name,
    count: samples.length,
    p5M: percentile(distances, 5),
    p50M,
    p95M,
    maxM: distances[distances.length - 1],
    ratioP95OverP50: p50M > 0 ? p95M / p50M : Number.POSITIVE_INFINITY,
    medianDurationS: percentile(durations, 50),
    maxDurationS: durations[durations.length - 1],
    medianBounces: percentile(bounces, 50),
    maxBounces: bounces[bounces.length - 1],
    truncatedCount: samples.filter((s) => s.truncated).length,
  };
}

export interface GateCriterion {
  id: string;
  label: string;
  value: number;
  threshold: number;
  comparator: ">=" | "<";
  pass: boolean;
}

export interface V0GateReport {
  params: PhysicsParams;
  options: GateOptions;
  optimalAngle: OptimalAngle;
  novice: PopulationStats;
  skilled: PopulationStats;
  mixed: PopulationStats;
  skilledOverNoviceMedianRatio: number;
  maxDurationS: number;
  criteria: GateCriterion[];
  allGreen: boolean;
}

export function evaluateV0Gate(
  params: PhysicsParams = DEFAULT_PHYSICS_PARAMS,
  options: Partial<GateOptions> = {},
): V0GateReport {
  const opts: GateOptions = { ...DEFAULT_GATE_OPTIONS, ...options };
  const rng = mulberry32(opts.seed);
  const optimalAngle = findOptimalAngle(params, opts.angleSweepStepDeg, opts.maxTicks);

  const novice = summarize(
    "novice",
    sampleNovice(rng, opts.noviceThrows, params, opts.maxTicks),
  );
  const skilled = summarize(
    "entraîné",
    sampleSkilled(
      rng,
      opts.skilledThrows,
      optimalAngle.tapS,
      opts.timingSigmaS,
      params,
      opts.maxTicks,
    ),
  );
  const mixed = summarize(
    "mixte",
    sampleMixed(
      rng,
      opts.mixedTesters,
      opts.mixedThrowsPerTester,
      optimalAngle.tapS,
      opts.timingSigmaS,
      params,
      opts.maxTicks,
    ),
  );

  const maxDurationS = Math.max(
    novice.maxDurationS,
    skilled.maxDurationS,
    mixed.maxDurationS,
    optimalAngle.durationS,
  );

  const criteria: GateCriterion[] = [
    {
      id: "noviceRatio",
      label: "Ratio p95 / p50 novice (le skill doit payer)",
      value: novice.ratioP95OverP50,
      threshold: NOVICE_RATIO_THRESHOLD,
      comparator: ">=",
      pass: novice.ratioP95OverP50 >= NOVICE_RATIO_THRESHOLD,
    },
    {
      id: "maxDuration",
      label: "Durée max d'un lancer (partie < 15 s)",
      value: maxDurationS,
      threshold: MAX_DURATION_THRESHOLD_S,
      comparator: "<",
      pass: maxDurationS < MAX_DURATION_THRESHOLD_S,
    },
  ];

  return {
    params,
    options: opts,
    optimalAngle,
    novice,
    skilled,
    mixed,
    skilledOverNoviceMedianRatio:
      novice.p50M > 0 ? skilled.p50M / novice.p50M : Number.POSITIVE_INFINITY,
    maxDurationS,
    criteria,
    allGreen: criteria.every((c) => c.pass),
  };
}
