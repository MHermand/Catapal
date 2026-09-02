import { describe, expect, it } from "vitest";
import {
  DEFAULT_PHYSICS_PARAMS,
  createProjectile,
  simulateThrow,
  stepProjectile,
} from "./engine";

const SPEEDS = [900, 1000, 1200, 1500, 1800, 2100, 2400];
const ANGLES = [10, 20, 30, 45, 60, 70];
const MAX_TICKS = 60 * 30;

describe("moteur physique — déterminisme", () => {
  it("donne des résultats strictement identiques sur 3 exécutions", () => {
    for (const speed of SPEEDS) {
      for (const angle of ANGLES) {
        const runs = [1, 2, 3].map(() =>
          simulateThrow(speed, angle, DEFAULT_PHYSICS_PARAMS, MAX_TICKS),
        );
        for (const run of runs.slice(1)) {
          expect(run.ticks).toBe(runs[0].ticks);
          expect(run.distanceMeters).toBe(runs[0].distanceMeters);
          expect(run.finalState.x).toBe(runs[0].finalState.x);
          expect(run.finalState.y).toBe(runs[0].finalState.y);
          expect(run.finalState.vx).toBe(runs[0].finalState.vx);
          expect(run.finalState.vy).toBe(runs[0].finalState.vy);
          expect(run.finalState.rotation).toBe(runs[0].finalState.rotation);
          expect(run.finalState.bounceCount).toBe(runs[0].finalState.bounceCount);
          expect(JSON.stringify(run)).toBe(JSON.stringify(runs[0]));
        }
      }
    }
  });

  it("produit la même trajectoire tick par tick", () => {
    const a = createProjectile(0, 0, 1800, 40);
    const b = createProjectile(0, 0, 1800, 40);
    let sa = a;
    let sb = b;
    for (let i = 0; i < 600; i += 1) {
      sa = stepProjectile(sa, DEFAULT_PHYSICS_PARAMS);
      sb = stepProjectile(sb, DEFAULT_PHYSICS_PARAMS);
      expect(sa.x).toBe(sb.x);
      expect(sa.y).toBe(sb.y);
      expect(sa.vx).toBe(sb.vx);
      expect(sa.vy).toBe(sb.vy);
    }
  });
});

describe("moteur physique — terminaison", () => {
  it("s'arrête avant maxTicks sur tout le balayage d'entrées", () => {
    for (const speed of SPEEDS) {
      for (const angle of ANGLES) {
        const result = simulateThrow(speed, angle, DEFAULT_PHYSICS_PARAMS, MAX_TICKS);
        expect(result.finalState.stopped).toBe(true);
        expect(result.ticks).toBeGreaterThan(0);
        expect(result.ticks).toBeLessThan(MAX_TICKS);
      }
    }
  });

  it("finit au sol, vitesse verticale résiduelle sous le seuil d'arrêt", () => {
    for (const speed of SPEEDS) {
      for (const angle of ANGLES) {
        const { finalState } = simulateThrow(speed, angle, DEFAULT_PHYSICS_PARAMS, MAX_TICKS);
        expect(finalState.grounded).toBe(true);
        expect(finalState.y).toBe(DEFAULT_PHYSICS_PARAMS.groundY);
        expect(Math.abs(finalState.vy)).toBeLessThan(DEFAULT_PHYSICS_PARAMS.stopSpeed);
        expect(Math.hypot(finalState.vx, finalState.vy)).toBeLessThan(
          DEFAULT_PHYSICS_PARAMS.stopSpeed,
        );
      }
    }
  });

  it("ne bouge plus une fois arrêté", () => {
    const { finalState } = simulateThrow(1500, 45);
    const next = stepProjectile(finalState, DEFAULT_PHYSICS_PARAMS);
    expect(next).toBe(finalState);
  });
});

describe("moteur physique — monotonie", () => {
  it("va plus loin quand la vitesse augmente, à angle fixe", () => {
    for (const angle of ANGLES) {
      let previous = -1;
      for (let speed = 900; speed <= 2400; speed += 100) {
        const { distanceMeters } = simulateThrow(speed, angle);
        expect(distanceMeters).toBeGreaterThan(previous);
        previous = distanceMeters;
      }
    }
  });

  it("mesure une distance positive et finie", () => {
    for (const speed of SPEEDS) {
      for (const angle of ANGLES) {
        const { distanceMeters } = simulateThrow(speed, angle);
        expect(Number.isFinite(distanceMeters)).toBe(true);
        expect(distanceMeters).toBeGreaterThan(0);
      }
    }
  });
});
