/**
 * Constantes de jouabilité de la V0. Volontairement regroupées ici : ce sont
 * les valeurs à retuner en premier pendant le gauntlet loop (docs/versions/v0.md),
 * pas les valeurs physiques de bas niveau (docs/PRD.md 2.2, dans
 * src/lib/physics/engine.ts).
 */

/** Bornes de la jauge d'angle, en degrés — cf. docs/PRD.md 2.2 */
export const ANGLE_MIN_DEG = 10;
export const ANGLE_MAX_DEG = 70;
/** Durée d'un aller-retour complet de la jauge d'angle */
export const ANGLE_PERIOD_S = 1.6;

/** Bornes de vitesse initiale, en px/s — cf. docs/PRD.md 2.2 */
export const SPEED_MIN = 900;
export const SPEED_MAX = 2400;
/** Durée d'un aller (0 → 100 %) de la jauge de puissance */
export const POWER_HALF_PERIOD_S = 0.55;

/** Fraction de la largeur de l'écran à laquelle la caméra rattrape le personnage en vol */
export const CAMERA_CATCH_UP_FRACTION = 0.35;

export function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * t;
}

/** Onde triangulaire 0..1, montée puis descente sur `halfPeriod` secondes chacune. */
export function triangleWave(timeSeconds: number, halfPeriod: number): number {
  const period = halfPeriod * 2;
  const phase = (timeSeconds % period) / period;
  return phase < 0.5 ? phase * 2 : (1 - phase) * 2;
}

/** Onde sinusoïdale ramenée en 0..1, pour l'oscillation de l'angle. */
export function sineWave01(timeSeconds: number, period: number): number {
  return (Math.sin((2 * Math.PI * timeSeconds) / period) + 1) / 2;
}
