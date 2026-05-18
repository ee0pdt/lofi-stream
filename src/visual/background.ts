/**
 * Background renderer orchestrator. Tries WebGPU; on failure, falls
 * back to Canvas2D. Also provides `createAmplitudeReader` — a small
 * helper that polls the analyser for time-domain RMS and smooths it
 * into a 0..1 value usable by either renderer.
 */

import { tryWebGPU } from "./webgpu.ts";
import { startCanvas2D } from "./canvas2d.ts";
import type { Mood } from "../types.ts";

export async function mountBackground(
  canvas: HTMLCanvasElement,
  getMood: () => Mood,
  getAmp: () => number,
): Promise<void> {
  const ok = await tryWebGPU(canvas, getMood, getAmp);
  if (!ok) startCanvas2D(canvas, getMood, getAmp);
}

/**
 * Build a per-frame amplitude reader. Each call returns the latest
 * smoothed amplitude AND updates the internal smoothing state. When
 * the analyser is null, the reader decays toward zero.
 */
export function createAmplitudeReader(
  getAnalyser: () => AnalyserNode | null,
): () => number {
  let smoothed = 0;
  return () => {
    const analyser = getAnalyser();
    if (!analyser) {
      smoothed *= 0.92;
      return smoothed;
    }
    const buf = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i];
    const avg = sum / buf.length;
    smoothed = smoothed * 0.85 + (avg / 255) * 0.15;
    return smoothed;
  };
}

/** Parse the current `--warm` CSS custom property into an [r,g,b] triple. */
export function readAccentRgb(): readonly [number, number, number] {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue("--warm")
    .trim();
  if (v.startsWith("#")) {
    const r = parseInt(v.slice(1, 3), 16);
    const g = parseInt(v.slice(3, 5), 16);
    const b = parseInt(v.slice(5, 7), 16);
    return [r, g, b];
  }
  const m = v.match(/(\d+(?:\.\d+)?)/g);
  if (m && m.length >= 3) return [+m[0], +m[1], +m[2]];
  return [201, 125, 64];
}
