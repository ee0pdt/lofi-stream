/**
 * Per-note visualisation buffer + canvas renderer for the piano roll
 * shown in the player's `#vis` canvas. The scheduler calls `recordNote`
 * once for every scheduled musical event; the renderer's animation
 * frame loop reads the buffer and draws rectangles positioned by time
 * and pitch, coloured by voice.
 */

export type RollVoice = "chords" | "bass" | "mel1" | "mel2";

export interface RollNote {
  readonly time: number;
  readonly midi: number;
  readonly dur: number;
  readonly voice: RollVoice;
}

const CAPACITY = 256;
const buffer: RollNote[] = [];
let writeIdx = 0;

export function recordNote(note: RollNote): void {
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
  readonly fill: string; // rgba
}

const VOICE_STYLE: Record<RollVoice, VoiceStyle> = {
  chords: { fill: "rgba(212, 164, 86, 0.70)" }, // amber
  bass: { fill: "rgba(122, 95, 184, 0.70)" }, // deep purple
  mel1: { fill: "rgba(232, 122, 107, 0.70)" }, // coral
  mel2: { fill: "rgba(95, 184, 168, 0.70)" }, // teal
};

const MIDI_LO = 36;
const MIDI_HI = 84;
const NOTE_HEIGHT_PX = 3;
const PLAYHEAD_RGBA = "rgba(255,255,255,0.32)";
const FADE_FILL = "rgba(0,0,0,0.08)";

export function mountPianoRoll(
  canvas: HTMLCanvasElement,
  getAudioCtx: () => AudioContext | null,
  getBeatDur: () => number,
): void {
  const ctx = canvas.getContext("2d") as Ctx2D | null;
  if (!ctx) return;

  let visW = 0;
  let visH = 0;
  let dpr = globalThis.devicePixelRatio || 1;

  function syncSize() {
    dpr = globalThis.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    let cssW = rect.width;
    if (cssW < 2 && canvas.parentElement) {
      cssW = canvas.parentElement.getBoundingClientRect().width;
    }
    if (cssW < 2) cssW = globalThis.innerWidth - 40;
    const cssH = 56;
    const newW = Math.max(4, Math.round(cssW * dpr));
    const newH = Math.max(4, Math.round(cssH * dpr));
    if (canvas.width !== newW) canvas.width = newW;
    if (canvas.height !== newH) canvas.height = newH;
    visW = newW;
    visH = newH;
  }

  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(syncSize).observe(canvas);
  }
  [0, 100, 300, 800, 2000].forEach((t) => setTimeout(syncSize, t));
  globalThis.addEventListener("resize", syncSize);
  globalThis.addEventListener("orientationchange", () => setTimeout(syncSize, 250));
  if (globalThis.visualViewport) {
    globalThis.visualViewport.addEventListener("resize", syncSize);
  }

  function pitchToY(midi: number): number {
    const m = Math.max(MIDI_LO, Math.min(MIDI_HI, midi));
    return visH * (1 - (m - MIDI_LO) / (MIDI_HI - MIDI_LO));
  }

  function frame() {
    requestAnimationFrame(frame);
    if (visW < 4 || visH < 4) {
      syncSize();
      if (visW < 4) return;
    }

    // Fade older content (semi-transparent black fill on top of last frame).
    ctx!.fillStyle = FADE_FILL;
    ctx!.fillRect(0, 0, visW, visH);

    const actx = getAudioCtx();
    const now = actx ? actx.currentTime : 0;
    const beatDur = getBeatDur();
    if (beatDur <= 0) return; // not yet started

    // Window: 4 bars total, centred on playhead (2 bars past, 2 bars future).
    // 4 bars × 4 beats/bar × beatDur = 16 × beatDur seconds total → halfSec = 8 × beatDur.
    const halfSec = 8 * beatDur;

    pruneOlderThan(now - halfSec);

    const notes = snapshotInOrder();
    const noteHeight = Math.max(2, NOTE_HEIGHT_PX * dpr);

    for (const n of notes) {
      const rel = n.time - now; // negative = past, positive = future
      if (rel > halfSec || rel + n.dur < -halfSec) continue;
      const xCenter = visW * (0.5 + rel / (2 * halfSec));
      const w = Math.max(2, (n.dur / (2 * halfSec)) * visW);
      const y = pitchToY(n.midi);
      ctx!.fillStyle = VOICE_STYLE[n.voice].fill;
      // Rounded-rect: tiny radius. Fall back to fillRect on no-roundRect.
      const r = Math.min(noteHeight / 2, 1.5 * dpr);
      ctx!.beginPath();
      if (typeof ctx!.roundRect === "function") {
        ctx!.roundRect(xCenter, y - noteHeight / 2, w, noteHeight, r);
        ctx!.fill();
      } else {
        ctx!.fillRect(xCenter, y - noteHeight / 2, w, noteHeight);
      }
    }

    // Playhead at canvas centre.
    ctx!.fillStyle = PLAYHEAD_RGBA;
    ctx!.fillRect(visW / 2 - dpr / 2, 0, Math.max(1, dpr), visH);
  }

  frame();
}

// --- test-only helpers ---
export function __resetPianoRollForTest(): void {
  buffer.length = 0;
  writeIdx = 0;
}
export function __snapshotPianoRollForTest(): RollNote[] {
  return snapshotInOrder();
}
export function __pruneOlderThanForTest(cutoff: number): void {
  pruneOlderThan(cutoff);
}
