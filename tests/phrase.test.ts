import { assertEquals } from "jsr:@std/assert@^1";
import { generatePhrase } from "../src/music/phrase.ts";
import type { Chord } from "../src/types.ts";

const PROG: readonly [Chord, Chord, Chord, Chord] = [
  [0, "min7"],
  [5, "min7"],
  [8, "maj7"],
  [3, "min7"],
];

/** Mulberry32 — small deterministic PRNG suitable for structural tests. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BEAT_DUR = 0.75; // 80 BPM

Deno.test("generatePhrase: returns 4 bars (one per chord in prog)", () => {
  const p = generatePhrase(PROG, {
    currentKey: 0,
    complexity: 0.5,
    beatDur: BEAT_DUR,
    rng: mulberry32(1),
  });
  assertEquals(p.length, 4);
});

Deno.test("generatePhrase: with complexity 0.5, no bar is empty", () => {
  const p = generatePhrase(PROG, {
    currentKey: 0,
    complexity: 0.5,
    beatDur: BEAT_DUR,
    rng: mulberry32(42),
  });
  for (let i = 0; i < p.length; i++) {
    if (p[i].length === 0) {
      throw new Error(`bar ${i} is empty at complexity 0.5`);
    }
  }
});

Deno.test("generatePhrase: notes have plausible midi and dur ranges", () => {
  const p = generatePhrase(PROG, {
    currentKey: 0,
    complexity: 0.5,
    beatDur: BEAT_DUR,
    rng: mulberry32(7),
  });
  for (const bar of p) {
    for (const note of bar) {
      if (note.midi < 60 || note.midi > 96) {
        throw new Error(`midi ${note.midi} out of melodyOct range`);
      }
      // Anticipation lets `beat` be slightly negative.
      if (note.beat < -BEAT_DUR || note.beat > 4 * BEAT_DUR) {
        throw new Error(`beat ${note.beat} out of plausible range`);
      }
      if (note.dur <= 0 || note.dur > 2 * BEAT_DUR) {
        throw new Error(`dur ${note.dur} out of plausible range`);
      }
    }
  }
});

Deno.test("generatePhrase: deterministic with same seed", () => {
  const opts = {
    currentKey: 3,
    complexity: 0.6,
    beatDur: BEAT_DUR,
  };
  const a = generatePhrase(PROG, { ...opts, rng: mulberry32(123) });
  const b = generatePhrase(PROG, { ...opts, rng: mulberry32(123) });
  assertEquals(a, b);
});

Deno.test("generatePhrase: different seeds produce different output", () => {
  const opts = {
    currentKey: 0,
    complexity: 0.7,
    beatDur: BEAT_DUR,
  };
  const a = generatePhrase(PROG, { ...opts, rng: mulberry32(1) });
  const b = generatePhrase(PROG, { ...opts, rng: mulberry32(2) });
  if (JSON.stringify(a) === JSON.stringify(b)) {
    throw new Error("expected different output from different seeds");
  }
});

Deno.test("generatePhrase: default rng is Math.random (no throw without rng arg)", () => {
  const p = generatePhrase(PROG, {
    currentKey: 0,
    complexity: 0.5,
    beatDur: BEAT_DUR,
  });
  assertEquals(p.length, 4);
});
