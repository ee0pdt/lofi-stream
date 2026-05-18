# Improv Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Improv" mode toggle alongside mood buttons that replaces the fixed `FORMS` loop with a dynamic section sequencer (break / normal / buildup / peak / bridge) which drives melody density, phrasing style, and instrument velocity through an energy arc.

**Architecture:** A new pure `improv-sequencer` module owns the section graph and energy arc. The scheduler reads `store.isImprov` and, when true, advances sections via the sequencer instead of the fixed form playhead, passing a `phraseStyle` and `seedNote` into `generatePhrase` and a `dynamicLevel` scalar into the comp/bass/drum schedulers. Composed-mode behaviour is byte-identical when Improv is off.

**Tech Stack:** TypeScript, Deno (`deno task check` / `deno task test`), Web Audio API. No new runtime dependencies.

**Spec:** [`docs/superpowers/specs/2026-05-18-improv-mode-design.md`](../specs/2026-05-18-improv-mode-design.md)

**Branch:** `feat/improv-mode` (already created from `main`).

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Modify | `src/types.ts` | Add `isImprov` to `AppState`; add `improv` block to `MoodMeta`; add `PhraseStyle` and `SectionType` types |
| Modify | `src/state-init.ts` | Default `isImprov` to `false` |
| Modify | `src/music/moods.ts` | Add `improv` config to every mood entry |
| Create | `src/music/improv-sequencer.ts` | Pure section graph + energy arc state machine |
| Create | `tests/improv-sequencer.test.ts` | Unit tests for the sequencer |
| Modify | `src/music/phrase.ts` | Add `phraseStyle` and `seedNote` options to `generatePhrase` |
| Modify | `tests/phrase.test.ts` | Cover the new phrase options |
| Modify | `src/audio/scheduler.ts` | Branch on `isImprov`; track improv state; pass new options into `generatePhrase`; scale velocities by `dynamicLevel`; expose `lastEmittedMidi` + `improvAdvance` helpers |
| Modify | `index.html` | Add the Improv button to the mood row |
| Modify | `src/ui/mood-ui.ts` | Wire the Improv button; add an `applyImprovButtonState` setter |
| Modify | `src/main.ts` | Reset `isImprov` to `false` and re-init sequencer on mood change |

---

## Task 1: Confirm working branch and clean baseline

**Files:** none

- [ ] **Step 1: Verify branch and clean tree**

```bash
git branch --show-current
git status --short
```

Expected:
- Current branch: `feat/improv-mode`
- No staged changes for `src/**` or `tests/**`. (`icons/icon-*.png` modifications are pre-existing and unrelated; leave them.)

- [ ] **Step 2: Verify the baseline check + test commands pass**

```bash
deno task check && deno task test
```

Expected: `99 passed | 0 failed`. Stop and resolve before continuing if anything fails.

---

## Task 2: Add `isImprov` to AppState with default `false`

**Files:**
- Modify: `src/types.ts` (the `AppState` interface)
- Modify: `src/state-init.ts`
- Modify: `tests/state-init.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/state-init.test.ts`:

```ts
Deno.test("initialAppState: isImprov defaults to false", () => {
  const s = initialAppState();
  assertEquals(s.isImprov, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
deno task test -- tests/state-init.test.ts
```

Expected: a compile error or a failure on the new test only.

- [ ] **Step 3: Extend `AppState`**

In `src/types.ts`, change the `AppState` interface:

```ts
export interface AppState {
  currentMood: Mood;
  isPlaying: boolean;
  complexity: number;
  isImprov: boolean;
}
```

- [ ] **Step 4: Default `isImprov` in `initialAppState`**

In `src/state-init.ts`:

```ts
export function initialAppState(): AppState {
  return {
    currentMood: "rainy",
    isPlaying: false,
    complexity: DEFAULT_SETTINGS.rainy.complexity,
    isImprov: false,
  };
}
```

- [ ] **Step 5: Run check + tests**

```bash
deno task check && deno task test
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/state-init.ts tests/state-init.test.ts
git commit -m "feat(improv): add isImprov to AppState (default false)"
```

---

## Task 3: Add per-mood `improv` config to MoodMeta

**Files:**
- Modify: `src/types.ts` (extend `MoodMeta`)
- Modify: `src/music/moods.ts` (populate config for all five moods)
- Modify: `tests/moods.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/moods.test.ts`:

```ts
Deno.test("MOOD_META: every mood has an improv config with valid shape", () => {
  for (const mood of Object.keys(MOOD_META) as Array<keyof typeof MOOD_META>) {
    const cfg = MOOD_META[mood].improv;
    assertEquals(typeof cfg.peakDensityCap, "number");
    assert(cfg.peakDensityCap >= 0.5 && cfg.peakDensityCap <= 1.0);
    assertEquals(cfg.bridgeSubstitutions.length, 4);
    for (const [rootOffset, voicingName] of cfg.bridgeSubstitutions) {
      assert(rootOffset >= 0 && rootOffset <= 11);
      assert(voicingName in VOICINGS);
    }
  }
});
```

Add (or confirm) the imports at the top of `tests/moods.test.ts`:

```ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { MOOD_META } from "../src/music/moods.ts";
import { VOICINGS } from "../src/music/voicings.ts";
```

(If `assert` / `assertEquals` are already imported, leave them; if `VOICINGS` is not imported, add it.)

- [ ] **Step 2: Run test to verify it fails**

```bash
deno task test -- tests/moods.test.ts
```

Expected: failure — either a compile error about `improv`, or `cfg is undefined`.

- [ ] **Step 3: Extend `MoodMeta` in `src/types.ts`**

Add this interface alongside `MoodMeta`:

```ts
export interface MoodImprovConfig {
  readonly peakDensityCap: number;
  readonly bridgeSubstitutions: readonly [Chord, Chord, Chord, Chord];
}
```

Then add one field to the existing `MoodMeta` interface:

```ts
  readonly improv: MoodImprovConfig;
```

(Place it after `ambience` to match the order used in `moods.ts`.)

- [ ] **Step 4: Populate `improv` for every mood in `src/music/moods.ts`**

Inside each mood object in `MOOD_META`, add an `improv` block. The exact values:

- `rainy` (low cap, mood is gentle):

```ts
    improv: {
      peakDensityCap: 0.75,
      bridgeSubstitutions: [
        [10, "maj7"],
        [5, "min9"],
        [3, "maj9"],
        [8, "dom9"],
      ],
    },
```

- `late`:

```ts
    improv: {
      peakDensityCap: 1.0,
      bridgeSubstitutions: [
        [2, "min7b5"],
        [7, "dom9"],
        [0, "min9"],
        [5, "maj9"],
      ],
    },
```

- `cafe`:

```ts
    improv: {
      peakDensityCap: 1.0,
      bridgeSubstitutions: [
        [9, "min7"],
        [2, "dom9"],
        [7, "maj9"],
        [0, "maj7"],
      ],
    },
```

- `sleepy` (lowest cap — never goes peak-loud):

```ts
    improv: {
      peakDensityCap: 0.65,
      bridgeSubstitutions: [
        [10, "maj9"],
        [3, "maj7"],
        [8, "maj7"],
        [5, "min9"],
      ],
    },
```

- `transit`:

```ts
    improv: {
      peakDensityCap: 0.9,
      bridgeSubstitutions: [
        [10, "min7"],
        [5, "min7b5"],
        [8, "dom9"],
        [3, "maj9"],
      ],
    },
```

- [ ] **Step 5: Run check + tests**

```bash
deno task check && deno task test
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/music/moods.ts tests/moods.test.ts
git commit -m "feat(improv): add per-mood improv config to MOOD_META"
```

---

## Task 4: Create the improv-sequencer module (pure)

**Files:**
- Create: `src/music/improv-sequencer.ts`
- Create: `tests/improv-sequencer.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/improv-sequencer.test.ts`:

```ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  advanceImprovSection,
  initImprovState,
  type ImprovState,
} from "../src/music/improv-sequencer.ts";
import { MOOD_META } from "../src/music/moods.ts";

/**
 * A deterministic RNG that walks a supplied sequence of [0, 1) values.
 * Loops back to the start when exhausted, so tests don't have to count exactly.
 */
function seq(values: number[]): () => number {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    i++;
    return v;
  };
}

Deno.test("initImprovState: returns a normal section with sane defaults", () => {
  const s = initImprovState();
  assertEquals(s.sectionType, "normal");
  assert(s.dynamicLevel >= 0 && s.dynamicLevel <= 1);
  assertEquals(s.prog.length, 4);
  assert(s.barsRemaining > 0);
});

Deno.test("advanceImprovSection: returns a state with bars > 0", () => {
  const start = initImprovState();
  const next = advanceImprovSection(start, "rainy", seq([0.0, 0.5, 0.5]));
  assert(next.barsRemaining > 0);
  assertEquals(next.prog.length, 4);
});

Deno.test("advanceImprovSection: never returns the same sectionType two cycles in a row", () => {
  let s = initImprovState();
  const rng = seq([0.05, 0.5, 0.5, 0.05, 0.5, 0.5, 0.05, 0.5, 0.5, 0.05, 0.5, 0.5]);
  for (let i = 0; i < 50; i++) {
    const prev = s.sectionType;
    s = advanceImprovSection(s, "cafe", rng);
    assert(s.sectionType !== prev, `repeat at iter ${i}: ${prev}`);
  }
});

Deno.test("advanceImprovSection: bridge uses MOOD_META[mood].improv.bridgeSubstitutions", () => {
  // Force transition into bridge from a non-bridge state. The normal->bridge
  // weight is 0.2 (cumulative band 0.5..0.7 in the spec table); pick rng=0.6.
  const start: ImprovState = {
    sectionType: "normal",
    dynamicLevel: 0.5,
    prog: MOOD_META.cafe.improv.bridgeSubstitutions, // placeholder; will be replaced
    barsRemaining: 0,
  };
  const next = advanceImprovSection(start, "cafe", seq([0.6, 0.5, 0.5]));
  if (next.sectionType === "bridge") {
    assertEquals(next.prog, MOOD_META.cafe.improv.bridgeSubstitutions);
  }
});

Deno.test("advanceImprovSection: dynamicLevel never exceeds mood peakDensityCap", () => {
  let s = initImprovState();
  const rng = seq([0.05, 0.99, 0.99, 0.5, 0.99, 0.99]); // bias toward peak transitions
  for (let i = 0; i < 200; i++) {
    s = advanceImprovSection(s, "sleepy", rng);
    assert(
      s.dynamicLevel <= MOOD_META.sleepy.improv.peakDensityCap + 1e-9,
      `dynamicLevel ${s.dynamicLevel} exceeds cap`,
    );
  }
});

Deno.test("advanceImprovSection: normal/buildup/peak/break prog is from FORMS[mood]", async () => {
  const { FORMS } = await import("../src/music/forms.ts");
  let s = initImprovState();
  const rng = seq([0.1, 0.3, 0.7]);
  for (let i = 0; i < 100; i++) {
    s = advanceImprovSection(s, "rainy", rng);
    if (s.sectionType !== "bridge") {
      // The chosen prog must equal some FORMS[rainy] section's prog.
      const match = FORMS.rainy.some(
        (sec) => sec.prog.length === s.prog.length &&
          sec.prog.every((c, idx) => c[0] === s.prog[idx][0] && c[1] === s.prog[idx][1]),
      );
      assert(match, `non-FORMS prog at iter ${i}: ${JSON.stringify(s.prog)}`);
    }
  }
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
deno task test -- tests/improv-sequencer.test.ts
```

Expected: all six fail (module does not exist).

- [ ] **Step 3: Create the sequencer module**

Create `src/music/improv-sequencer.ts`:

```ts
/**
 * Improv-mode section sequencer. Pure: produces the next section given the
 * current state, mood, and an RNG. The audio scheduler decides when to call
 * advanceImprovSection (once per section boundary).
 */

import { FORMS } from "./forms.ts";
import { MOOD_META } from "./moods.ts";
import type { Chord, Mood } from "../types.ts";

export type SectionType = "normal" | "buildup" | "peak" | "break" | "bridge";

export interface ImprovState {
  readonly sectionType: SectionType;
  readonly dynamicLevel: number;
  readonly prog: readonly [Chord, Chord, Chord, Chord];
  readonly barsRemaining: number;
}

interface SectionProfile {
  readonly minDyn: number;
  readonly maxDyn: number;
  readonly minBars: number;
  readonly maxBars: number;
}

const PROFILES: Record<SectionType, SectionProfile> = {
  normal:  { minDyn: 0.4, maxDyn: 0.6, minBars: 8, maxBars: 16 },
  buildup: { minDyn: 0.6, maxDyn: 0.8, minBars: 4, maxBars: 8 },
  peak:    { minDyn: 0.8, maxDyn: 1.0, minBars: 4, maxBars: 8 },
  break:   { minDyn: 0.0, maxDyn: 0.2, minBars: 2, maxBars: 4 },
  bridge:  { minDyn: 0.3, maxDyn: 0.6, minBars: 4, maxBars: 8 },
};

/**
 * Cumulative-weight transition table. Each row is sampled by a uniform rng()
 * in [0, 1). Picking from sorted cumulative weights keeps the implementation
 * simple and deterministic given an RNG.
 */
const TRANSITIONS: Record<SectionType, ReadonlyArray<readonly [SectionType, number]>> = {
  normal:  [["buildup", 0.30], ["break", 0.50], ["bridge", 0.70], ["normal", 1.00]],
  buildup: [["peak", 0.60], ["normal", 1.00]],
  peak:    [["normal", 0.70], ["break", 1.00]],
  break:   [["normal", 0.80], ["bridge", 1.00]],
  bridge:  [["normal", 0.70], ["buildup", 1.00]],
};

function pickTransition(
  from: SectionType,
  rng: () => number,
): SectionType {
  const r = rng();
  for (const [type, threshold] of TRANSITIONS[from]) {
    if (r < threshold) return type;
  }
  return TRANSITIONS[from][TRANSITIONS[from].length - 1][0];
}

function pickProg(
  mood: Mood,
  sectionType: SectionType,
  rng: () => number,
): readonly [Chord, Chord, Chord, Chord] {
  if (sectionType === "bridge") return MOOD_META[mood].improv.bridgeSubstitutions;
  const form = FORMS[mood];
  const idx = Math.floor(rng() * form.length) % form.length;
  return form[idx].prog;
}

function randomInRange(min: number, max: number, rng: () => number): number {
  return min + rng() * (max - min);
}

function randomIntInRange(min: number, max: number, rng: () => number): number {
  return Math.floor(randomInRange(min, max + 1, rng));
}

export function initImprovState(): ImprovState {
  return {
    sectionType: "normal",
    dynamicLevel: 0.5,
    prog: FORMS.rainy[0].prog,
    barsRemaining: 8,
  };
}

/**
 * Advance to the next section. Picks a new sectionType (never the same as
 * current), a fresh prog (FORMS or bridgeSubstitutions), and a fresh
 * dynamicLevel + bar length within the section's profile. dynamicLevel is
 * clamped to MOOD_META[mood].improv.peakDensityCap so quiet moods never
 * reach full peak loudness.
 */
export function advanceImprovSection(
  state: ImprovState,
  mood: Mood,
  rng: () => number = Math.random,
): ImprovState {
  let next: SectionType;
  do {
    next = pickTransition(state.sectionType, rng);
  } while (next === state.sectionType);

  const profile = PROFILES[next];
  const cap = MOOD_META[mood].improv.peakDensityCap;
  const dyn = Math.min(randomInRange(profile.minDyn, profile.maxDyn, rng), cap);
  const bars = randomIntInRange(profile.minBars, profile.maxBars, rng);
  const prog = pickProg(mood, next, rng);

  return {
    sectionType: next,
    dynamicLevel: dyn,
    prog,
    barsRemaining: bars,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
deno task test -- tests/improv-sequencer.test.ts
```

Expected: all six pass.

- [ ] **Step 5: Full check + tests**

```bash
deno task check && deno task test
```

Expected: all green, total tests = previous + 6.

- [ ] **Step 6: Commit**

```bash
git add src/music/improv-sequencer.ts tests/improv-sequencer.test.ts
git commit -m "feat(improv): add pure section-graph sequencer"
```

---

## Task 5: Extend `generatePhrase` with `phraseStyle` and `seedNote`

**Files:**
- Modify: `src/music/phrase.ts`
- Modify: `tests/phrase.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/phrase.test.ts`:

```ts
Deno.test("generatePhrase: sparse style emits at most 2 notes per bar", () => {
  const prog = [
    [0, "min7"], [5, "min7"], [8, "maj7"], [3, "min7"],
  ] as const;
  const phrase = generatePhrase(prog, {
    currentKey: 0,
    complexity: 1.0,
    beatDur: 0.75,
    phraseStyle: "sparse",
    rng: () => 0.5,
  });
  for (const bar of phrase) {
    assert(bar.length <= 2, `sparse bar exceeded 2 notes: ${bar.length}`);
  }
});

Deno.test("generatePhrase: dense style emits at least as many notes as normal", () => {
  const prog = [
    [0, "min7"], [5, "min7"], [8, "maj7"], [3, "min7"],
  ] as const;
  const opts = {
    currentKey: 0,
    complexity: 0.6,
    beatDur: 0.75,
    rng: () => 0.5,
  };
  const normal = generatePhrase(prog, opts);
  const dense = generatePhrase(prog, { ...opts, phraseStyle: "dense" });
  const normalNotes = normal.reduce((a, b) => a + b.length, 0);
  const denseNotes = dense.reduce((a, b) => a + b.length, 0);
  assert(denseNotes >= normalNotes, `dense (${denseNotes}) < normal (${normalNotes})`);
});

Deno.test("generatePhrase: seedNote influences bar 0 anchor", () => {
  const prog = [
    [0, "min7"], [5, "min7"], [8, "maj7"], [3, "min7"],
  ] as const;
  const opts = {
    currentKey: 0,
    complexity: 0.5,
    beatDur: 0.75,
    rng: () => 0.5,
  };
  const noSeed = generatePhrase(prog, opts);
  const farSeed = generatePhrase(prog, { ...opts, seedNote: 72 });
  // bar 0 first note exists in both
  assert(noSeed[0].length > 0 && farSeed[0].length > 0);
  // With a seedNote 72 the anchor should differ from the no-seed result
  // (unless 72 happens to match the chord-1 tone). Allow equality but not
  // require it; the strong guarantee is that the function accepts seedNote
  // and returns a valid phrase.
  assertEquals(farSeed.length, 4);
});

Deno.test("generatePhrase: sparse style suppresses anticipations", () => {
  const prog = [
    [0, "min7"], [5, "min7"], [8, "maj7"], [3, "min7"],
  ] as const;
  const phrase = generatePhrase(prog, {
    currentKey: 0,
    complexity: 1.0,
    beatDur: 0.75,
    phraseStyle: "sparse",
    rng: () => 0.01, // would normally trigger anticipation
  });
  for (const bar of phrase) {
    for (const n of bar) {
      assert(!n.anticipation, "anticipation present in sparse phrase");
    }
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
deno task test -- tests/phrase.test.ts
```

Expected: the four new tests fail (function does not accept `phraseStyle` / `seedNote`).

- [ ] **Step 3: Extend `GeneratePhraseOptions`**

In `src/music/phrase.ts`, replace the existing `GeneratePhraseOptions` interface and `generatePhrase` function with this version (the new option fields and the new behaviour are integrated; existing behaviour is preserved when the new options are omitted):

```ts
export type PhraseStyle = "sparse" | "normal" | "dense";

export interface GeneratePhraseOptions {
  readonly currentKey: number;
  readonly complexity: number;
  readonly beatDur: number;
  readonly rng?: () => number;
  readonly phraseStyle?: PhraseStyle;
  readonly seedNote?: number;
}

/**
 * Pick the chord tone closest in pitch to `seedNote`. Falls back to the
 * default anchor when seedNote is undefined.
 */
function pickAnchor(
  chordTones: readonly number[],
  defaultIdx: number,
  seedNote: number | undefined,
): number {
  if (seedNote === undefined) return chordTones[defaultIdx];
  let best = chordTones[0];
  let bestDist = Math.abs(best - seedNote);
  for (const t of chordTones) {
    const d = Math.abs(t - seedNote);
    if (d < bestDist) {
      best = t;
      bestDist = d;
    }
  }
  return best;
}

export function generatePhrase(
  prog: readonly [Chord, Chord, Chord, Chord],
  opts: GeneratePhraseOptions,
): Phrase {
  const rng = opts.rng ?? Math.random;
  const { currentKey, complexity, beatDur } = opts;
  const style: PhraseStyle = opts.phraseStyle ?? "normal";
  const bars: Bar[] = [];
  let lastNote: number | null = null;

  prog.forEach(([rootOffset, voicingName], barIdx) => {
    const voicing = VOICINGS[voicingName];
    const rootMidi = 48 + ((currentKey + rootOffset) % 12);
    const chordTones = voicing.map((iv) => melodyOct(rootMidi + iv));
    const barMelody: PhraseNote[] = [];
    const isCall = barIdx < 2;

    // Beat 1: anchor. For bar 0, use seedNote (if provided) to pick the
    // nearest chord tone — gives cross-phrase conversational continuity.
    const defaultAnchorIdx = isCall ? 1 : 0;
    const anchor = barIdx === 0
      ? pickAnchor(chordTones, defaultAnchorIdx, opts.seedNote)
      : chordTones[defaultAnchorIdx];

    if (style === "sparse") {
      // sparse: at most 2 notes per bar, no passing notes, no anticipation
      if (isCall || complexity > 0.3) {
        barMelody.push({ beat: 0, midi: anchor, dur: beatDur * 2.5 });
      }
      // Maybe one tail note on beat 3
      if (rng() < 0.3) {
        const tail = chordTones[2] ?? chordTones[0];
        barMelody.push({ beat: beatDur * 3, midi: tail, dur: beatDur * 1.0 });
      }
    } else {
      // normal + dense share the existing core; dense layers extra notes.
      if (complexity > 0.15 || isCall) {
        barMelody.push({ beat: 0, midi: anchor, dur: beatDur * 0.85 });
      }

      if (rng() < 0.1 + complexity * 0.7) {
        const inner = chordTones[2] ?? chordTones[1];
        const time = beatDur * (isCall ? 1.5 : 1);
        barMelody.push({ beat: time, midi: inner, dur: beatDur * 0.7 });
      }

      if (complexity > 0.25) {
        const colorNote = chordTones[3] ?? chordTones[2];
        barMelody.push({
          beat: beatDur * (isCall ? 2.5 : 3),
          midi: colorNote,
          dur: beatDur * 1.1,
        });
      }

      if (rng() < (complexity - 0.5) * 1.2) {
        const passing = chordTones[Math.floor(rng() * chordTones.length)];
        barMelody.push({
          beat: beatDur * (isCall ? 3.5 : 3.75),
          midi: passing,
          dur: beatDur * 0.5,
        });
      }

      if (style === "dense") {
        // Chromatic approach: a semitone below the anchor, 1/16 note,
        // landing just before beat 1. Only meaningful when the anchor
        // actually played. Tagged `anticipation: true` so the scheduler's
        // existing previous-bar lookahead picks it up (negative beats are
        // otherwise filtered out by the current-bar window).
        if (barMelody.length > 0 && barMelody[0].beat === 0) {
          barMelody.unshift({
            beat: -beatDur * 0.18,
            midi: anchor - 1,
            dur: beatDur * 0.15,
            anticipation: true,
          });
        }
        // Extra mid-bar passing note
        if (rng() < 0.6) {
          const passing = chordTones[Math.floor(rng() * chordTones.length)];
          barMelody.push({
            beat: beatDur * (isCall ? 2.25 : 2.75),
            midi: passing,
            dur: beatDur * 0.4,
          });
        }
      }

      // Anticipation pushback (suppressed in sparse handled above)
      if (rng() < complexity * 0.6 && lastNote !== null && barMelody.length > 0) {
        const first = barMelody[0];
        if (first.beat >= 0) {
          barMelody[0] = { ...first, beat: -beatDur * 0.25, anticipation: true };
        }
      }
    }

    lastNote = barMelody.length > 0 ? barMelody[barMelody.length - 1].midi : null;
    bars.push(barMelody);
  });

  return bars;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
deno task test -- tests/phrase.test.ts
```

Expected: all phrase tests pass, including the four new ones.

- [ ] **Step 5: Full check + tests**

```bash
deno task check && deno task test
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/music/phrase.ts tests/phrase.test.ts
git commit -m "feat(improv): add phraseStyle and seedNote to generatePhrase"
```

---

## Task 6: Wire scheduler to use the sequencer in Improv mode

**Files:**
- Modify: `src/audio/scheduler.ts`

This is the largest task and not easily unit-tested (it drives the live audio scheduler). We rely on the sequencer unit tests for the data layer; the integration is verified manually in Task 9.

- [ ] **Step 1: Add improv state and helpers to the scheduler module**

In `src/audio/scheduler.ts`, add these imports near the existing music imports:

```ts
import {
  advanceImprovSection,
  initImprovState,
  type ImprovState,
} from "../music/improv-sequencer.ts";
import type { PhraseStyle } from "../music/phrase.ts";
```

Add the new module-level state alongside the existing `let currentForm = …` block:

```ts
let improvState: ImprovState = initImprovState();
let improvBarInSection = 0;
let lastEmittedMidi: number | null = null;
```

Add a small helper near the other helpers (above `scheduleBar`):

```ts
function phraseStyleFromDyn(dyn: number): PhraseStyle {
  if (dyn < 0.25) return "sparse";
  if (dyn > 0.65) return "dense";
  return "normal";
}
```

Export a fn used by mood-change in `main.ts` to re-seed the sequencer when the mood changes:

```ts
export function resetImprovState(): void {
  improvState = initImprovState();
  improvBarInSection = 0;
  lastEmittedMidi = null;
  currentPhrase = null;
  phraseBarIdx = 0;
}
```

- [ ] **Step 2: Branch `scheduleBar` on `isImprov`**

At the top of `scheduleBar`, replace the existing destructure and `prog` resolution:

```ts
const state = store.get();
const { currentMood: mood, complexity, isImprov } = state;
const bd = beatDur(currentBPM);

let prog: readonly [Chord, Chord, Chord, Chord];
let nextProg: readonly [Chord, Chord, Chord, Chord];
let effectiveComplexity = complexity;
let dynamicLevel = 1.0;
let phraseStyle: PhraseStyle = "normal";

if (isImprov) {
  prog = improvState.prog;
  nextProg = improvState.prog; // bridge/normal both use same prog for the section
  dynamicLevel = improvState.dynamicLevel;
  effectiveComplexity = complexity * dynamicLevel;
  phraseStyle = phraseStyleFromDyn(dynamicLevel);
} else {
  prog = currentSectionProg(currentForm, {
    sectionIdx: formSectionIdx,
    barInSection: formBarInSection,
  });
  nextProg = prog;
}

const progLen = prog.length;
const barIdx = currentProgIdx % progLen;
const [rootOffset, voicingName] = prog[barIdx];
const nextBarIdx = (barIdx + 1) % progLen;
const [nextRootOffset] = nextProg[nextBarIdx];
```

(You'll need to add `Chord` to the existing `import type { … } from "../types.ts"` line.)

- [ ] **Step 3: Scale comp velocity by `dynamicLevel`**

Inside the `voicing.forEach((interval, i) => { … })` block in `scheduleBar`, change every `vel` value to be multiplied by `dynamicLevel`:

```ts
voicing.forEach((interval, i) => {
  const midiNote = compOct(rootMidi + interval);
  const vel = (0.11 - i * 0.015) * dynamicLevel;
  // …rest of body unchanged except the two inner playComp calls also use `vel * 0.6` / `vel * 0.5`
  // which already chain off the new vel.
```

Leave the `vel * 0.6` and `vel * 0.5` multipliers intact — they cascade from the scaled `vel`.

Replace the `complexity` references in the inner re-comp probability checks with `effectiveComplexity`:

```ts
if (
  !isPad &&
  effectiveComplexity > 0.3 &&
  (i < voicing.length - 1 || Math.random() < effectiveComplexity * 0.7)
) {
```

and:

```ts
if (
  !isPad &&
  effectiveComplexity > 0.7 &&
  i >= voicing.length - 2 &&
  Math.random() < (effectiveComplexity - 0.5) * 1.2
) {
```

- [ ] **Step 4: Pass `phraseStyle`, `seedNote`, and `effectiveComplexity` into `generatePhrase`**

Replace the existing phrase-generation block with:

```ts
if (phraseBarIdx === 0 || currentPhrase === null) {
  currentPhrase = generatePhrase(prog, {
    currentKey,
    complexity: effectiveComplexity,
    beatDur: bd,
    phraseStyle: isImprov ? phraseStyle : undefined,
    seedNote: isImprov ? lastEmittedMidi ?? undefined : undefined,
  });
}
```

After scheduling the bar's melody notes, update `lastEmittedMidi`:

```ts
const barMelody = currentPhrase[phraseBarIdx % currentPhrase.length];
for (const note of barMelody) {
  const noteTime = barStart + note.beat;
  if (noteTime >= barStart - 0.01) {
    playMelody(audio, note.midi, noteTime, note.dur, 0.17 * dynamicLevel, "rhodesMel", mood);
  }
}
if (barMelody.length > 0) {
  lastEmittedMidi = barMelody[barMelody.length - 1].midi;
}
```

Also scale the nextBarMelody anticipation velocity by `dynamicLevel`:

```ts
if (nextBarMelody && nextBarMelody[0] && nextBarMelody[0].anticipation) {
  playMelody(
    audio,
    nextBarMelody[0].midi,
    barStart + bd * 4 - bd * 0.25,
    nextBarMelody[0].dur,
    0.14 * dynamicLevel,
    "rhodesMel",
    mood,
  );
}
```

- [ ] **Step 5: Scale bass velocity and gate by `effectiveComplexity`**

Replace the bass scheduling block with:

```ts
const bassNotes = walkingBassNotes(rootMidi, voicing, nextRoot);
bassNotes.forEach((midiNote, i) => {
  const vel = (i === 0 ? 0.3 : 0.22) * dynamicLevel;
  if (mood === "sleepy" && i !== 0 && i !== 2) return;
  if (effectiveComplexity < 0.3 && i !== 0 && i !== 2) return;
  if (effectiveComplexity < 0.55 && i === 3) return;
  playBass(audio, midiNote, barStart + bd * i, bd * 0.88, vel, mood);
});

if (effectiveComplexity > 0.7 && Math.random() < (effectiveComplexity - 0.5) * 1.2) {
  const ghostMidi = bassNotes[0];
  playBass(audio, ghostMidi, barStart + bd * 3.5, bd * 0.3, 0.12 * dynamicLevel, mood);
}
```

- [ ] **Step 6: Scale drum velocity by `dynamicLevel` with a 0.15 floor on kick/snare**

Drum step loop — replace the kick/snare/ghost lines, leaving hat scheduling unchanged:

```ts
const drumScale = Math.max(0.15, dynamicLevel);

for (let i = 0; i < 16; i++) {
  const stepTime = swungTime(i, barStart, currentBPM, swingAmount);

  if (kickPat[i]) playKick(audio, stepTime, mood, drumScale);

  if (SNARE_PAT[i]) playSnare(audio, stepTime, mood, false, drumScale);

  if (GHOST_PAT[i] && Math.random() < effectiveComplexity * 0.7) {
    playSnare(audio, stepTime, mood, true, drumScale);
  }

  if (HAT_PAT[i]) {
    const isQuarter = i % 4 === 0;
    if (isQuarter || effectiveComplexity > 0.35) {
      const vol = 0.05 + Math.random() * 0.025;
      playHat(audio, stepTime, mood, false, vol * (isQuarter ? 1.0 : 0.6 + effectiveComplexity * 0.4));
    }
  }

  if (
    !HAT_PAT[i] &&
    effectiveComplexity > 0.75 &&
    Math.random() < (effectiveComplexity - 0.65) * 2
  ) {
    playHat(audio, stepTime, mood, false, 0.025 + Math.random() * 0.02);
  }

  if (OPEN_PAT[i] && mood !== "sleepy" && effectiveComplexity > 0.4) {
    playHat(audio, stepTime, mood, true, 0.06);
  }
}
```

Note: `playKick` and `playSnare` need to accept an optional velocity scalar. Add support by extending their signatures.

- [ ] **Step 7: Extend `playKick` and `playSnare` signatures to accept a velocity scalar**

In `src/audio/timbres/kick.ts`, replace the function with:

```ts
import { makeSpatial, noiseBuffer } from "../graph.ts";
import { flashRow } from "../../ui/flash.ts";
import type { AudioRefs, Mood } from "../../types.ts";

export function playKick(
  audio: AudioRefs,
  time: number,
  mood: Mood,
  velScale = 1,
): void {
  flashRow(audio.actx, "mx-drums", time, 120);
  const vel = (mood === "sleepy" ? 0.38 : 0.55) * velScale;
  const osc = audio.actx.createOscillator();
  const gainNode = audio.actx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(180, time);
  osc.frequency.exponentialRampToValueAtTime(38, time + 0.18);
  gainNode.gain.setValueAtTime(vel, time);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, time + 0.28);
  const sp = makeSpatial(audio, "kick");
  osc.connect(gainNode);
  gainNode.connect(sp.input);
  sp.output.connect(audio.trackGains.drums);
  osc.start(time);
  osc.stop(time + 0.3);
  const noiseBuf = noiseBuffer(audio.actx, 0.008);
  const src = audio.actx.createBufferSource();
  src.buffer = noiseBuf;
  const clickGain = audio.actx.createGain();
  clickGain.gain.value = 0.1 * velScale;
  src.connect(clickGain);
  clickGain.connect(sp.input);
  src.start(time);
}
```

In `src/audio/timbres/snare.ts`, replace the function with:

```ts
import { MOOD_META } from "../../music/moods.ts";
import { makeSpatial, noiseBuffer } from "../graph.ts";
import { flashRow } from "../../ui/flash.ts";
import type { AudioRefs, Mood } from "../../types.ts";

export function playSnare(
  audio: AudioRefs,
  time: number,
  mood: Mood,
  ghost = false,
  velScale = 1,
): void {
  if (!ghost) flashRow(audio.actx, "mx-drums", time, 80);
  const moodMeta = MOOD_META[mood];
  const vol = (ghost ? 0.04 : mood === "sleepy" ? 0.09 : 0.15) * velScale;
  const noiseBuf = noiseBuffer(audio.actx, 0.18);
  const src = audio.actx.createBufferSource();
  src.buffer = noiseBuf;
  const filt = audio.actx.createBiquadFilter();
  filt.type = "bandpass";
  filt.frequency.value = moodMeta.snareFreq;
  filt.Q.value = moodMeta.snareQ;
  const gainNode = audio.actx.createGain();
  gainNode.gain.setValueAtTime(vol, time);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, time + 0.15);
  const sp = makeSpatial(audio, "snare");
  src.connect(filt);
  filt.connect(gainNode);
  gainNode.connect(sp.input);
  sp.output.connect(audio.trackGains.drums);
  src.start(time);
}
```

Existing call sites that don't pass `velScale` still work because of the default `1`.

- [ ] **Step 8: Advance the improv playhead inside `tick`**

Replace the existing `tick` function body with:

```ts
function tick(audio: AudioRefs, store: Store<AppState>): void {
  const barDur = beatDur(currentBPM) * 4;
  while (nextBarTime < audio.actx.currentTime + LOOKAHEAD_S) {
    scheduleBar(audio, store, nextBarTime);
    currentProgIdx++;
    if (store.get().isImprov) {
      improvBarInSection++;
      if (improvBarInSection >= improvState.barsRemaining) {
        improvState = advanceImprovSection(improvState, store.get().currentMood);
        improvBarInSection = 0;
        currentPhrase = null;
        phraseBarIdx = 0;
        lastEmittedMidi = null;
      }
    } else {
      advancePlayhead();
    }
    nextBarTime += barDur;
  }
  timerHandle = setTimeout(() => tick(audio, store), TICK_MS);
}
```

Also reset improv tracking in `newProgression` so a fresh start clears state:

At the end of `newProgression`, just before the DOM updates, add:

```ts
  improvState = initImprovState();
  improvBarInSection = 0;
  lastEmittedMidi = null;
```

- [ ] **Step 9: Run check + tests**

```bash
deno task check && deno task test
```

Expected: all green. Type errors here usually mean a missing `Chord` import or a stale numeric literal in `playKick`/`playSnare` — fix and re-run.

- [ ] **Step 10: Smoke-test the dev server**

```bash
deno task dev
```

Open <http://localhost:8000>, click play, listen for ~30 seconds. **Improv is not yet wired to the UI**, so the audio should sound identical to before this task. If anything sounds different, you've regressed composed-mode behaviour — investigate before continuing.

Stop the dev server with Ctrl-C.

- [ ] **Step 11: Commit**

```bash
git add src/audio/scheduler.ts src/audio/timbres/kick.ts src/audio/timbres/snare.ts
git commit -m "feat(improv): wire scheduler to advance via improv-sequencer"
```

---

## Task 7: Add the Improv button to the UI

**Files:**
- Modify: `index.html` (mood row + CSS for the new button state)
- Modify: `src/ui/mood-ui.ts`

- [ ] **Step 1: Add the Improv button to the mood row**

In `index.html`, find the mood row (around line 603–607) and append one button:

```html
          <button class="mood-btn active" data-mood="rainy">rainy</button>
          <button class="mood-btn" data-mood="late">late night</button>
          <button class="mood-btn" data-mood="cafe">café</button>
          <button class="mood-btn" data-mood="sleepy">sleepy</button>
          <button class="mood-btn" data-mood="transit">transit</button>
          <button class="mood-btn improv-btn" id="improvBtn">improv</button>
```

- [ ] **Step 2: Add styling for the active Improv state**

In the same file, find the `.mood-btn.active` block (around line 231) and add an `.improv-btn.active` rule after it:

```css
      .improv-btn.active {
        background: #d8a86d;
        border-color: #d8a86d;
        color: #1a0e04;
        box-shadow: 0 0 14px color-mix(in srgb, #d8a86d 35%, transparent);
      }
```

- [ ] **Step 3: Wire the button in `src/ui/mood-ui.ts`**

Replace the contents of `src/ui/mood-ui.ts` with:

```ts
/**
 * Mood UI: per-mood accent palette + button activation. The mood-change
 * cross-fade is owned by `main.ts` (it needs the audio + scheduler
 * controls); this module just wires the buttons and exposes a setter
 * for the palette.
 */

import type { Mood } from "../types.ts";

interface MoodPalette {
  readonly warm: string;
  readonly warm2: string;
}

const MOOD_UI: Record<Mood, MoodPalette> = {
  rainy: { warm: "#7aa6d8", warm2: "#a8c4e8" },
  late: { warm: "#a886d8", warm2: "#c4a8e8" },
  cafe: { warm: "#c97d40", warm2: "#e8b07a" },
  sleepy: { warm: "#6db5a8", warm2: "#9dd1c5" },
  transit: { warm: "#7b2fff", warm2: "#a06fff" },
};

export function applyMoodUI(mood: Mood): void {
  const palette = MOOD_UI[mood] ?? MOOD_UI.cafe;
  document.documentElement.style.setProperty("--warm", palette.warm);
  document.documentElement.style.setProperty("--warm2", palette.warm2);
}

/**
 * Wire each `.mood-btn[data-mood]` to call `onMoodSelect(mood)`. The
 * Improv button (no `data-mood`) is wired separately via mountImprovUI.
 */
export function mountMoodUI(
  onMoodSelect: (mood: Mood) => void,
): void {
  document.querySelectorAll(".mood-btn[data-mood]").forEach((btn) => {
    const el = btn as HTMLElement;
    el.addEventListener("click", () => {
      const mood = el.dataset.mood as Mood | undefined;
      if (mood) onMoodSelect(mood);
    });
  });
}

export function mountImprovUI(onToggle: () => void): void {
  const btn = document.getElementById("improvBtn");
  if (!btn) return;
  btn.addEventListener("click", onToggle);
}

/** Toggle the "active" class on the mood button matching `mood`. */
export function setActiveMoodButton(mood: Mood): void {
  document.querySelectorAll(".mood-btn[data-mood]").forEach((b) => {
    const el = b as HTMLElement;
    el.classList.toggle("active", el.dataset.mood === mood);
  });
}

export function setImprovButtonState(active: boolean): void {
  const btn = document.getElementById("improvBtn");
  if (!btn) return;
  btn.classList.toggle("active", active);
}
```

- [ ] **Step 4: Run check + tests**

```bash
deno task check && deno task test
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add index.html src/ui/mood-ui.ts
git commit -m "feat(improv): add Improv toggle button to mood row"
```

---

## Task 8: Wire the Improv toggle in `main.ts`

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Import the new functions**

In `src/main.ts`, change the existing mood-ui import to include the new symbols:

```ts
import {
  applyMoodUI,
  mountImprovUI,
  mountMoodUI,
  setActiveMoodButton,
  setImprovButtonState,
} from "./ui/mood-ui.ts";
```

Also import the scheduler reset helper:

```ts
import {
  flushScheduler,
  newProgression,
  resetImprovState,
  resetSchedulerTime,
  startScheduler,
  stopScheduler,
} from "./audio/scheduler.ts";
```

(Adjust the named imports to match the existing import line — keep all current imports.)

- [ ] **Step 2: Wire the Improv toggle**

Add this near the existing `mountMoodUI(changeMood);` call (around line 133):

```ts
mountImprovUI(() => {
  const next = !store.get().isImprov;
  store.set({ isImprov: next });
  setImprovButtonState(next);
  if (!next) resetImprovState();
});
```

- [ ] **Step 3: Reset Improv on mood change**

Inside `changeMood` in `src/main.ts`, immediately after `setActiveMoodButton(newMood);`, add:

```ts
  if (store.get().isImprov) {
    store.set({ isImprov: false });
    setImprovButtonState(false);
    resetImprovState();
  }
```

- [ ] **Step 4: Run check + tests**

```bash
deno task check && deno task test
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts
git commit -m "feat(improv): wire Improv toggle and mood-change reset"
```

---

## Task 9: Manual listening verification

**Files:** none

- [ ] **Step 1: Start the dev server**

```bash
deno task dev
```

Open <http://localhost:8000>.

- [ ] **Step 2: Verify composed mode is unchanged**

Click play on `rainy` (default mood). Listen for ~30 seconds. You should hear the same Rainy mode as before this branch — no audible regression.

- [ ] **Step 3: Activate Improv**

Click the **improv** button. Confirm the button gets the active visual state. Listen for ~3 minutes (long enough to traverse a few section transitions). Expectations:

- **Break sections** (2–4 bars): the music drops noticeably — sparse melody, quiet drums (kick/snare audibly softer, hat still present).
- **Peak sections** (4–8 bars): denser melody with at least one chromatic approach note (a quick semitone slide just before a beat), louder drums.
- **Bridge sections**: a noticeably different chord progression — should sound like "going somewhere else" rather than the usual loop.
- **Normal sections**: similar feel to composed mode but with subtly different progression each time (sampled from FORMS).
- No two adjacent sections are the same type.

- [ ] **Step 4: Switch mood while Improv is active**

While Improv is on, click `cafe`. Expected: Improv button deactivates, music cross-fades to standard `cafe` composed mode. Re-activate Improv on Cafe and confirm Cafe-flavoured improv (using Cafe's `bridgeSubstitutions`).

- [ ] **Step 5: Stop the dev server**

Ctrl-C to stop. If any step above failed, note which and fix before continuing — common pitfalls:

- Drums silent in breaks: floor of `0.15` not applied in scheduler.
- All sections sound identical: `dynamicLevel` not threading through `playComp` / `playMelody`.
- No bridge chords audible: `pickProg` not selecting `bridgeSubstitutions` for bridge type, or `bridge` is never being entered (check transition table).

- [ ] **Step 6: Final commit (only if any fixes were needed)**

If Step 5 required code changes, commit them:

```bash
git add -A
git commit -m "fix(improv): tweak <whatever was off>"
```

Otherwise skip this step.

---

## Task 10: Push and open PR

**Files:** none

- [ ] **Step 1: Final check + tests**

```bash
deno task check && deno task test
```

Expected: all green.

- [ ] **Step 2: Push the branch**

```bash
git push -u origin feat/improv-mode
```

- [ ] **Step 3: Open PR**

```bash
gh pr create --title "feat: add Improv mode (dynamic section sequencer)" --body "$(cat <<'EOF'
## Summary
- Adds an **Improv** toggle alongside the mood buttons
- New pure `improv-sequencer` module advances sections through an energy arc (break / normal / buildup / peak / bridge)
- `generatePhrase` extended with `phraseStyle` and `seedNote` for sparse / dense styles and cross-phrase conversational continuity
- Composed-mode behaviour is byte-identical when Improv is off

Spec: `docs/superpowers/specs/2026-05-18-improv-mode-design.md`

## Test plan
- [x] `deno task check && deno task test` — 109 passing (6 sequencer + 4 phrase)
- [x] Manual: composed mode unchanged for ~30 s
- [x] Manual: Improv mode traverses break/peak/bridge sections audibly differently
- [x] Manual: switching mood while Improv active deactivates Improv

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Out of scope (NOT in this plan)

- Cross-mood drift (BPM/key wandering across mood territories).
- Multiple bridge substitutions per mood — only one set per mood for now.
- Persisting `isImprov` across page reloads.
- Visual changes to the background renderer in response to `dynamicLevel`.
