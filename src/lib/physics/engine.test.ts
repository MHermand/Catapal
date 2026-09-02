import { describe, expect, it } from "vitest";
import {
  DEFAULT_PHYSICS_PARAMS,
  FIXED_DT,
  createProjectile,
  impactAngleDeg,
  simulateThrow,
  stepProjectile,
  type ProjectileState,
} from "./engine";
import { ANGLE_MAX_DEG, ANGLE_MIN_DEG, SPEED_MAX, SPEED_MIN } from "../game/tuning";

const P = DEFAULT_PHYSICS_PARAMS;
const SPEEDS = [320, 450, 580, 700, 830, 950];
const LINE_DRIVE_ANGLES = [10, 15, 20, 25, 30];
const GOOD_ANGLES = [27.5, 30];
const PLANT_ANGLES = [40, 45, 60, 70];
const ANGLES = [...LINE_DRIVE_ANGLES, ...PLANT_ANGLES];
const MAX_TICKS = 60 * 30;
const CHARACTER_RADIUS_PX = 18;

interface Trace {
  final: ProjectileState;
  ticks: number;
  apexHeights: number[];
  flightTicks: number;
  slideTicks: number;
  slideMeters: number;
  totalMeters: number;
}

function trace(speed: number, angle: number): Trace {
  let state = createProjectile(0, 0, speed, angle);
  let ticks = 0;
  let apex = 0;
  const apexHeights: number[] = [];
  let flightTicks = 0;
  let slideTicks = 0;
  let slideStartX = 0;
  while (!state.stopped && ticks < MAX_TICKS) {
    const previous = state;
    state = stepProjectile(state, P);
    ticks += 1;
    if (state.sliding) {
      if (slideTicks === 0) {
        slideStartX = state.x;
        apexHeights.push(apex);
      }
      slideTicks += 1;
    } else {
      apex = Math.max(apex, -state.y);
      if (apexHeights.length === 0) flightTicks += 1;
      if (state.grounded && !previous.grounded) {
        apexHeights.push(apex);
        apex = 0;
      }
    }
  }
  return {
    final: state,
    ticks,
    apexHeights,
    flightTicks,
    slideTicks,
    slideMeters: slideTicks > 0 ? (state.x - slideStartX) / 10 : 0,
    totalMeters: state.x / 10,
  };
}

describe("moteur physique — déterminisme", () => {
  it("donne des résultats strictement identiques sur 3 exécutions", () => {
    for (const speed of SPEEDS) {
      for (const angle of ANGLES) {
        const runs = [1, 2, 3].map(() => simulateThrow(speed, angle, P, MAX_TICKS));
        for (const run of runs.slice(1)) {
          expect(run.ticks).toBe(runs[0].ticks);
          expect(run.distanceMeters).toBe(runs[0].distanceMeters);
          expect(JSON.stringify(run)).toBe(JSON.stringify(runs[0]));
        }
      }
    }
  });

  it("produit la même trajectoire tick par tick", () => {
    let sa = createProjectile(0, 0, 900, 25);
    let sb = createProjectile(0, 0, 900, 25);
    for (let i = 0; i < 600; i += 1) {
      sa = stepProjectile(sa, P);
      sb = stepProjectile(sb, P);
      expect(sa.x).toBe(sb.x);
      expect(sa.y).toBe(sb.y);
      expect(sa.vx).toBe(sb.vx);
      expect(sa.vy).toBe(sb.vy);
    }
  });

  it("ne dépend pas de la hauteur du sol (repère écran)", () => {
    for (const groundY of [0, 300.96, 612.72]) {
      const params = { ...P, groundY };
      for (const angle of ANGLES) {
        expect(simulateThrow(SPEED_MAX, angle, params).distanceMeters).toBeCloseTo(
          simulateThrow(SPEED_MAX, angle, P).distanceMeters,
          6,
        );
      }
    }
  });
});

describe("moteur physique — terminaison", () => {
  it("s'arrête avant maxTicks sur tout le balayage d'entrées", () => {
    for (const speed of SPEEDS) {
      for (const angle of ANGLES) {
        const result = simulateThrow(speed, angle, P, MAX_TICKS);
        expect(result.finalState.stopped).toBe(true);
        expect(result.ticks).toBeGreaterThan(0);
        expect(result.ticks).toBeLessThan(MAX_TICKS);
      }
    }
  });

  it("finit exactement au sol, immobile (vy = 0, vx = 0)", () => {
    for (const speed of SPEEDS) {
      for (const angle of ANGLES) {
        const { finalState } = simulateThrow(speed, angle, P, MAX_TICKS);
        expect(finalState.grounded).toBe(true);
        expect(finalState.y).toBe(P.groundY);
        expect(finalState.vy).toBe(0);
        expect(finalState.vx).toBe(0);
      }
    }
  });

  it("ne bouge plus une fois arrêté", () => {
    const { finalState } = simulateThrow(800, 20);
    const next = stepProjectile(finalState, P);
    expect(next).toBe(finalState);
  });

  it("tout lancer dure moins de 15 s jauges comprises", () => {
    for (let angle = ANGLE_MIN_DEG; angle <= ANGLE_MAX_DEG; angle += 0.5) {
      for (const speed of SPEEDS) {
        const { ticks } = simulateThrow(speed, angle);
        expect(ticks * FIXED_DT + 2.7).toBeLessThan(15);
      }
    }
  });
});

describe("moteur physique — régime planté (frappe trop haute)", () => {
  it("se plante net au premier contact : aucun rebond, aucune glissade", () => {
    for (const speed of SPEEDS) {
      for (const angle of PLANT_ANGLES) {
        const t = trace(speed, angle);
        expect(t.final.planted).toBe(true);
        expect(t.final.sliding).toBe(false);
        expect(t.final.bounceCount).toBe(0);
        expect(t.slideTicks).toBe(0);
        expect(t.apexHeights).toHaveLength(1);
        expect(t.ticks).toBe(t.flightTicks);
      }
    }
  });

  it("plafonne vers 200 m, même à pleine puissance", () => {
    for (let angle = 35.5; angle <= ANGLE_MAX_DEG; angle += 0.5) {
      const result = simulateThrow(SPEED_MAX, angle);
      expect(result.finalState.planted).toBe(true);
      expect(result.distanceMeters).toBeLessThanOrEqual(200);
    }
  });

  it("dépend de l'angle d'impact, pas de la vitesse", () => {
    expect(impactAngleDeg(100, 100)).toBeCloseTo(45, 9);
    expect(impactAngleDeg(1000, -100)).toBeCloseTo(impactAngleDeg(10, -1), 9);
    expect(impactAngleDeg(0, 5)).toBe(90);
  });

  it("a une frontière de plantage unique et quasi indépendante de la puissance (contact au sous-tick)", () => {
    const cliffs: number[] = [];
    for (const speed of SPEEDS) {
      let lastSafe = -1;
      let firstPlanted = -1;
      for (let i = 0; i <= 600; i += 1) {
        const angle = 20 + i * 0.05;
        const { finalState } = simulateThrow(speed, angle);
        if (finalState.planted) {
          if (firstPlanted < 0) firstPlanted = angle;
        } else {
          expect(firstPlanted).toBe(-1);
          lastSafe = angle;
        }
      }
      expect(firstPlanted).toBeGreaterThan(0);
      expect(firstPlanted - lastSafe).toBeCloseTo(0.05, 6);
      cliffs.push(firstPlanted);
    }
    for (const cliff of cliffs) {
      expect(cliff).toBeGreaterThanOrEqual(P.plantAngleDeg);
      expect(cliff).toBeLessThan(P.plantAngleDeg + 1.5);
    }
  });

  it("ne se plante jamais après un rebond", () => {
    for (const speed of SPEEDS) {
      for (let angle = ANGLE_MIN_DEG; angle <= ANGLE_MAX_DEG; angle += 0.5) {
        const { finalState } = simulateThrow(speed, angle);
        if (finalState.planted) expect(finalState.bounceCount).toBe(0);
      }
    }
  });
});

describe("moteur physique — régime tendu (rebonds puis glissade)", () => {
  it("fait 2 à 5 vrais rebonds visibles de hauteur décroissante puis glisse, sur un bon lancer", () => {
    for (const angle of [22.5, 25, ...GOOD_ANGLES]) {
      const t = trace(SPEED_MAX, angle);
      expect(t.final.planted).toBe(false);
      expect(t.final.sliding).toBe(true);
      expect(t.final.bounceCount).toBeGreaterThanOrEqual(2);
      expect(t.final.bounceCount).toBeLessThanOrEqual(5);
      expect(t.apexHeights).toHaveLength(t.final.bounceCount + 1);
      for (let i = 1; i < t.apexHeights.length; i += 1) {
        expect(t.apexHeights[i]).toBeLessThan(t.apexHeights[i - 1]);
        expect(t.apexHeights[i]).toBeGreaterThanOrEqual(CHARACTER_RADIUS_PX);
      }
    }
  });

  it("chaque rebond est un vrai rebond (pas de micro-rebonds), avec la restitution attendue", () => {
    let state = createProjectile(0, 0, SPEED_MAX, 27.5);
    let previous = state;
    let contacts = 0;
    while (!state.sliding && !state.stopped) {
      previous = state;
      state = stepProjectile(state, P);
      if (state.grounded && !state.sliding) {
        contacts += 1;
        const reboundVy = -state.vy;
        expect(reboundVy).toBeGreaterThan(P.bounceMinVy * P.groundRestitution);
        expect(reboundVy).toBeLessThanOrEqual(
          (Math.abs(previous.vy) + P.gravity * FIXED_DT) * P.groundRestitution,
        );
        expect(state.y).toBeLessThanOrEqual(P.groundY);
      }
    }
    expect(contacts).toBe(state.bounceCount);
    expect(state.sliding).toBe(true);
    expect(state.vy).toBe(0);
  });

  it("la glissade dure 2 à 5 s et vaut 30 à 50 % de la distance d'un bon lancer", () => {
    for (const angle of GOOD_ANGLES) {
      const t = trace(SPEED_MAX, angle);
      const slideS = t.slideTicks * FIXED_DT;
      expect(slideS).toBeGreaterThanOrEqual(2);
      expect(slideS).toBeLessThanOrEqual(5);
      const fraction = t.slideMeters / t.totalMeters;
      expect(fraction).toBeGreaterThanOrEqual(0.3);
      expect(fraction).toBeLessThanOrEqual(0.5);
    }
  });

  it("le vol d'un bon lancer dure entre 1,5 et 2,5 s, les rebonds 2 à 3 s", () => {
    for (const angle of GOOD_ANGLES) {
      const t = trace(SPEED_MAX, angle);
      const flightS = t.flightTicks * FIXED_DT;
      const bounceS = (t.ticks - t.flightTicks - t.slideTicks) * FIXED_DT;
      expect(flightS).toBeGreaterThanOrEqual(1.5);
      expect(flightS).toBeLessThanOrEqual(2.5);
      expect(bounceS).toBeGreaterThanOrEqual(2);
      expect(bounceS).toBeLessThanOrEqual(3.2);
    }
  });

  it("en glissade, reste collé au sol, ne tourne plus et décélère linéairement jusqu'à l'arrêt", () => {
    let state = createProjectile(0, 0, SPEED_MAX, 20);
    while (!state.sliding) state = stepProjectile(state, P);
    let previous = state;
    while (!state.stopped) {
      state = stepProjectile(state, P);
      expect(state.y).toBe(P.groundY);
      expect(state.vy).toBe(0);
      expect(state.rotation).toBe(previous.rotation);
      if (!state.stopped) {
        expect(state.vx).toBeCloseTo(previous.vx - P.slideDecel * FIXED_DT, 9);
      }
      expect(state.x).toBeGreaterThanOrEqual(previous.x);
      previous = state;
    }
    expect(previous.vx).toBe(0);
  });

  it("un lancer faible s'arrête vite : glissade proportionnelle à la vitesse d'entrée", () => {
    const weak = trace(SPEED_MIN, 20);
    const strong = trace(SPEED_MAX, 20);
    expect(weak.slideTicks * FIXED_DT).toBeLessThan(2.5);
    expect(weak.slideTicks).toBeLessThan(strong.slideTicks / 2);
  });
});

describe("moteur physique — courbe de skill", () => {
  it("l'optimum est un angle bas (< 30°), 3° au moins sous la falaise, qui bat largement le régime planté", () => {
    let bestAngle = ANGLE_MIN_DEG;
    let bestM = 0;
    let plantedMax = 0;
    let cliff = ANGLE_MAX_DEG;
    for (let angle = ANGLE_MIN_DEG; angle <= ANGLE_MAX_DEG; angle += 0.5) {
      const result = simulateThrow(SPEED_MAX, angle);
      if (result.finalState.planted) {
        plantedMax = Math.max(plantedMax, result.distanceMeters);
        cliff = Math.min(cliff, angle);
      }
      if (result.distanceMeters > bestM) {
        bestM = result.distanceMeters;
        bestAngle = angle;
      }
    }
    expect(bestAngle).toBeLessThan(30);
    expect(cliff - bestAngle).toBeGreaterThanOrEqual(3);
    expect(bestM).toBeGreaterThanOrEqual(300);
    expect(bestM).toBeLessThanOrEqual(600);
    expect(bestM).toBeGreaterThan(plantedMax * 2);
    expect(simulateThrow(SPEED_MAX, cliff - 0.5).distanceMeters).toBeLessThan(bestM * 0.98);
    for (let angle = bestAngle - 3; angle <= cliff - 1; angle += 0.5) {
      expect(simulateThrow(SPEED_MAX, angle).distanceMeters).toBeGreaterThan(bestM * 0.9);
    }
  });

  it("va plus loin quand la vitesse augmente, à angle fixe", () => {
    for (let angle = ANGLE_MIN_DEG; angle <= ANGLE_MAX_DEG; angle += 2.5) {
      let previous = -1;
      for (let i = 0; i <= 20; i += 1) {
        const speed = SPEED_MIN + ((SPEED_MAX - SPEED_MIN) * i) / 20;
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
