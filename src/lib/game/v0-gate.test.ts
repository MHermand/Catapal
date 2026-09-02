import { describe, expect, it, test } from "vitest";
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
import {
  DEFAULT_GATE_OPTIONS,
  MAX_DURATION_THRESHOLD_S,
  NOVICE_RATIO_THRESHOLD,
  angleAtTap,
  angleTapTime,
  evaluateV0Gate,
  findOptimalAngle,
  mulberry32,
  percentile,
  sampleMixed,
  sampleNovice,
  sampleSkilled,
  speedAtTap,
  type PopulationStats,
} from "./v0-gate";
import { DEFAULT_PHYSICS_PARAMS } from "../physics/engine";

const SMALL = { noviceThrows: 300, skilledThrows: 300, angleSweepStepDeg: 1 };

function expectCoherent(stats: PopulationStats, expectedCount: number) {
  expect(stats.count).toBe(expectedCount);
  for (const value of [
    stats.p5M,
    stats.p50M,
    stats.p95M,
    stats.maxM,
    stats.ratioP95OverP50,
    stats.medianDurationS,
    stats.maxDurationS,
    stats.medianBounces,
    stats.maxBounces,
  ]) {
    expect(Number.isFinite(value)).toBe(true);
  }
  expect(stats.p5M).toBeGreaterThanOrEqual(0);
  expect(stats.p5M).toBeLessThanOrEqual(stats.p50M);
  expect(stats.p50M).toBeLessThanOrEqual(stats.p95M);
  expect(stats.p95M).toBeLessThanOrEqual(stats.maxM);
  expect(stats.ratioP95OverP50).toBeGreaterThanOrEqual(1);
  expect(stats.medianDurationS).toBeGreaterThan(0);
  expect(stats.medianDurationS).toBeLessThanOrEqual(stats.maxDurationS);
  expect(stats.medianBounces).toBeLessThanOrEqual(stats.maxBounces);
  expect(stats.truncatedCount).toBe(0);
}

describe("v0-gate — briques", () => {
  it("mulberry32 est déterministe et borné dans [0, 1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 1000; i += 1) {
      const va = a();
      expect(va).toBe(b());
      expect(va).toBeGreaterThanOrEqual(0);
      expect(va).toBeLessThan(1);
    }
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it("les formes d'onde reproduisent les bornes des jauges du jeu", () => {
    expect(angleAtTap(0)).toBeCloseTo((ANGLE_MIN_DEG + ANGLE_MAX_DEG) / 2, 6);
    expect(angleAtTap(ANGLE_PERIOD_S / 4)).toBeCloseTo(ANGLE_MAX_DEG, 6);
    expect(angleAtTap((3 * ANGLE_PERIOD_S) / 4)).toBeCloseTo(ANGLE_MIN_DEG, 6);
    expect(speedAtTap(0)).toBe(SPEED_MIN);
    expect(speedAtTap(POWER_HALF_PERIOD_S)).toBe(SPEED_MAX);
    expect(speedAtTap(2 * POWER_HALF_PERIOD_S)).toBe(SPEED_MIN);
    expect(speedAtTap(-POWER_HALF_PERIOD_S)).toBe(SPEED_MAX);
  });

  it("convertit un instant de tap exactement comme Game.tsx", () => {
    for (let i = 0; i <= 2000; i += 1) {
      const phaseTime = (i / 2000) * 4;
      const gameAngle = lerp(
        ANGLE_MIN_DEG,
        ANGLE_MAX_DEG,
        sineWave01(phaseTime, ANGLE_PERIOD_S),
      );
      const powerPercent = triangleWave(phaseTime, POWER_HALF_PERIOD_S) * 100;
      const gameSpeed = lerp(SPEED_MIN, SPEED_MAX, powerPercent / 100);
      expect(angleAtTap(phaseTime)).toBeCloseTo(gameAngle, 9);
      expect(speedAtTap(phaseTime)).toBeCloseTo(gameSpeed, 9);
    }
  });

  it("angleTapTime inverse la jauge d'angle", () => {
    for (let angle = ANGLE_MIN_DEG; angle <= ANGLE_MAX_DEG; angle += 5) {
      const tap = angleTapTime(angle);
      expect(tap).toBeGreaterThanOrEqual(0);
      expect(tap).toBeLessThan(ANGLE_PERIOD_S);
      expect(angleAtTap(tap)).toBeCloseTo(angle, 6);
    }
  });

  it("percentile interpole linéairement", () => {
    const values = [10, 20, 30, 40, 50];
    expect(percentile(values, 0)).toBe(10);
    expect(percentile(values, 50)).toBe(30);
    expect(percentile(values, 100)).toBe(50);
    expect(percentile(values, 25)).toBe(20);
    expect(percentile(values, 12.5)).toBe(15);
  });

  it("l'angle optimal est dans les bornes et bat les extrêmes", () => {
    const optimum = findOptimalAngle(DEFAULT_PHYSICS_PARAMS, 1);
    expect(optimum.angleDeg).toBeGreaterThanOrEqual(ANGLE_MIN_DEG);
    expect(optimum.angleDeg).toBeLessThanOrEqual(ANGLE_MAX_DEG);
    expect(optimum.distanceM).toBeGreaterThan(0);
    expect(angleAtTap(optimum.tapS)).toBeCloseTo(optimum.angleDeg, 6);
  });
});

describe("v0-gate — populations", () => {
  it("ont la taille attendue", () => {
    const rng = mulberry32(7);
    const optimum = findOptimalAngle(DEFAULT_PHYSICS_PARAMS, 1);
    expect(sampleNovice(rng, 50, DEFAULT_PHYSICS_PARAMS, 1800)).toHaveLength(50);
    expect(
      sampleSkilled(rng, 40, optimum.tapS, 0.06, DEFAULT_PHYSICS_PARAMS, 1800),
    ).toHaveLength(40);
    expect(
      sampleMixed(rng, 5, 20, optimum.tapS, 0.06, DEFAULT_PHYSICS_PARAMS, 1800),
    ).toHaveLength(100);
  });

  it("les taps novices restent dans les bornes des jauges", () => {
    const samples = sampleNovice(mulberry32(3), 500, DEFAULT_PHYSICS_PARAMS, 1800);
    for (const s of samples) {
      expect(s.angleDeg).toBeGreaterThanOrEqual(ANGLE_MIN_DEG);
      expect(s.angleDeg).toBeLessThanOrEqual(ANGLE_MAX_DEG);
      expect(s.speed).toBeGreaterThanOrEqual(SPEED_MIN);
      expect(s.speed).toBeLessThanOrEqual(SPEED_MAX);
    }
  });

  it("le joueur entraîné vise bien l'optimum (σ → 0)", () => {
    const optimum = findOptimalAngle(DEFAULT_PHYSICS_PARAMS, 1);
    const samples = sampleSkilled(
      mulberry32(5),
      10,
      optimum.tapS,
      0,
      DEFAULT_PHYSICS_PARAMS,
      1800,
    );
    for (const s of samples) {
      expect(s.angleDeg).toBeCloseTo(optimum.angleDeg, 6);
      expect(s.speed).toBe(SPEED_MAX);
      expect(s.distanceM).toBeCloseTo(optimum.distanceM, 6);
    }
  });
});

describe("v0-gate — evaluateV0Gate", () => {
  const report = evaluateV0Gate(DEFAULT_PHYSICS_PARAMS, SMALL);

  it("est déterministe", () => {
    const again = evaluateV0Gate(DEFAULT_PHYSICS_PARAMS, SMALL);
    expect(JSON.stringify(again)).toBe(JSON.stringify(report));
  });

  it("renvoie des mesures finies et cohérentes", () => {
    expectCoherent(report.novice, SMALL.noviceThrows);
    expectCoherent(report.skilled, SMALL.skilledThrows);
    expectCoherent(
      report.mixed,
      DEFAULT_GATE_OPTIONS.mixedTesters * DEFAULT_GATE_OPTIONS.mixedThrowsPerTester,
    );
    expect(Number.isFinite(report.skilledOverNoviceMedianRatio)).toBe(true);
    expect(report.skilledOverNoviceMedianRatio).toBeGreaterThan(1);
    expect(report.maxDurationS).toBeGreaterThanOrEqual(report.novice.maxDurationS);
    expect(report.maxDurationS).toBeGreaterThanOrEqual(report.skilled.maxDurationS);
    expect(report.maxDurationS).toBeGreaterThanOrEqual(report.mixed.maxDurationS);
  });

  it("expose un booléen par critère mesurable, cohérent avec les valeurs", () => {
    expect(report.criteria.map((c) => c.id)).toEqual(["noviceRatio", "maxDuration"]);
    const [ratio, duration] = report.criteria;
    expect(ratio.value).toBe(report.novice.ratioP95OverP50);
    expect(ratio.pass).toBe(ratio.value >= NOVICE_RATIO_THRESHOLD);
    expect(duration.value).toBe(report.maxDurationS);
    expect(duration.pass).toBe(duration.value < MAX_DURATION_THRESHOLD_S);
    expect(report.allGreen).toBe(ratio.pass && duration.pass);
  });

  // activé par le tuning V0
  test.skip("gate : ratio novice p95/p50 ≥ 3 et durée max < 15 s", () => {
    const full = evaluateV0Gate();
    expect(full.novice.ratioP95OverP50).toBeGreaterThanOrEqual(NOVICE_RATIO_THRESHOLD);
    expect(full.maxDurationS).toBeLessThan(MAX_DURATION_THRESHOLD_S);
    expect(full.allGreen).toBe(true);
  });
});
