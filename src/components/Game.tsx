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
  POWER_HALF_PERIOD_S,
  SPEED_MAX,
  SPEED_MIN,
  lerp,
  sineWave01,
  triangleWave,
} from "@/lib/game/tuning";
import { loadBestDistance, saveBestDistance } from "@/lib/game/score";

type Phase = "angle" | "power" | "flying" | "ended";

/**
 * V0 — "le feel nu" (docs/PRD.md V0, clone comportemental de Yetisports 1 —
 * Pingu Throw). Un écran, un placeholder géométrique, angle puis puissance,
 * rebonds, distance, meilleur score local. Rien d'autre : voir
 * docs/versions/v0.md pour le hors-périmètre explicite.
 *
 * Tout tourne en canvas 2D impératif dans un seul effet : pas d'état React
 * par frame, pour garder la boucle de jeu à 60 fps prévisible.
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
    const launchX = () => width * 0.18;

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
    }
    resize();
    window.addEventListener("resize", resize);

    let phase: Phase = "angle";
    let phaseTime = 0;
    let angleDeg = ANGLE_MIN_DEG;
    let powerPercent = 0;
    let cameraX = 0;
    let projectile: ProjectileState | null = null;
    let physicsAccumulator = 0;
    let lastDistance = 0;
    let best = loadBestDistance();
    let isNewBest = false;

    function startAiming() {
      phase = "angle";
      phaseTime = 0;
      cameraX = 0;
      projectile = null;
      isNewBest = false;
    }

    function lockAngleAndAimPower() {
      phase = "power";
      phaseTime = 0;
    }

    function launch() {
      const speed = lerp(SPEED_MIN, SPEED_MAX, powerPercent / 100);
      projectile = createProjectile(launchX(), groundY, speed, angleDeg);
      physicsAccumulator = 0;
      phase = "flying";
    }

    function endThrow() {
      phase = "ended";
      phaseTime = 0;
      lastDistance = projectile ? distanceMeters(launchX(), projectile.x) : 0;
      isNewBest = lastDistance > best;
      if (isNewBest) {
        best = lastDistance;
        saveBestDistance(best);
      }
    }

    function handleInput() {
      if (phase === "angle") lockAngleAndAimPower();
      else if (phase === "power") launch();
      else if (phase === "ended") startAiming();
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

    function drawGround() {
      ctx.fillStyle = "#1c3d1f";
      ctx.fillRect(0, groundY, width, height - groundY);
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 1;
      const step = PIXELS_PER_METER * 10; // repère tous les 10 m
      const firstTick = Math.floor(cameraX / step) * step;
      for (
        let worldX = firstTick;
        worldX < cameraX + width + step;
        worldX += step
      ) {
        const screenX = worldX - cameraX;
        ctx.beginPath();
        ctx.moveTo(screenX, groundY);
        ctx.lineTo(screenX, groundY + 14);
        ctx.stroke();
        const meters = Math.round(worldX / PIXELS_PER_METER);
        if (meters > 0) {
          ctx.fillStyle = "rgba(255,255,255,0.5)";
          ctx.font = "12px Arial";
          ctx.textAlign = "center";
          ctx.fillText(`${meters}m`, screenX, groundY + 28);
        }
      }
    }

    function drawCharacter(x: number, y: number, rotation: number) {
      const screenX = x - cameraX;
      ctx.save();
      ctx.translate(screenX, y);
      ctx.rotate(rotation);
      ctx.fillStyle = "#ffb703";
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#7a4a00";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(18, 0);
      ctx.stroke();
      ctx.restore();
    }

    function drawHud() {
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 15px Arial";
      ctx.textAlign = "left";
      ctx.fillText(`Meilleur : ${best.toFixed(1)} m`, 16, 28);

      ctx.textAlign = "center";

      if (phase === "angle" || phase === "power") {
        const barX = width / 2;
        const barY = height * 0.12;
        const barWidth = Math.min(320, width * 0.7);

        ctx.font = "bold 14px Arial";
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.fillText(
          phase === "angle"
            ? "Tape pour verrouiller l'angle"
            : "Tape pour lancer !",
          barX,
          barY - 22,
        );

        ctx.strokeStyle = "rgba(255,255,255,0.6)";
        ctx.lineWidth = 2;
        ctx.strokeRect(barX - barWidth / 2, barY, barWidth, 18);

        const ratio =
          phase === "angle"
            ? (angleDeg - ANGLE_MIN_DEG) / (ANGLE_MAX_DEG - ANGLE_MIN_DEG)
            : powerPercent / 100;
        ctx.fillStyle = phase === "angle" ? "#4cc9f0" : "#f94144";
        ctx.fillRect(barX - barWidth / 2, barY, barWidth * ratio, 18);

        ctx.fillStyle = "#ffffff";
        ctx.font = "13px Arial";
        ctx.fillText(
          phase === "angle"
            ? `${angleDeg.toFixed(0)}°`
            : `${powerPercent.toFixed(0)} %`,
          barX,
          barY + 34,
        );
      }

      if (phase === "flying" && projectile) {
        const d = distanceMeters(launchX(), projectile.x);
        ctx.font = "bold 40px Arial";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(`${d.toFixed(1)} m`, width / 2, height * 0.18);
      }

      if (phase === "ended") {
        ctx.font = "bold 40px Arial";
        ctx.fillStyle = isNewBest ? "#ffd60a" : "#ffffff";
        ctx.fillText(`${lastDistance.toFixed(1)} m`, width / 2, height * 0.22);
        if (isNewBest) {
          ctx.font = "bold 16px Arial";
          ctx.fillStyle = "#ffd60a";
          ctx.fillText("Nouveau record !", width / 2, height * 0.22 + 30);
        }
        ctx.font = "bold 18px Arial";
        ctx.fillStyle = "#ffffff";
        ctx.fillText("Tape pour rejouer", width / 2, height * 0.72);
      }
    }

    function render() {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#87ceeb";
      ctx.fillRect(0, 0, width, groundY);
      drawGround();

      if (projectile) {
        drawCharacter(projectile.x, projectile.y, projectile.rotation);
      } else {
        drawCharacter(launchX(), groundY, 0);
      }

      drawHud();
    }

    let rafId = 0;
    let lastTime = performance.now();

    function frame(now: number) {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      phaseTime += dt;

      if (phase === "angle") {
        const t = sineWave01(phaseTime, ANGLE_PERIOD_S);
        angleDeg = lerp(ANGLE_MIN_DEG, ANGLE_MAX_DEG, t);
      } else if (phase === "power") {
        powerPercent = triangleWave(phaseTime, POWER_HALF_PERIOD_S) * 100;
      } else if (phase === "flying" && projectile) {
        physicsAccumulator += dt;
        while (physicsAccumulator >= FIXED_DT) {
          projectile = stepProjectile(projectile, {
            ...DEFAULT_PHYSICS_PARAMS,
            groundY,
          });
          physicsAccumulator -= FIXED_DT;
          if (projectile.stopped) break;
        }
        cameraX = Math.max(0, projectile.x - width * CAMERA_CATCH_UP_FRACTION);
        if (projectile.stopped) endThrow();
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
      style={{ display: "block", width: "100vw", height: "100vh" }}
    />
  );
}
