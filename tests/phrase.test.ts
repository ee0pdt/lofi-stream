import { assert, assertEquals } from "jsr:@std/assert@^1";
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

Deno.test("generatePhrase: sparse style emits at most 2 notes per bar", () => {
  const phrase = generatePhrase(PROG, {
    currentKey: 0,
    complexity: 1.0,
    beatDur: BEAT_DUR,
    phraseStyle: "sparse",
    rng: () => 0.5,
  });
  for (const bar of phrase) {
    assert(bar.length <= 2, `sparse bar exceeded 2 notes: ${bar.length}`);
  }
});

Deno.test("generatePhrase: dense style emits at least as many notes as normal", () => {
  const opts = {
    currentKey: 0,
    complexity: 0.6,
    beatDur: BEAT_DUR,
    rng: () => 0.5,
  };
  const normal = generatePhrase(PROG, opts);
  const dense = generatePhrase(PROG, { ...opts, phraseStyle: "dense" });
  const normalNotes = normal.reduce((a, b) => a + b.length, 0);
  const denseNotes = dense.reduce((a, b) => a + b.length, 0);
  assert(denseNotes >= normalNotes, `dense (${denseNotes}) < normal (${normalNotes})`);
});

Deno.test("generatePhrase: seedNote pulls bar 0 anchor to the nearest chord tone", () => {
  // For bar 0 with currentKey=0 and min7 voicing [0,3,7,10], rootMidi=48
  // gives chord tones (before melodyOct clamp) [48,51,55,58], which clamp
  // into the melody register [60,79] as [60,63,67,70].
  // Default anchor for a call bar is idx 1 → 63.
  // With seedNote=70 the nearest chord tone is 70 itself, so the anchor
  // should switch to 70.
  const opts = {
    currentKey: 0,
    complexity: 0.5,
    beatDur: BEAT_DUR,
    rng: () => 0.5,
  };
  const noSeed = generatePhrase(PROG, opts);
  const seeded = generatePhrase(PROG, { ...opts, seedNote: 70 });
  assertEquals(noSeed[0][0]?.midi, 63);
  assertEquals(seeded[0][0]?.midi, 70);
});

Deno.test("generatePhrase dense: all note beats are within [-beatDur*0.25, beatDur*4]", () => {
  const bd = 60 / 70;
  const prog: [Chord, Chord, Chord, Chord] = [
    [0, "min7"],
    [5, "min7"],
    [8, "maj7"],
    [3, "min7"],
  ];
  const phrase = generatePhrase(prog, {
    currentKey: 0,
    complexity: 0.8,
    beatDur: bd,
    phraseStyle: "dense",
    rng: Math.random,
  });
  for (const bar of phrase) {
    for (const note of bar) {
      if (!note.anticipation) {
        assertEquals(
          note.beat >= 0 && note.beat < bd * 4,
          true,
          `beat ${note.beat} out of range`,
        );
      }
    }
  }
});

Deno.test("generatePhrase: sparse style suppresses anticipations", () => {
  const phrase = generatePhrase(PROG, {
    currentKey: 0,
    complexity: 1.0,
    beatDur: BEAT_DUR,
    phraseStyle: "sparse",
    rng: () => 0.01, // would normally trigger anticipation
  });
  for (const bar of phrase) {
    for (const n of bar) {
      assert(!n.anticipation, "anticipation present in sparse phrase");
    }
  }
});
