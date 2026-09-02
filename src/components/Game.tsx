"use client";

import { useEffect, useRef } from "react";
import {
  DEFAULT_PHYSICS_PARAMS,
  FIXED_DT,
  PIXELS_PER_METER,
  createProjectile,
  distanceMeters,
  stepProjectile,
  type ProjectileState,
} from "@/lib/physics/engine";
import {
  ANGLE_MAX_DEG,
  ANGLE_MIN_DEG,
  ANGLE_PERIOD_S,
  CAMERA_CATCH_UP_FRACTION,
  CAMERA_MAX_SCREEN_FRACTION,
  CAMERA_SMOOTHING_S,
  POWER_HALF_PERIOD_S,
  SPEED_MAX,
  SPEED_MIN,
  lerp,
  sineWave01,
  triangleWave,
} from "@/lib/game/tuning";
import { loadBestDistance, saveBestDistance } from "@/lib/game/score";

type Phase = "angle" | "power" | "flying" | "ended";

const CHARACTER_RADIUS = 18;
const SKY = "#87ceeb";
const GROUND = "#e8f1f8";
const GROUND_EDGE = "#b9d1e3";
const PLANT_TILT = (65 * Math.PI) / 180;
const INPUT_GUARD_S = 0.05;

/**
 * V0 — "le feel nu" (docs/PRD.md V0, clone comportemental de Yetisports 1 —
 * Pingu Throw). Un écran, un placeholder géométrique, angle puis puissance,
 * vol / rebonds / glissade ou plantage, distance en direct, meilleur score
 * local. Rien d'autre : voir docs/versions/v0.md pour le hors-périmètre.
 *
 * Tout tourne en canvas 2D impératif dans un seul effet : pas d'état React
 * par frame, pour garder la boucle de jeu à 60 fps prévisible. La physique
 * tourne dans le repère monde (origine au point de lancement, sol à y = 0) et
 * l'écran n'est qu'une translation : la simulation ne dépend ni de la taille
 * de l'écran ni d'un resize en plein vol.
 */
export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvasRefCurrent = canvasRef.current;
    if (!canvasRefCurrent) return;
    // Re-bound with an explicit non-null type: TypeScript's control-flow
    // narrowing above does not carry into the nested closures declared below.
    const canvasEl: HTMLCanvasElement = canvasRefCurrent;
    const context2d = canvasEl.getContext("2d");
    if (!context2d) return;
    const ctx: CanvasRenderingContext2D = context2d;

    let width = 0;
    let height = 0;
    let groundY = 0;
    let launchX = 0;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvasEl.width = Math.floor(width * dpr);
      canvasEl.height = Math.floor(height * dpr);
      canvasEl.style.width = `${width}px`;
      canvasEl.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      groundY = height * 0.72;
      launchX = width * 0.18;
    }
    resize();
    window.addEventListener("resize", resize);

    let phase: Phase = "angle";
    let phaseStartMs = performance.now();
    let phaseTime = 0;
    let angleDeg = ANGLE_MIN_DEG;
    let powerPercent = 0;
    let cameraX = 0;
    let projectile: ProjectileState | null = null;
    let physicsAccumulator = 0;
    let lastDistance = 0;
    let best = loadBestDistance();
    let bestLabel = `TOP ${best.toFixed(1)} m`;
    let isNewBest = false;
    let frameIndex = 0;
    const panelLabels: string[] = [];

    function angleAt(timeS: number): number {
      return lerp(ANGLE_MIN_DEG, ANGLE_MAX_DEG, sineWave01(timeS, ANGLE_PERIOD_S));
    }

    function powerAt(timeS: number): number {
      return triangleWave(timeS, POWER_HALF_PERIOD_S) * 100;
    }

    function enterPhase(next: Phase, nowMs: number) {
      phase = next;
      phaseStartMs = nowMs;
      phaseTime = 0;
    }

    function startAiming(nowMs: number) {
      enterPhase("angle", nowMs);
      angleDeg = angleAt(0);
      powerPercent = 0;
      cameraX = 0;
      projectile = null;
      isNewBest = false;
    }

    function lockAngleAndAimPower(nowMs: number, elapsedS: number) {
      angleDeg = angleAt(elapsedS);
      enterPhase("power", nowMs);
      powerPercent = powerAt(0);
    }

    function launch(nowMs: number, elapsedS: number) {
      powerPercent = powerAt(elapsedS);
      const speed = lerp(SPEED_MIN, SPEED_MAX, powerPercent / 100);
      projectile = createProjectile(0, 0, speed, angleDeg);
      physicsAccumulator = 0;
      enterPhase("flying", nowMs);
    }

    function endThrow(nowMs: number) {
      enterPhase("ended", nowMs);
      lastDistance = projectile ? distanceMeters(0, projectile.x) : 0;
      isNewBest = lastDistance > best;
      if (isNewBest) {
        best = lastDistance;
        bestLabel = `TOP ${best.toFixed(1)} m`;
        saveBestDistance(best);
      }
    }

    function handleInput() {
      const nowMs = performance.now();
      const elapsedS = (nowMs - phaseStartMs) / 1000;
      if (elapsedS < INPUT_GUARD_S) return;
      if (phase === "angle") lockAngleAndAimPower(nowMs, elapsedS);
      else if (phase === "power") launch(nowMs, elapsedS);
      else if (phase === "ended") startAiming(nowMs);
      // "flying" : aucun input pris en compte, cf. docs/PRD.md V0.
    }

    function onPointerDown(e: PointerEvent) {
      e.preventDefault();
      handleInput();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        handleInput();
      }
    }
    window.addEventListener("pointerdown", onPointerDown, { passive: false });
    window.addEventListener("keydown", onKeyDown);

    function updateCamera(dt: number) {
      if (!projectile) return;
      const worldX = launchX + projectile.x;
      const target = Math.max(0, worldX - width * CAMERA_CATCH_UP_FRACTION);
      const k = Math.min(1, dt / CAMERA_SMOOTHING_S);
      cameraX += (target - cameraX) * k;
      const maxCamera = worldX - width * (1 - CAMERA_MAX_SCREEN_FRACTION);
      const minCamera = worldX - width * CAMERA_MAX_SCREEN_FRACTION;
      if (cameraX < minCamera) cameraX = minCamera;
      if (cameraX > maxCamera) cameraX = maxCamera;
      if (cameraX < 0) cameraX = 0;
    }

    function drawGround() {
      ctx.fillStyle = GROUND;
      ctx.fillRect(0, groundY, width, height - groundY);
      ctx.fillStyle = GROUND_EDGE;
      ctx.fillRect(0, groundY, width, 3);
    }

    function panelLabel(meters: number): string {
      const index = meters / 50;
      let label = panelLabels[index];
      if (label === undefined) {
        label = `${meters} m`;
        panelLabels[index] = label;
      }
      return label;
    }

    function drawGroundMarks() {
      const tick = PIXELS_PER_METER * 10;
      const firstMeters = Math.max(10, Math.floor(cameraX / tick) * 10);
      const lastMeters = Math.ceil((cameraX + width) / tick) * 10;
      ctx.strokeStyle = "#7f9db3";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let meters = firstMeters; meters <= lastMeters; meters += 10) {
        const screenX = launchX + meters * PIXELS_PER_METER - cameraX;
        const isPanel = meters % 50 === 0;
        ctx.moveTo(screenX, groundY);
        ctx.lineTo(screenX, groundY + (isPanel ? 0 : 10));
      }
      ctx.stroke();

      ctx.font = "bold 13px Arial";
      ctx.textAlign = "center";
      for (let meters = firstMeters; meters <= lastMeters; meters += 10) {
        if (meters % 50 !== 0) continue;
        const screenX = launchX + meters * PIXELS_PER_METER - cameraX;
        ctx.fillStyle = "#5b7288";
        ctx.fillRect(screenX - 1.5, groundY - 44, 3, 44);
        ctx.fillStyle = "#2f4858";
        ctx.fillRect(screenX - 26, groundY - 62, 52, 22);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(panelLabel(meters), screenX, groundY - 46);
      }
    }

    function drawTopFlag() {
      if (best <= 0) return;
      const screenX = launchX + best * PIXELS_PER_METER - cameraX;
      if (screenX < -80 || screenX > width + 80) return;
      ctx.fillStyle = "#7a4a00";
      ctx.fillRect(screenX - 2, groundY - 96, 4, 96);
      ctx.fillStyle = "#ffd60a";
      ctx.beginPath();
      ctx.moveTo(screenX + 2, groundY - 96);
      ctx.lineTo(screenX + 72, groundY - 82);
      ctx.lineTo(screenX + 2, groundY - 68);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#2f4858";
      ctx.font = "bold 13px Arial";
      ctx.textAlign = "left";
      ctx.fillText(bestLabel, screenX + 8, groundY - 102);
    }

    function drawCharacter(x: number, y: number, rotation: number) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.fillStyle = "#ffb703";
      ctx.beginPath();
      ctx.arc(0, 0, CHARACTER_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#7a4a00";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(CHARACTER_RADIUS, 0);
      ctx.stroke();
      ctx.restore();
    }

    function drawSlideSpray(screenX: number, vx: number) {
      const intensity = Math.min(1, vx / 800);
      if (intensity <= 0.02) return;
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 5; i += 1) {
        const wobble = Math.sin(frameIndex * 0.7 + i * 1.9);
        const startX = screenX - CHARACTER_RADIUS - i * 6;
        const length = (14 + 10 * wobble) * intensity;
        const lift = (4 + i * 4 + 3 * wobble) * intensity;
        ctx.moveTo(startX, groundY - 2);
        ctx.lineTo(startX - length, groundY - 2 - lift);
      }
      ctx.stroke();
      ctx.strokeStyle = "rgba(47,72,88,0.35)";
      ctx.beginPath();
      ctx.moveTo(screenX - CHARACTER_RADIUS - 4, groundY + 1);
      ctx.lineTo(screenX - CHARACTER_RADIUS - 40 * intensity - 20, groundY + 1);
      ctx.stroke();
    }

    function drawPlantPuff(screenX: number, age: number) {
      if (age > 0.45) return;
      const spread = 1 + age * 3;
      ctx.globalAlpha = 1 - age / 0.45;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 7; i += 1) {
        const a = Math.PI + (i / 6) * Math.PI;
        const r0 = 14 * spread;
        const r1 = r0 + 12;
        ctx.moveTo(screenX + Math.cos(a) * r0, groundY + Math.sin(a) * r0 * 0.6);
        ctx.lineTo(screenX + Math.cos(a) * r1, groundY + Math.sin(a) * r1 * 0.6);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    function drawProjectile() {
      if (!projectile) {
        drawCharacter(launchX - cameraX, groundY - CHARACTER_RADIUS, 0);
        return;
      }
      const screenX = launchX + projectile.x - cameraX;
      const screenY = groundY + projectile.y;
      if (projectile.planted) {
        drawCharacter(screenX, groundY + 4, PLANT_TILT);
        ctx.fillStyle = GROUND;
        ctx.fillRect(screenX - 30, groundY + 3, 60, 40);
        drawPlantPuff(screenX, phaseTime);
        return;
      }
      if (projectile.sliding) {
        drawSlideSpray(screenX, projectile.vx);
      }
      drawCharacter(screenX, screenY - CHARACTER_RADIUS, projectile.rotation);
      if (screenY < 0) {
        ctx.fillStyle = "#ffb703";
        ctx.beginPath();
        ctx.moveTo(screenX, 6);
        ctx.lineTo(screenX - 12, 26);
        ctx.lineTo(screenX + 12, 26);
        ctx.closePath();
        ctx.fill();
      }
    }

    function drawAimLine() {
      const rad = (angleDeg * Math.PI) / 180;
      const originX = launchX - cameraX;
      const originY = groundY - CHARACTER_RADIUS;
      const length = 70 + (phase === "power" ? powerPercent * 0.9 : 0);
      ctx.strokeStyle = phase === "angle" ? "rgba(76,201,240,0.9)" : "rgba(249,65,68,0.9)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(originX, originY);
      ctx.lineTo(originX + Math.cos(rad) * length, originY - Math.sin(rad) * length);
      ctx.stroke();
    }

    function drawGauges() {
      const barX = width / 2;
      const barY = height * 0.12;
      const barWidth = Math.min(320, width * 0.7);

      ctx.font = "bold 14px Arial";
      ctx.fillStyle = "#1b2a35";
      ctx.textAlign = "center";
      ctx.fillText(
        phase === "angle" ? "Tape pour verrouiller l'angle" : "Tape pour lancer !",
        barX,
        barY - 22,
      );

      ctx.strokeStyle = "#1b2a35";
      ctx.lineWidth = 2;
      ctx.strokeRect(barX - barWidth / 2, barY, barWidth, 18);

      const ratio =
        phase === "angle"
          ? (angleDeg - ANGLE_MIN_DEG) / (ANGLE_MAX_DEG - ANGLE_MIN_DEG)
          : powerPercent / 100;
      ctx.fillStyle = phase === "angle" ? "#4cc9f0" : "#f94144";
      ctx.fillRect(barX - barWidth / 2, barY, barWidth * ratio, 18);

      ctx.fillStyle = "#1b2a35";
      ctx.font = "13px Arial";
      ctx.fillText(
        phase === "angle" ? `${angleDeg.toFixed(0)}°` : `${powerPercent.toFixed(0)} %`,
        barX,
        barY + 34,
      );
    }

    function drawCounter(value: number, y: number, color: string) {
      ctx.font = "bold 44px Arial";
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.fillText(`${value.toFixed(1)} m`, width / 2, y);
    }

    function drawEndPanel() {
      const planted = projectile !== null && projectile.planted;
      const panelWidth = Math.min(300, width * 0.8);
      const panelHeight = planted ? 140 : 118;
      const panelX = width / 2 - panelWidth / 2;
      const panelY = height * 0.2;
      ctx.fillStyle = "rgba(27,42,53,0.92)";
      ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
      ctx.fillStyle = isNewBest ? "#ffd60a" : "#ffffff";
      ctx.font = "bold 44px Arial";
      ctx.textAlign = "center";
      ctx.fillText(`${lastDistance.toFixed(1)} m`, width / 2, panelY + 56);
      ctx.font = "bold 16px Arial";
      if (planted) {
        ctx.fillStyle = "#f94144";
        ctx.fillText("Planté ! Trop haut.", width / 2, panelY + 92);
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.font = "14px Arial";
        ctx.fillText("Vise plus bas pour rebondir et glisser", width / 2, panelY + 118);
      } else if (isNewBest) {
        ctx.fillStyle = "#ffd60a";
        ctx.fillText("Nouveau record !", width / 2, panelY + 92);
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.fillText(bestLabel, width / 2, panelY + 92);
      }

      const buttonWidth = Math.min(280, width * 0.7);
      const buttonHeight = 64;
      const buttonX = width / 2 - buttonWidth / 2;
      const buttonY = height * 0.8;
      ctx.fillStyle = "#f94144";
      ctx.fillRect(buttonX, buttonY, buttonWidth, buttonHeight);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 26px Arial";
      ctx.fillText("Rejouer", width / 2, buttonY + 42);
    }

    function drawHud() {
      ctx.fillStyle = "#1b2a35";
      ctx.font = "bold 15px Arial";
      ctx.textAlign = "left";
      ctx.fillText(bestLabel, 16, 28);

      if (phase === "angle" || phase === "power") {
        drawGauges();
      } else if (phase === "flying" && projectile) {
        drawCounter(distanceMeters(0, projectile.x), height * 0.18, "#1b2a35");
      } else if (phase === "ended") {
        drawEndPanel();
      }
    }

    function render() {
      ctx.fillStyle = SKY;
      ctx.fillRect(0, 0, width, groundY);
      drawGround();
      if (phase === "angle" || phase === "power") drawAimLine();
      drawProjectile();
      drawGroundMarks();
      drawTopFlag();
      drawHud();
    }

    let rafId = 0;
    let lastTime = performance.now();

    function frame(now: number) {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      phaseTime = Math.max(0, (now - phaseStartMs) / 1000);
      frameIndex += 1;

      if (phase === "angle") {
        angleDeg = angleAt(phaseTime);
      } else if (phase === "power") {
        powerPercent = powerAt(phaseTime);
      } else if (phase === "flying" && projectile) {
        physicsAccumulator += dt;
        while (physicsAccumulator >= FIXED_DT) {
          projectile = stepProjectile(projectile, DEFAULT_PHYSICS_PARAMS);
          physicsAccumulator -= FIXED_DT;
          if (projectile.stopped) break;
        }
        updateCamera(dt);
        if (projectile.stopped) endThrow(now);
      }

      render();
      rafId = requestAnimationFrame(frame);
    }

    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: "block", width: "100vw", height: "100vh", touchAction: "none" }}
    />
  );
}
