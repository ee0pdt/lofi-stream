import { assert, assertEquals } from "jsr:@std/assert@^1";
import {
  __pruneOlderThanForTest,
  __renderFrameForTest,
  __resetPianoRollForTest,
  __snapshotPianoRollForTest,
  mountPianoRoll,
  recordNote,
  type RollVoice,
} from "../src/visual/piano-roll.ts";

// Mock 2D context + canvas. Inlined here (and duplicated in the bench
// file) to keep this PR scoped to the three files in the spec.
interface MockCalls {
  clearRect: number;
  fillRect: number;
  beginPath: number;
  fill: number;
  roundRect: number;
  fillStyleSets: string[];
}
interface MockCtx {
  ctx: CanvasRenderingContext2D;
  calls: MockCalls;
  reset(): void;
}
function makeMockCanvas(width = 800, height = 600): {
  canvas: HTMLCanvasElement;
  mock: MockCtx;
} {
  const calls: MockCalls = {
    clearRect: 0,
    fillRect: 0,
    beginPath: 0,
    fill: 0,
    roundRect: 0,
    fillStyleSets: [],
  };
  // deno-lint-ignore no-explicit-any
  const target: any = {
    clearRect: () => calls.clearRect++,
    fillRect: () => calls.fillRect++,
    beginPath: () => calls.beginPath++,
    fill: () => calls.fill++,
    roundRect: () => calls.roundRect++,
    _fillStyle: "",
    _globalAlpha: 1,
    _gco: "source-over",
  };
  const ctx = new Proxy(target, {
    set(t, prop, value) {
      if (prop === "fillStyle") {
        calls.fillStyleSets.push(String(value));
        t._fillStyle = value;
      } else if (prop === "globalAlpha") {
        t._globalAlpha = value;
      } else if (prop === "globalCompositeOperation") {
        t._gco = value;
      } else {
        t[prop as string] = value;
      }
      return true;
    },
    get(t, prop) {
      if (prop === "fillStyle") return t._fillStyle;
      if (prop === "globalAlpha") return t._globalAlpha;
      if (prop === "globalCompositeOperation") return t._gco;
      return t[prop as string];
    },
  }) as unknown as CanvasRenderingContext2D;
  const mock: MockCtx = {
    ctx,
    calls,
    reset() {
      calls.clearRect = 0;
      calls.fillRect = 0;
      calls.beginPath = 0;
      calls.fill = 0;
      calls.roundRect = 0;
      calls.fillStyleSets.length = 0;
    },
  };
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
  return { canvas: canvas as HTMLCanvasElement, mock };
}

Deno.test("piano-roll: recordNote appends to ring buffer", () => {
  __resetPianoRollForTest();
  recordNote({ time: 1.0, midi: 60, dur: 0.5, voice: "mel1" });
  recordNote({ time: 1.5, midi: 64, dur: 0.5, voice: "mel2" });
  const snap = __snapshotPianoRollForTest();
  assertEquals(snap.length, 2);
  assertEquals(snap[0].midi, 60);
  assertEquals(snap[0].voice as RollVoice, "mel1");
  assertEquals(snap[1].midi, 64);
});

Deno.test("piano-roll: buffer wraps at capacity", () => {
  __resetPianoRollForTest();
  // capacity is 256; push 300 notes — oldest should be evicted
  for (let i = 0; i < 300; i++) {
    recordNote({ time: i, midi: 60 + (i % 12), dur: 0.1, voice: "chords" });
  }
  const snap = __snapshotPianoRollForTest();
  assertEquals(snap.length, 256);
  // oldest surviving note is index 300 - 256 = 44
  assertEquals(snap[0].time, 44);
  assertEquals(snap[snap.length - 1].time, 299);
});

Deno.test("piano-roll: pruneOlderThan drops notes ending before cutoff", () => {
  __resetPianoRollForTest();
  recordNote({ time: 0, midi: 60, dur: 0.5, voice: "mel1" }); // ends at 0.5
  recordNote({ time: 1, midi: 60, dur: 0.5, voice: "mel1" }); // ends at 1.5
  recordNote({ time: 2, midi: 60, dur: 0.5, voice: "mel1" }); // ends at 2.5
  __pruneOlderThanForTest(1.6); // drops the first two (end at 0.5 and 1.5, both < 1.6)
  const snap = __snapshotPianoRollForTest();
  assertEquals(snap.length, 1);
  assertEquals(snap[0].time, 2);
});

Deno.test("piano-roll: clear() empties buffer and wipes canvas", () => {
  __resetPianoRollForTest();
  const { canvas, mock } = makeMockCanvas(800, 600);
  const roll = mountPianoRoll(canvas, () => null, () => 0.5, () => "rainy");
  recordNote({ time: 0, midi: 60, dur: 0.5, voice: "mel1" });
  recordNote({ time: 1, midi: 64, dur: 0.5, voice: "mel2" });
  assertEquals(__snapshotPianoRollForTest().length, 2);
  mock.reset();
  roll.clear();
  assertEquals(__snapshotPianoRollForTest().length, 0, "buffer drained");
  assertEquals(mock.calls.clearRect, 1, "clear() must wipe the canvas");
});

Deno.test("piano-roll: pause() cancels pending rAF after play()", () => {
  __resetPianoRollForTest();
  const { canvas } = makeMockCanvas(800, 600);
  const origRaf = globalThis.requestAnimationFrame;
  const origCaf = globalThis.cancelAnimationFrame;
  let rafCalls = 0;
  let cafCalls = 0;
  let lastHandle = 0;
  globalThis.requestAnimationFrame = ((_cb: FrameRequestCallback) => {
    rafCalls++;
    lastHandle = rafCalls;
    return lastHandle;
  }) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((h: number) => {
    cafCalls++;
    assertEquals(h, lastHandle);
  }) as typeof cancelAnimationFrame;
  try {
    const roll = mountPianoRoll(canvas, () => null, () => 0.5, () => "rainy");
    const before = rafCalls;
    roll.play();
    assert(rafCalls > before, "play() should schedule a rAF");
    const afterPlay = rafCalls;
    roll.pause();
    assertEquals(cafCalls, 1, "pause() should call cancelAnimationFrame once");
    // Pausing again is a no-op.
    roll.pause();
    assertEquals(cafCalls, 1);
    // No further rAF should be scheduled by pause().
    assertEquals(rafCalls, afterPlay);
  } finally {
    globalThis.requestAnimationFrame = origRaf;
    globalThis.cancelAnimationFrame = origCaf;
  }
});

Deno.test("piano-roll: batched draw writes voice fillStyle exactly once", () => {
  __resetPianoRollForTest();
  const { canvas, mock } = makeMockCanvas(800, 600);
  // Stub rAF so play() doesn't loop; we manually drive one frame.
  const origRaf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame =
    ((_cb: FrameRequestCallback) => 1) as typeof requestAnimationFrame;
  try {
    // Force a fake audio context so getAudioCtx() returns a stable now.
    const fakeActx = { currentTime: 0 } as AudioContext;
    mountPianoRoll(canvas, () => fakeActx, () => 0.5, () => "rainy");
    // Five mel1 notes inside the visible window (halfSec = 8 * 0.5 = 4s).
    for (let i = 0; i < 5; i++) {
      recordNote({ time: i * 0.2, midi: 60 + i, dur: 0.3, voice: "mel1" });
    }
    mock.reset();
    __renderFrameForTest();
    // Among all fillStyle writes this frame, the rainy-palette mel1 colour
    // (184,212,240) should appear exactly once — proving §5.3 batching.
    const mel1Writes = mock.calls.fillStyleSets.filter((s) => s.includes("184,212,240"));
    assertEquals(mel1Writes.length, 1, "mel1 fillStyle must be set exactly once");
    // No other voice colour should appear (no other notes recorded).
    const chordsWrites = mock.calls.fillStyleSets.filter((s) => s.includes("138,184,216"));
    const bassWrites = mock.calls.fillStyleSets.filter((s) => s.includes("107,111,184"));
    const mel2Writes = mock.calls.fillStyleSets.filter((s) => s.includes("122,200,200"));
    assertEquals(chordsWrites.length, 0);
    assertEquals(bassWrites.length, 0);
    assertEquals(mel2Writes.length, 0);
    // Five rect draws (one per note), via fillRect or roundRect.
    assert(mock.calls.fillRect + mock.calls.roundRect >= 5);
  } finally {
    globalThis.requestAnimationFrame = origRaf;
  }
});
