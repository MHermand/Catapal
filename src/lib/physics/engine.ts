/**
 * Intégrateur physique custom (Euler semi-implicite, pas fixe).
 *
 * Volontairement pas un moteur rigid body : la physique de ce genre de jeu
 * est une courbe de plaisir déguisée en physique (voir docs/PRD.md 2.2), pas
 * une simulation. Ce module doit rester pur (aucun Date.now/Math.random non
 * seedé, aucune dépendance au framerate réel) pour rester rejouable au pixel
 * près côté serveur à partir de la V1 (docs/PRD.md 2.5).
 *
 * Trois régimes au sol, clonés de la référence V0 (docs/versions/v0.md) :
 * plantage tête la première si l'angle d'impact est trop vertical, vrai
 * rebond tant que la vitesse verticale d'impact est franche, sinon glissade
 * horizontale qui décélère jusqu'à l'arrêt. Le contact est résolu au
 * sous-tick (vitesse interpolée au franchissement du sol) pour que la
 * frontière planté / non planté soit une fonction continue de l'angle de
 * lancement, pas un artefact de la position du tick d'impact.
 */

export const FIXED_DT = 1 / 60;

export interface PhysicsParams {
  /** px/s², positif = vers le bas */
  gravity: number;
  /** multiplicateur de vitesse appliqué chaque tick, en vol */
  airDrag: number;
  /** coefficient de restitution verticale à chaque vrai rebond (0..1) */
  groundRestitution: number;
  /** multiplicateur de la vitesse horizontale à chaque contact au sol */
  groundFriction: number;
  /** part de la vitesse verticale d'impact convertie en vitesse horizontale */
  impactLift: number;
  /** part de la vitesse horizontale perdue à un contact à la limite du plantage (loi en carré de l'angle d'impact) */
  impactDig: number;
  /** angle d'impact (degrés, 90 = vertical) au-delà duquel le personnage se plante */
  plantAngleDeg: number;
  /** vitesse verticale d'impact (px/s) en dessous de laquelle on glisse au lieu de rebondir */
  bounceMinVy: number;
  /** décélération constante (px/s²) de la glissade */
  slideDecel: number;
  /** vitesse (px/s) en dessous de laquelle, en glissade, la partie s'arrête */
  stopSpeed: number;
  /** coordonnée y (px) du niveau du sol */
  groundY: number;
}

export const DEFAULT_PHYSICS_PARAMS: PhysicsParams = {
  gravity: 500,
  airDrag: 1,
  groundRestitution: 0.7,
  groundFriction: 0.9,
  impactLift: 0.45,
  impactDig: 0.3,
  plantAngleDeg: 35,
  bounceMinVy: 200,
  slideDecel: 135,
  stopSpeed: 40,
  groundY: 0,
};

/** 10 px = 1 mètre, cf. docs/PRD.md 2.2 */
export const PIXELS_PER_METER = 10;

export interface ProjectileState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  bounceCount: number;
  grounded: boolean;
  sliding: boolean;
  planted: boolean;
  stopped: boolean;
}

export function createProjectile(
  x: number,
  y: number,
  speed: number,
  angleDeg: number,
): ProjectileState {
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    x,
    y,
    vx: Math.cos(angleRad) * speed,
    // convention écran : y croît vers le bas, donc un lancer "vers le haut" est négatif
    vy: -Math.sin(angleRad) * speed,
    rotation: 0,
    bounceCount: 0,
    grounded: false,
    sliding: false,
    planted: false,
    stopped: false,
  };
}

export function impactAngleDeg(vx: number, vy: number): number {
  return (Math.atan2(Math.abs(vy), Math.abs(vx)) * 180) / Math.PI;
}

function stepSliding(
  state: ProjectileState,
  params: PhysicsParams,
  dt: number,
): ProjectileState {
  let vx = state.vx - params.slideDecel * dt;
  let stopped = false;
  if (vx < params.stopSpeed) {
    vx = 0;
    stopped = true;
  }
  return {
    ...state,
    x: state.x + vx * dt,
    y: params.groundY,
    vx,
    vy: 0,
    grounded: true,
    sliding: true,
    stopped,
  };
}

export function stepProjectile(
  state: ProjectileState,
  params: PhysicsParams,
  dt: number = FIXED_DT,
): ProjectileState {
  if (state.stopped) return state;
  if (state.sliding) return stepSliding(state, params, dt);

  const { bounceCount } = state;
  const vx = state.vx * params.airDrag;
  const vy = (state.vy + params.gravity * dt) * params.airDrag;
  const nextX = state.x + vx * dt;
  const nextY = state.y + vy * dt;
  const rotation = state.rotation + vx * 0.01 * dt;

  if (nextY < params.groundY) {
    return {
      x: nextX,
      y: nextY,
      vx,
      vy,
      rotation,
      bounceCount,
      grounded: false,
      sliding: false,
      planted: false,
      stopped: false,
    };
  }

  const span = nextY - state.y;
  const frac = span > 0 ? (params.groundY - state.y) / span : 1;
  const impactVy = Math.abs((state.vy + params.gravity * dt * frac) * params.airDrag);
  const contactX = state.x + vx * dt * frac;
  const remaining = dt * (1 - frac);

  const angle = impactAngleDeg(vx, impactVy);
  if (angle > params.plantAngleDeg) {
    return {
      x: contactX,
      y: params.groundY,
      vx: 0,
      vy: 0,
      rotation,
      bounceCount,
      grounded: true,
      sliding: false,
      planted: true,
      stopped: true,
    };
  }

  const dig = angle / params.plantAngleDeg;
  const keep = 1 - params.impactDig * dig * dig;
  const groundVx = (vx * params.groundFriction + impactVy * params.impactLift) * keep;

  if (impactVy > params.bounceMinVy) {
    const bounceVy = -impactVy * params.groundRestitution;
    return {
      x: contactX + groundVx * remaining,
      y: params.groundY + bounceVy * remaining,
      vx: groundVx,
      vy: bounceVy,
      rotation,
      bounceCount: bounceCount + 1,
      grounded: true,
      sliding: false,
      planted: false,
      stopped: false,
    };
  }

  const stopped = groundVx < params.stopSpeed;
  return {
    x: contactX + (stopped ? 0 : groundVx * remaining),
    y: params.groundY,
    vx: stopped ? 0 : groundVx,
    vy: 0,
    rotation,
    bounceCount,
    grounded: true,
    sliding: true,
    planted: false,
    stopped,
  };
}

/** Distance parcourue depuis le point de lancement, en mètres. */
export function distanceMeters(startX: number, currentX: number): number {
  return Math.max(0, (currentX - startX) / PIXELS_PER_METER);
}

/**
 * Simule un lancer jusqu'à l'arrêt, pour les tests et pour le rejeu
 * déterministe côté serveur (docs/PRD.md 2.5). `maxTicks` évite une boucle
 * infinie si les paramètres ne convergent jamais.
 */
export function simulateThrow(
  speed: number,
  angleDeg: number,
  params: PhysicsParams = DEFAULT_PHYSICS_PARAMS,
  maxTicks = 60 * 30,
): { finalState: ProjectileState; distanceMeters: number; ticks: number } {
  let state = createProjectile(0, params.groundY, speed, angleDeg);
  const startX = state.x;
  let ticks = 0;
  while (!state.stopped && ticks < maxTicks) {
    state = stepProjectile(state, params);
    ticks += 1;
  }
  return { finalState: state, distanceMeters: distanceMeters(startX, state.x), ticks };
}
