/**
 * Per-note visualisation buffer + canvas renderer for the piano roll
 * shown in the fullscreen `#vis` canvas above the gaussian blobs.
 * `recordNote` is a module-level free function: the scheduler writes
 * into a ring buffer that `mountPianoRoll`'s renderer reads from.
 * Pruning is lazy (only on overflow + stale-head), draw passes batch
 * by voice colour, and the render loop runs only between play/pause.
 */

import type { Mood } from "../types.ts";

export type RollVoice = "chords" | "bass" | "mel1" | "mel2";

export interface RollNote {
  readonly time: number;
  readonly midi: number;
  readonly dur: number;
  readonly voice: RollVoice;
}

export interface PianoRoll {
  play(): void;
  pause(): void;
  clear(): void;
}

const CAPACITY = 256;
const buffer: RollNote[] = [];
let writeIdx = 0;

// Track the slice of the canvas-visible window in seconds for lazy-prune.
// `recordNote` doesn't know the current playhead, so we keep a hint that
// the renderer refreshes each frame.
let lastHalfSec = 8; // safe default; renderer keeps it current
let lastNow = 0;

function resetBuffer(): void {
  buffer.length = 0;
  writeIdx = 0;
}

function oldestIndex(): number {
  return buffer.length < CAPACITY ? 0 : writeIdx;
}

function maybeLazyPrune(): void {
  if (buffer.length < CAPACITY) return;
  const oldest = buffer[oldestIndex()];
  if (!oldest) return;
  // Only compact when the oldest note has fully scrolled off the past edge.
  if (oldest.time + oldest.dur >= lastNow - lastHalfSec) return;
  const cutoff = lastNow - lastHalfSec;
  const kept: RollNote[] = [];
  for (let i = 0; i < CAPACITY; i++) {
    const n = buffer[(writeIdx + i) % CAPACITY];
    if (n.time + n.dur >= cutoff) kept.push(n);
  }
  buffer.length = 0;
  for (const n of kept) buffer.push(n);
  writeIdx = 0;
}

export function recordNote(note: RollNote): void {
  if (buffer.length < CAPACITY) {
    buffer.push(note);
    return;
  }
  maybeLazyPrune();
  if (buffer.length < CAPACITY) {
    buffer.push(note);
  } else {
    buffer[writeIdx] = note;
    writeIdx = (writeIdx + 1) % CAPACITY;
  }
}

function snapshotInOrder(): RollNote[] {
  if (buffer.length < CAPACITY) return buffer.slice();
  const out: RollNote[] = [];
  for (let i = 0; i < CAPACITY; i++) {
    out.push(buffer[(writeIdx + i) % CAPACITY]);
  }
  return out;
}

function pruneOlderThan(cutoff: number): void {
  // Re-pack the buffer with only notes whose end-time >= cutoff.
  const kept = snapshotInOrder().filter((n) => n.time + n.dur >= cutoff);
  buffer.length = 0;
  for (const n of kept) buffer.push(n);
  writeIdx = 0;
}

// --- renderer ---

type Ctx2D = CanvasRenderingContext2D & {
  roundRect?: (x: number, y: number, w: number, h: number, r: number) => void;
};

interface VoiceStyle {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

// Per-mood voice palettes. Each set is hand-tuned to harmonise with the
// gaussian background in `canvas2d.ts` MOOD_PALETTE for that mood, while
// keeping the four voices distinguishable under additive blend.
// Base alpha is 0.45 (down from 0.70) to compensate for additive blending.
const MOOD_VOICE_RGB: Record<Mood, Record<RollVoice, VoiceStyle>> = {
  rainy: {
    chords: { r: 138, g: 184, b: 216 }, // steel blue
    bass: { r: 107, g: 111, b: 184 }, // indigo
    mel1: { r: 184, g: 212, b: 240 }, // ice
    mel2: { r: 122, g: 200, b: 200 }, // soft cyan
  },
  late: {
    chords: { r: 184, g: 155, b: 208 }, // muted violet
    bass: { r: 142, g: 122, b: 200 }, // periwinkle
    mel1: { r: 230, g: 163, b: 208 }, // rose
    mel2: { r: 168, g: 176, b: 224 }, // lavender
  },
  cafe: {
    chords: { r: 212, g: 164, b: 86 }, // amber
    bass: { r: 184, g: 106, b: 72 }, // burnt sienna
    mel1: { r: 232, g: 150, b: 122 }, // peach
    mel2: { r: 224, g: 200, b: 128 }, // straw
  },
  sleepy: {
    chords: { r: 128, g: 184, b: 184 }, // muted teal
    bass: { r: 90, g: 140, b: 174 }, // slate blue
    mel1: { r: 168, g: 208, b: 204 }, // seafoam
    mel2: { r: 152, g: 192, b: 208 }, // sky
  },
  transit: {
    chords: { r: 200, g: 112, b: 208 }, // orchid
    bass: { r: 128, g: 80, b: 176 }, // royal purple
    mel1: { r: 224, g: 122, b: 176 }, // neon pink
    mel2: { r: 128, g: 160, b: 224 }, // electric blue
  },
};
const VOICE_ORDER: readonly RollVoice[] = ["chords", "bass", "mel1", "mel2"];
const BASE_ALPHA = 0.45;

const MIDI_LO = 36;
const MIDI_HI = 84;
const PLAYHEAD_RGBA = "rgba(255,255,255,0.45)";

// Per-voice index buckets (indices into `buffer` after walking ring order).
// Pre-allocated once and reused each frame to avoid allocation churn.
const chordsIdx = new Uint16Array(CAPACITY);
const bassIdx = new Uint16Array(CAPACITY);
const mel1Idx = new Uint16Array(CAPACITY);
const mel2Idx = new Uint16Array(CAPACITY);

export function mountPianoRoll(
  canvas: HTMLCanvasElement,
  getAudioCtx: () => AudioContext | null,
  getBeatDur: () => number,
  getMood: () => Mood,
): PianoRoll {
  const ctx = canvas.getContext("2d") as Ctx2D | null;
  // Even if the 2D context is unavailable, return a no-op PianoRoll so
  // callers can still wire lifecycle hooks without conditional code.
  if (!ctx) {
    return { play() {}, pause() {}, clear() {} };
  }

  // Additive blend: notes bloom against the gaussian-blob background.
  // Set once at mount — never toggled per-frame.
  ctx.globalCompositeOperation = "lighter";

  let visW = 0;
  let visH = 0;
  let dpr = globalThis.devicePixelRatio || 1;
  let rafHandle = 0;
  let isRunning = false;
  // Height (CSS px) of the bottom .sheet — kept current via ResizeObserver
  // so the pitch range maps into the area above the controls.
  let sheetCssH = 0;

  function syncSize() {
    dpr = globalThis.devicePixelRatio || 1;
    // Viewport-only sizing. Don't fall back to the canvas's own BCR: with
    // no CSS dimension override the canvas renders at its bitmap size, so
    // BCR returns the canvas's CURRENT size and creates a feedback loop
    // that doubles the bitmap every tick.
    const vv = globalThis.visualViewport;
    let cssW = (vv && vv.width) || globalThis.innerWidth || 0;
    let cssH = (vv && vv.height) || globalThis.innerHeight || 0;
    // Headless test fallback: only if no window dims are available at all.
    if (!cssW || !cssH) {
      const rect = canvas.getBoundingClientRect?.();
      if (rect && rect.width > 0 && rect.width < 8192) {
        cssW = rect.width;
        cssH = rect.height;
      }
    }
    if (!cssW || !cssH) return;
    const newW = Math.max(4, Math.round(cssW * dpr));
    const newH = Math.max(4, Math.round(cssH * dpr));
    if (canvas.width !== newW) canvas.width = newW;
    if (canvas.height !== newH) canvas.height = newH;
    visW = newW;
    visH = newH;
    // Canvas resize resets composite-op on some implementations.
    ctx!.globalCompositeOperation = "lighter";
  }

  // Initial sizing so clear()/play() can rely on visW/visH immediately.
  syncSize();
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(syncSize).observe(canvas);
    // Observe the bottom sheet so pitch mapping shrinks to fit when the
    // sheet grows (e.g. drawer expands). Lookup is deferred — the sheet
    // node may not yet exist when piano-roll mounts.
    const sheetObserver = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) sheetCssH = rect.height;
    });
    const tryObserveSheet = () => {
      const sheet = typeof document !== "undefined" ? document.querySelector(".sheet") : null;
      if (sheet instanceof HTMLElement) {
        sheetCssH = sheet.getBoundingClientRect().height;
        sheetObserver.observe(sheet);
        return true;
      }
      return false;
    };
    if (!tryObserveSheet() && typeof setTimeout === "function") {
      [50, 200, 800].forEach((t) => setTimeout(tryObserveSheet, t));
    }
  }
  // The deferred resize fan-out is a browser-only safety net for
  // late-arriving layout (PWA viewport quirks). Skip it in headless
  // test environments where it would leak timers.
  if (typeof document !== "undefined") {
    [0, 100, 300, 800, 2000].forEach((t) => setTimeout(syncSize, t));
  }
  globalThis.addEventListener("resize", syncSize);
  globalThis.addEventListener("orientationchange", () => setTimeout(syncSize, 250));
  if (globalThis.visualViewport) {
    globalThis.visualViewport.addEventListener("resize", syncSize);
  }

  function pitchToY(midi: number): number {
    const m = Math.max(MIDI_LO, Math.min(MIDI_HI, midi));
    // Reserve the lower band for the bottom .sheet; map pitches into the
    // strip above it so the lowest MIDI sits just above the controls.
    const effectiveH = Math.max(40, visH - sheetCssH * dpr);
    return effectiveH * (1 - (m - MIDI_LO) / (MIDI_HI - MIDI_LO));
  }

  function bucketFor(v: RollVoice): Uint16Array {
    switch (v) {
      case "chords":
        return chordsIdx;
      case "bass":
        return bassIdx;
      case "mel1":
        return mel1Idx;
      case "mel2":
        return mel2Idx;
    }
  }

  function frame() {
    if (visW < 4 || visH < 4) {
      syncSize();
      if (visW < 4) {
        if (isRunning) rafHandle = requestAnimationFrame(frame);
        return;
      }
    }

    // Additive composite means a black fill is a no-op; wipe instead.
    ctx!.clearRect(0, 0, visW, visH);

    const actx = getAudioCtx();
    const now = actx ? actx.currentTime : 0;
    const beatDur = getBeatDur();
    if (beatDur <= 0) {
      if (isRunning) rafHandle = requestAnimationFrame(frame);
      return;
    }

    // Window: 4 bars total, centred on playhead (2 past, 2 future).
    const halfSec = 8 * beatDur;
    lastHalfSec = halfSec;
    lastNow = now;

    const noteHeight = Math.max(3, Math.round(visH / 80));
    const len = buffer.length;
    const start = len < CAPACITY ? 0 : writeIdx;

    // Bucket pass: O(len), per-voice counters.
    let cN = 0, bN = 0, m1N = 0, m2N = 0;
    for (let i = 0; i < len; i++) {
      const idx = (start + i) % CAPACITY;
      const n = buffer[idx];
      const rel = n.time - now;
      if (rel > halfSec || rel + n.dur < -halfSec) continue;
      switch (n.voice) {
        case "chords":
          chordsIdx[cN++] = idx;
          break;
        case "bass":
          bassIdx[bN++] = idx;
          break;
        case "mel1":
          mel1Idx[m1N++] = idx;
          break;
        case "mel2":
          mel2Idx[m2N++] = idx;
          break;
      }
    }
    const counts = [cN, bN, m1N, m2N];

    // Draw pass: exactly one fillStyle write per voice. Per-note fade is
    // applied via `globalAlpha` (cheap state change), so fillStyle stays
    // batched at one write per voice as §5.3 specifies.
    const r2 = 1.5 * dpr;
    const cheapThresh = 4 * dpr;
    // Mood palette is read once per frame; mood only changes on user click.
    const palette = MOOD_VOICE_RGB[getMood()] ?? MOOD_VOICE_RGB.rainy;
    for (let v = 0; v < 4; v++) {
      const voice = VOICE_ORDER[v];
      const n = counts[v];
      if (n === 0) continue;
      const bucket = bucketFor(voice);
      const rgb = palette[voice];
      ctx!.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},1)`;
      for (let j = 0; j < n; j++) {
        const note = buffer[bucket[j]];
        const rel = note.time - now;
        const fade = rel < 0 ? Math.max(0, 1 + rel / halfSec) : 1;
        const a = BASE_ALPHA * fade;
        if (a <= 0) continue;
        ctx!.globalAlpha = a;
        const xCenter = visW * (0.5 + rel / (2 * halfSec));
        const w = Math.max(2, (note.dur / (2 * halfSec)) * visW);
        const y = pitchToY(note.midi) - noteHeight / 2;
        if (w < cheapThresh || typeof ctx!.roundRect !== "function") {
          ctx!.fillRect(xCenter, y, w, noteHeight);
        } else {
          ctx!.beginPath();
          ctx!.roundRect(xCenter, y, w, noteHeight, Math.min(noteHeight / 2, r2));
          ctx!.fill();
        }
      }
    }
    ctx!.globalAlpha = 1;

    // Playhead at canvas centre.
    ctx!.fillStyle = PLAYHEAD_RGBA;
    ctx!.fillRect(visW / 2 - dpr / 2, 0, Math.max(1, dpr), visH);

    if (isRunning) rafHandle = requestAnimationFrame(frame);
  }

  // Expose the inner render once for tests via the __renderFrame helper below.
  lastFrame = frame;

  return {
    play() {
      if (isRunning) return;
      isRunning = true;
      rafHandle = requestAnimationFrame(frame);
    },
    pause() {
      if (!isRunning) return;
      isRunning = false;
      if (rafHandle) cancelAnimationFrame(rafHandle);
      rafHandle = 0;
    },
    clear() {
      if (visW >= 4 && visH >= 4) ctx!.clearRect(0, 0, visW, visH);
      resetBuffer();
    },
  };
}

// --- test-only helpers ---
// `lastFrame` lets the bench/test suites invoke the most recently mounted
// renderer's draw function once against a mocked context.
let lastFrame: (() => void) | null = null;

export function __resetPianoRollForTest(): void {
  resetBuffer();
}
export function __snapshotPianoRollForTest(): RollNote[] {
  return snapshotInOrder();
}
export function __pruneOlderThanForTest(cutoff: number): void {
  pruneOlderThan(cutoff);
}
export function __renderFrameForTest(): void {
  if (lastFrame) lastFrame();
}
