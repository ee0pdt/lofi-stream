import {
  __renderFrameForTest,
  __resetPianoRollForTest,
  mountPianoRoll,
  recordNote,
  type RollVoice,
} from "../src/visual/piano-roll.ts";

// Minimal mock canvas; mirrors the one in piano-roll.test.ts. Kept in
// sync by hand to honour the three-files-only PR scope.
function makeMockCanvas(width = 1920, height = 1080): HTMLCanvasElement {
  // deno-lint-ignore no-explicit-any
  const target: any = {
    clearRect: () => {},
    fillRect: () => {},
    beginPath: () => {},
    fill: () => {},
    roundRect: () => {},
    _fillStyle: "",
    _globalAlpha: 1,
    _gco: "source-over",
  };
  const ctx = new Proxy(target, {
    set(t, prop, value) {
      if (prop === "fillStyle") t._fillStyle = value;
      else if (prop === "globalAlpha") t._globalAlpha = value;
      else if (prop === "globalCompositeOperation") t._gco = value;
      else t[prop as string] = value;
      return true;
    },
    get(t, prop) {
      if (prop === "fillStyle") return t._fillStyle;
      if (prop === "globalAlpha") return t._globalAlpha;
      if (prop === "globalCompositeOperation") return t._gco;
      return t[prop as string];
    },
  }) as unknown as CanvasRenderingContext2D;
  // deno-lint-ignore no-explicit-any
  const canvas: any = {
    width,
    height,
    getContext: (k: string) => (k === "2d" ? ctx : null),
    getBoundingClientRect: () => ({
      x: 0,
      y: 0,
      width,
      height,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      toJSON: () => ({}),
    }),
  };
  return canvas as HTMLCanvasElement;
}

const VOICES: readonly RollVoice[] = ["chords", "bass", "mel1", "mel2"];

function fillBuffer(count: number, halfSec: number): void {
  __resetPianoRollForTest();
  // Uniformly distribute notes across the visible window [-halfSec, +halfSec).
  for (let i = 0; i < count; i++) {
    const t = -halfSec + (2 * halfSec * i) / count;
    recordNote({
      time: t,
      midi: 36 + (i % 48),
      dur: 0.25,
      voice: VOICES[i % 4],
    });
  }
}

// Stub rAF so play() doesn't actually loop during bench setup.
const origRaf = globalThis.requestAnimationFrame;
globalThis.requestAnimationFrame =
  ((_cb: FrameRequestCallback) => 1) as typeof requestAnimationFrame;

const canvas = makeMockCanvas(1920, 1080);
const fakeActx = { currentTime: 0 } as AudioContext;
mountPianoRoll(canvas, () => fakeActx, () => 0.5);

// Restore rAF — the bench drives the renderer directly via __renderFrameForTest.
globalThis.requestAnimationFrame = origRaf;

Deno.bench("piano-roll render: 256 notes", () => {
  fillBuffer(256, 4);
  __renderFrameForTest();
});

Deno.bench("piano-roll recordNote: hot path", () => {
  __resetPianoRollForTest();
  // 10 000 calls; the first 256 fill the buffer, the rest take the
  // overflow path and may exercise the lazy-prune branch.
  for (let i = 0; i < 10_000; i++) {
    recordNote({
      time: i * 0.001,
      midi: 36 + (i % 48),
      dur: 0.1,
      voice: VOICES[i & 3],
    });
  }
});
