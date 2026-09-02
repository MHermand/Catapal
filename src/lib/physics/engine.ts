/**
 * Intégrateur physique custom (Euler semi-implicite, pas fixe).
 *
 * Volontairement pas un moteur rigid body : la physique de ce genre de jeu
 * est une courbe de plaisir déguisée en physique (voir docs/PRD.md 2.2), pas
 * une simulation. Ce module doit rester pur (aucun Date.now/Math.random non
 * seedé, aucune dépendance au framerate réel) pour rester rejouable au pixel
 * près côté serveur à partir de la V1 (docs/PRD.md 2.5).
 */

export const FIXED_DT = 1 / 60;

export interface PhysicsParams {
  /** px/s², positif = vers le bas */
  gravity: number;
  /** multiplicateur de vitesse appliqué chaque tick, en vol */
  airDrag: number;
  /** coefficient de restitution au contact du sol (0..1) */
  groundRestitution: number;
  /** multiplicateur appliqué à la vitesse horizontale au contact du sol */
  groundFriction: number;
  /** vitesse (px/s) en dessous de laquelle, au sol, la partie s'arrête */
  stopSpeed: number;
  /** coordonnée y (px) du niveau du sol */
  groundY: number;
}

export const DEFAULT_PHYSICS_PARAMS: PhysicsParams = {
  gravity: 1200,
  airDrag: 0.999,
  groundRestitution: 0.62,
  groundFriction: 0.85,
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
    stopped: false,
  };
}

export function stepProjectile(
  state: ProjectileState,
  params: PhysicsParams,
  dt: number = FIXED_DT,
): ProjectileState {
  if (state.stopped) return state;

  let { x, y, vx, vy, bounceCount } = state;

  vy += params.gravity * dt;
  vx *= params.airDrag;
  vy *= params.airDrag;

  x += vx * dt;
  y += vy * dt;

  let grounded = false;

  if (y >= params.groundY) {
    y = params.groundY;
    grounded = true;
    if (Math.abs(vy) > 1) {
      vy = -vy * params.groundRestitution;
      bounceCount += 1;
    } else {
      vy = 0;
    }
    vx *= params.groundFriction;
  }

  const rotation = state.rotation + vx * 0.01 * dt;
  const speed = Math.hypot(vx, vy);
  const stopped = grounded && speed < params.stopSpeed;

  return { x, y, vx, vy, rotation, bounceCount, grounded, stopped };
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
