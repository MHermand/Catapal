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

/**
 * Bornes de vitesse initiale, en px/s. Plus basses que le point de départ du
 * PRD 2.2 (900-2400) : avec la gravité de 500 px/s², v²/g ≈ 1800 px plafonne
 * le régime « planté » vers 180 m et le lancer parfait vers 500 m, comme la
 * référence (docs/versions/v0.md, tour de tuning 2).
 */
export const SPEED_MIN = 320;
export const SPEED_MAX = 950;
/** Durée d'un aller (0 → 100 %) de la jauge de puissance */
export const POWER_HALF_PERIOD_S = 0.55;

/** Fraction de la largeur de l'écran où la caméra cherche à garder le personnage en vol */
export const CAMERA_CATCH_UP_FRACTION = 0.35;
/** Constante de temps du lissage horizontal de la caméra, en secondes */
export const CAMERA_SMOOTHING_S = 0.08;
/** Fraction de la largeur au-delà de laquelle la caméra rattrape sans lissage, pour ne jamais perdre le personnage */
export const CAMERA_MAX_SCREEN_FRACTION = 0.7;

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
