/**
 * Canvas2D background fallback — five randomly-positioned blobs with
 * gradient fills and additive composition. Matches the WebGPU look as
 * closely as a CPU path can.
 */

import type { Mood } from "../types.ts";

interface MoodPalette {
  readonly base: string;
  readonly blobs: ReadonlyArray<readonly [number, number, number]>;
}

const MOOD_PALETTE: Record<Mood, MoodPalette> = {
  rainy: {
    base: "#0a1320",
    blobs: [
      [200, 55, 55],
      [230, 40, 40],
      [260, 30, 55],
    ],
  },
  late: {
    base: "#0c0918",
    blobs: [
      [270, 45, 50],
      [300, 35, 45],
      [210, 30, 50],
    ],
  },
  cafe: {
    base: "#140a04",
    blobs: [
      [28, 60, 55],
      [15, 55, 50],
      [40, 50, 55],
    ],
  },
  sleepy: {
    base: "#060e12",
    blobs: [
      [190, 40, 50],
      [210, 30, 45],
      [170, 35, 50],
    ],
  },
  transit: {
    base: "#1a0a2e",
    blobs: [
      [270, 60, 45],
      [290, 50, 50],
      [250, 45, 40],
    ],
  },
};

const NUM_BLOBS = 5;

interface Blob {
  cx: number;
  cy: number;
  r: number;
  speedX: number;
  speedY: number;
  phaseX: number;
  phaseY: number;
  rPhase: number;
  colIdx: number;
}

export function startCanvas2D(
  canvas: HTMLCanvasElement,
  getMood: () => Mood,
  getAmp: () => number,
): void {
  const bgCtx = canvas.getContext("2d");
  if (!bgCtx) return;

  const blobs: Blob[] = Array.from({ length: NUM_BLOBS }, (_, i) => ({
    cx: 0.2 + Math.random() * 0.6,
    cy: 0.15 + Math.random() * 0.35,
    r: 0.35 + Math.random() * 0.25,
    speedX: (Math.random() - 0.5) * 0.00015,
    speedY: (Math.random() - 0.5) * 0.00012,
    phaseX: Math.random() * Math.PI * 2,
    phaseY: Math.random() * Math.PI * 2,
    rPhase: Math.random() * Math.PI * 2,
    colIdx: i % 3,
  }));

  let bt = 0;

  function frame() {
    requestAnimationFrame(frame);
    bt += 0.02;
    const dpr = globalThis.devicePixelRatio || 1;
    const W = canvas.width / dpr;
    const H = canvas.height / dpr;
    if (W < 2 || H < 2) return;

    const palette = MOOD_PALETTE[getMood()] ?? MOOD_PALETTE.rainy;

    bgCtx!.globalCompositeOperation = "source-over";
    bgCtx!.fillStyle = palette.base;
    bgCtx!.fillRect(0, 0, W, H);

    bgCtx!.globalCompositeOperation = "lighter";

    const amp = getAmp();

    blobs.forEach((b) => {
      const driftX = Math.sin(bt * 0.5 + b.phaseX) * 0.18;
      const driftY = Math.cos(bt * 0.42 + b.phaseY) * 0.14;
      const cx = (b.cx + driftX) * W;
      const cy = (b.cy + driftY) * H;
      const rBase = b.r * Math.min(W, H);
      const rPulse = 0.85 + 0.15 * Math.sin(bt * 0.9 + b.rPhase) + amp * 0.25;
      const radius = rBase * rPulse;

      const [h, s, l] = palette.blobs[b.colIdx];
      const intensity = 0.18 + amp * 0.08;

      const grad = bgCtx!.createRadialGradient(cx, cy, 0, cx, cy, radius);
      grad.addColorStop(0, `hsla(${h},${s}%,${l}%,${intensity})`);
      grad.addColorStop(0.45, `hsla(${h},${s}%,${l}%,${intensity * 0.35})`);
      grad.addColorStop(1, `hsla(${h},${s}%,${l}%,0)`);
      bgCtx!.fillStyle = grad;
      bgCtx!.fillRect(0, 0, W, H);
    });

    bgCtx!.globalCompositeOperation = "source-over";

    if (Math.random() < 0.3) {
      bgCtx!.fillStyle = "rgba(255,255,255,0.008)";
      for (let n = 0; n < 80; n++) {
        bgCtx!.fillRect(Math.random() * W, Math.random() * H, 1, 1);
      }
    }
  }

  function resizeBg() {
    const dpr = globalThis.devicePixelRatio || 1;
    const w = globalThis.visualViewport?.width || globalThis.innerWidth;
    const h = globalThis.visualViewport?.height || globalThis.innerHeight;
    canvas.width = Math.max(2, Math.floor(w * dpr));
    canvas.height = Math.max(2, Math.floor(h * dpr));
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    bgCtx!.resetTransform();
    bgCtx!.scale(dpr, dpr);
  }
  resizeBg();
  [0, 100, 300, 800].forEach((t) => setTimeout(resizeBg, t));
  globalThis.addEventListener("resize", resizeBg);
  globalThis.addEventListener("orientationchange", () => setTimeout(resizeBg, 250));
  if (globalThis.visualViewport) {
    globalThis.visualViewport.addEventListener("resize", resizeBg);
  }
  frame();
}
