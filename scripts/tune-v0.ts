import { evaluateV0Gate, type PopulationStats } from "../src/lib/game/v0-gate";
import {
  ANGLE_MAX_DEG,
  ANGLE_MIN_DEG,
  ANGLE_PERIOD_S,
  POWER_HALF_PERIOD_S,
  SPEED_MAX,
  SPEED_MIN,
} from "../src/lib/game/tuning";

const report = evaluateV0Gate();
const { params, options: opts, optimalAngle } = report;

const fmt = (n: number, digits = 1) => n.toFixed(digits);

const columns: { header: string; width: number; cell: (p: PopulationStats) => string }[] = [
  { header: "Population", width: 11, cell: (p) => p.name },
  { header: "n", width: 5, cell: (p) => String(p.count) },
  { header: "p5 m", width: 7, cell: (p) => fmt(p.p5M) },
  { header: "p50 m", width: 7, cell: (p) => fmt(p.p50M) },
  { header: "p95 m", width: 7, cell: (p) => fmt(p.p95M) },
  { header: "max m", width: 7, cell: (p) => fmt(p.maxM) },
  { header: "p95/p50", width: 8, cell: (p) => fmt(p.ratioP95OverP50, 2) },
  { header: "durée méd s", width: 12, cell: (p) => fmt(p.medianDurationS, 2) },
  { header: "durée max s", width: 12, cell: (p) => fmt(p.maxDurationS, 2) },
  { header: "reb. méd", width: 9, cell: (p) => fmt(p.medianBounces, 1) },
  { header: "reb. max", width: 9, cell: (p) => String(p.maxBounces) },
  { header: "tronqués", width: 9, cell: (p) => String(p.truncatedCount) },
];

function row(cells: string[]): string {
  return cells.map((c, i) => c.padStart(columns[i].width)).join(" | ");
}

const lines: string[] = [];
lines.push("=== Catapal V0 — harnais de mesure du gate (simulation déterministe) ===");
lines.push("");
lines.push(
  `Physique : gravité ${params.gravity} px/s², traînée ${params.airDrag}/tick, ` +
    `restitution ${params.groundRestitution}, friction sol ${params.groundFriction}, ` +
    `conversion vy→vx ${params.impactLift}, enfoncement ${params.impactDig}, ` +
    `plantage > ${params.plantAngleDeg}°, rebond si |vy| > ${params.bounceMinVy} px/s, ` +
    `glissade −${params.slideDecel} px/s², seuil d'arrêt ${params.stopSpeed} px/s`,
);
lines.push(
  `Jauges   : angle ${ANGLE_MIN_DEG}°..${ANGLE_MAX_DEG}° (sinus, période ${ANGLE_PERIOD_S} s), ` +
    `puissance ${SPEED_MIN}..${SPEED_MAX} px/s (triangle, demi-période ${POWER_HALF_PERIOD_S} s)`,
);
lines.push(`Seed ${opts.seed}, maxTicks ${opts.maxTicks} (${fmt(opts.maxTicks / 60, 0)} s)`);
lines.push("");
lines.push("Populations simulées :");
lines.push(
  `  novice   : ${opts.noviceThrows} lancers, instant de tap uniforme sur chaque jauge`,
);
lines.push(
  `  entraîné : ${opts.skilledThrows} lancers, vise l'angle optimal et 100 % de puissance, ` +
    `erreur de timing gaussienne σ = ${fmt(opts.timingSigmaS * 1000, 0)} ms par jauge`,
);
lines.push(
  `  mixte    : ${opts.mixedTesters} testeurs × ${opts.mixedThrowsPerTester} lancers, ` +
    `le lancer i est un tap entraîné avec probabilité i/${opts.mixedThrowsPerTester - 1}, ` +
    `sinon un tap novice (progression novice → entraîné)`,
);
lines.push("");
lines.push(
  `Optimum (balayage ${opts.angleSweepStepDeg}°, puissance 100 %) : ` +
    `${fmt(optimalAngle.angleDeg)}° → ${fmt(optimalAngle.distanceM)} m en ` +
    `${fmt(optimalAngle.durationS, 2)} s (tap angle à ${fmt(optimalAngle.tapS * 1000, 0)} ms)`,
);
lines.push("");
lines.push(row(columns.map((c) => c.header)));
lines.push(columns.map((c) => "-".repeat(c.width)).join("-+-"));
for (const pop of [report.novice, report.skilled, report.mixed]) {
  lines.push(row(columns.map((c) => c.cell(pop))));
}
lines.push("");
lines.push(
  `Médiane entraîné / médiane novice : ${fmt(report.skilledOverNoviceMedianRatio, 2)} ` +
    "(informatif en V0, seuil ≥ 5 en V1)",
);
lines.push("");
lines.push("Critères de sortie mesurables :");
for (const c of report.criteria) {
  const status = c.pass ? "VERT " : "ROUGE";
  lines.push(
    `  [${status}] ${c.label} : ${fmt(c.value, 2)} ${c.comparator} ${c.threshold}`,
  );
}
lines.push("  [HUMAIN] 5 testeurs × 20 lancers spontanés — playtest uniquement");
lines.push("  [NAVIG.] temps entre deux lancers < 2 s — mesure en navigateur");
lines.push("  [NAVIG.] 60 fps stables sur mobile milieu de gamme — hors harnais");
lines.push("");
lines.push(`Gate simulé : ${report.allGreen ? "VERT" : "ROUGE"}`);

console.log(lines.join("\n"));
