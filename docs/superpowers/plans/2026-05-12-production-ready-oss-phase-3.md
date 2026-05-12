# Phase 3 — Extract Pure Music Logic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the genuinely-pure music-logic helpers (`walkingBassNotes`, `melodyOct`, form-playhead state transitions) from `index.html` into TypeScript modules under `src/music/`, with deterministic tests that pin their behaviour.

**Architecture:** Pure additions only, matching Phase 2's pattern. The new modules mirror functions currently inline in `index.html`; the inline script is unchanged. Tests verify the modules are correct in isolation. Phase 4 will be the dedicated integration phase that converts the inline script to a module and replaces the inline copies with imports.

**Tech Stack:** Deno 2.x, TypeScript (strict). No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-05-12-production-ready-oss-design.md`

**Risk:** low. No `index.html` changes; helpers are extracted into modules that don't yet affect the running app.

**Scope deviation from spec (deliberate):** the spec mentioned wiring the inline script to call extracted functions via a `window`-bridge during Phase 3. When inspected, the cleanest way to wire it requires converting the inline `<script>` to `<script type="module">` — which is a meaningful semantic change (strict mode, top-level scope isolation, `this` differences). To keep each PR reviewable and reversible, that integration is split out into a focused Phase 4. Phase 3 is logic extraction only.

**Scope deviation from spec (deliberate):** `generatePhrase` is in scope per the spec but is excluded from this plan. It reads from module-scope mutable state (`currentKey`, `complexity`), writes to module-scope state (`currentPhrase`, `phraseBarIdx`), and uses `Math.random` non-deterministically. Extracting it well requires inverting those dependencies (taking them as arguments) which is more refactor than fits comfortably here. It moves to a future phase alongside its scheduler caller.

**At every commit on this branch, the app still works** by opening `index.html` directly — Phase 3 doesn't touch the app's runtime path.

---

## Pre-flight

### Task 1: Create the Phase 3 feature branch

- [ ] **Step 1: Branch from main**

```bash
git checkout main
git pull origin main
git checkout -b feat/phase-3-music-logic
```

Expected: branch created, working tree clean.

---

## Octave clamping

### Task 2: TDD `melodyOct` and `bassOct`

**Files:**
- Create: `tests/octaves.test.ts`
- Create: `src/music/octaves.ts`

These two functions exist in `index.html` as a top-level `melodyOct` (line 2299) and as a closure `bassOct` inside `walkingBassNotes`. Both clamp a MIDI note number into a target octave range by adding/subtracting 12 until it's inside.

- [ ] **Step 1: Write the failing test**

Create `/Users/petethorne/Documents/Projects/lofi-stream/tests/octaves.test.ts` with EXACT content:

```typescript
import { assertEquals } from "jsr:@std/assert@^1";
import { bassOct, melodyOct } from "../src/music/octaves.ts";

Deno.test("melodyOct: in-range MIDI is unchanged", () => {
  assertEquals(melodyOct(60), 60);
  assertEquals(melodyOct(72), 72);
  assertEquals(melodyOct(79), 79);
});

Deno.test("melodyOct: too-low MIDI is shifted up an octave", () => {
  assertEquals(melodyOct(48), 60);
  assertEquals(melodyOct(36), 60);
  assertEquals(melodyOct(59), 71);
});

Deno.test("melodyOct: too-high MIDI is shifted down an octave", () => {
  assertEquals(melodyOct(80), 68);
  assertEquals(melodyOct(91), 79);
  assertEquals(melodyOct(96), 72);
});

Deno.test("melodyOct: result is always in [60, 79]", () => {
  for (let m = 0; m < 128; m++) {
    const out = melodyOct(m);
    assertEquals(out >= 60 && out <= 79, true, `melodyOct(${m}) = ${out}, out of [60, 79]`);
  }
});

Deno.test("bassOct: in-range MIDI is unchanged", () => {
  assertEquals(bassOct(36), 36);
  assertEquals(bassOct(40), 40);
  assertEquals(bassOct(47), 47);
});

Deno.test("bassOct: too-low MIDI is shifted up an octave", () => {
  assertEquals(bassOct(24), 36);
  assertEquals(bassOct(35), 47);
  assertEquals(bassOct(0), 36);
});

Deno.test("bassOct: too-high MIDI is shifted down an octave (loops until in range)", () => {
  assertEquals(bassOct(48), 36); // 48 -> 36
  assertEquals(bassOct(60), 36); // 60 -> 48 -> 36 (loops twice)
  assertEquals(bassOct(59), 47); // 59 -> 47 (B1 below register? no, 47 is in range)
});

Deno.test("bassOct: result is always in [36, 47]", () => {
  for (let m = 0; m < 128; m++) {
    const out = bassOct(m);
    assertEquals(out >= 36 && out <= 47, true, `bassOct(${m}) = ${out}, out of [36, 47]`);
  }
});

Deno.test("bassOct: preserves pitch class (modulo 12)", () => {
  // C2 (24), C3 (36), C4 (48) should all clamp to C in the bass register
  assertEquals(bassOct(24) % 12, 0);
  assertEquals(bassOct(36) % 12, 0);
  assertEquals(bassOct(48) % 12, 0);
});

Deno.test("melodyOct: preserves pitch class (modulo 12)", () => {
  assertEquals(melodyOct(36) % 12, 0); // C
  assertEquals(melodyOct(48) % 12, 0);
  assertEquals(melodyOct(60) % 12, 0);
  assertEquals(melodyOct(72) % 12, 0);
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
export PATH="$HOME/.deno/bin:$PATH"
deno test tests/octaves.test.ts
```

Expected: FAIL with `Cannot find module ../src/music/octaves.ts`.

- [ ] **Step 3: Implement the module**

Create `/Users/petethorne/Documents/Projects/lofi-stream/src/music/octaves.ts` with EXACT content:

```typescript
/**
 * Clamp a MIDI note number into the melody register [60, 79] (octaves 4–5)
 * by adding or subtracting 12 until it fits. Preserves pitch class.
 *
 * Mirrors the `melodyOct` function inline in `index.html`.
 */
export function melodyOct(midi: number): number {
  let n = midi;
  while (n > 79) n -= 12;
  while (n < 60) n += 12;
  return n;
}

/**
 * Clamp a MIDI note number into the bass register [36, 47] (octave 2)
 * by adding or subtracting 12 until it fits. Preserves pitch class.
 *
 * Mirrors the `bassOct` closure inside `walkingBassNotes` in `index.html`.
 */
export function bassOct(midi: number): number {
  let n = midi;
  while (n > 47) n -= 12;
  while (n < 36) n += 12;
  return n;
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
deno test tests/octaves.test.ts
```

Expected: all 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/music/octaves.ts tests/octaves.test.ts
git commit -m "feat(music): extract melodyOct and bassOct to src/music/octaves.ts

10 tests cover: in-range identity, too-low shifts up, too-high shifts
down, exhaustive [0, 128) input range, pitch class preservation.

melodyOct mirrors the top-level function in index.html. bassOct mirrors
the closure inside walkingBassNotes."
```

---

## Walking bass

### Task 3: TDD `walkingBassNotes`

**Files:**
- Create: `tests/bass.test.ts`
- Create: `src/music/bass.ts`

The walking-bass pattern is 4 notes per bar: root, beat2 (3rd or 5th), beat3 (5th or 7th), beat4 (chromatic approach to next root).

- [ ] **Step 1: Write the failing test**

Create `/Users/petethorne/Documents/Projects/lofi-stream/tests/bass.test.ts` with EXACT content:

```typescript
import { assertEquals } from "jsr:@std/assert@^1";
import { walkingBassNotes } from "../src/music/bass.ts";
import { VOICINGS } from "../src/music/voicings.ts";

Deno.test("walkingBassNotes: returns 4 notes", () => {
  const notes = walkingBassNotes(36, VOICINGS.min7, 41);
  assertEquals(notes.length, 4);
});

Deno.test("walkingBassNotes: all notes are in the bass register [36, 47]", () => {
  // Try a variety of (root, voicing, nextRoot) combos
  const cases: Array<[number, readonly number[], number]> = [
    [36, VOICINGS.min7, 41],
    [60, VOICINGS.maj7, 65], // out-of-range root
    [45, VOICINGS.dom9, 38],
    [36, VOICINGS.min9, 39],
  ];
  for (const [root, voicing, next] of cases) {
    const notes = walkingBassNotes(root, voicing, next);
    for (const [i, n] of notes.entries()) {
      assertEquals(
        n >= 36 && n <= 47,
        true,
        `walkingBassNotes(${root}, ..., ${next})[${i}] = ${n} out of [36, 47]`,
      );
    }
  }
});

Deno.test("walkingBassNotes: beat 1 is the root in the bass register", () => {
  // root 36 (C2) — already in range, beat 1 = 36
  assertEquals(walkingBassNotes(36, VOICINGS.min7, 41)[0], 36);
  // root 60 (C4) — clamps down to 36 (C2)
  assertEquals(walkingBassNotes(60, VOICINGS.maj7, 41)[0], 36);
});

Deno.test("walkingBassNotes: beat 2 is the 3rd of the chord (for 4-note voicings)", () => {
  // min7 = [0, 3, 7, 10] -> voicing[1] = 3 (minor 3rd)
  // root 36, so beat 2 = bassOct(36 + 3) = 39
  assertEquals(walkingBassNotes(36, VOICINGS.min7, 41)[1], 39);
});

Deno.test("walkingBassNotes: beat 3 is the 5th of the chord (for 4-note voicings)", () => {
  // min7 = [0, 3, 7, 10] -> voicing[2] = 7 (perfect 5th)
  // root 36, so beat 3 = bassOct(36 + 7) = 43
  assertEquals(walkingBassNotes(36, VOICINGS.min7, 41)[2], 43);
});

Deno.test("walkingBassNotes: beat 4 is a chromatic approach to nextRoot", () => {
  // root 36 (C), min7, next 41 (F)
  // beat3 = 43 (G); nextRoot bassOct(41) = 41 (F); diff = 41 - 43 = -2 (negative)
  // approach = nextRoot + 1 = 42 (Gb/F#) when diff <= 0
  assertEquals(walkingBassNotes(36, VOICINGS.min7, 41)[3], 42);
});

Deno.test("walkingBassNotes: beat 4 approaches from below when next root is above", () => {
  // root 36 (C), min7, next 43 (G higher than beat3=43; need a case where nextRoot > beat3)
  // root 36, min7 voicing => beat3 = bassOct(36+7) = 43
  // pick nextRoot higher than 43, e.g. 45 (A2)
  // diff = 45 - 43 = 2 (positive)
  // approach = nextRoot - 1 = 44 (G#2)
  assertEquals(walkingBassNotes(36, VOICINGS.min7, 45)[3], 44);
});

Deno.test("walkingBassNotes: works with 5-note voicings (uses first 3 intervals)", () => {
  // min9 = [0, 3, 7, 10, 14]
  // beats: root, 3rd (voicing[1]=3), 5th (voicing[2]=7), approach
  assertEquals(walkingBassNotes(36, VOICINGS.min9, 41)[1], 39);
  assertEquals(walkingBassNotes(36, VOICINGS.min9, 41)[2], 43);
});

Deno.test("walkingBassNotes: deterministic — same inputs always produce same output", () => {
  const a = walkingBassNotes(36, VOICINGS.dom7, 41);
  const b = walkingBassNotes(36, VOICINGS.dom7, 41);
  assertEquals(a, b);
});
```

- [ ] **Step 2: Run, verify fail**

```bash
deno test tests/bass.test.ts
```

Expected: FAIL with `Cannot find module ../src/music/bass.ts`.

- [ ] **Step 3: Implement**

Create `/Users/petethorne/Documents/Projects/lofi-stream/src/music/bass.ts` with EXACT content:

```typescript
import { bassOct } from "./octaves.ts";

/**
 * Generate the 4-note walking-bass line for a single bar.
 *
 * Pattern:
 *   - beat 1: root in bass register
 *   - beat 2: third (voicing[1]) clamped to bass register
 *   - beat 3: fifth (voicing[2]) clamped to bass register
 *   - beat 4: chromatic approach (semitone above or below) to the next bar's root
 *
 * Mirrors `walkingBassNotes` in `index.html` (line 2268 at time of writing).
 */
export function walkingBassNotes(
  rootMidi: number,
  voicing: readonly number[],
  nextRootMidi: number,
): readonly number[] {
  const root = bassOct(rootMidi);
  const chordTones = voicing.map((iv) => bassOct(rootMidi + iv));
  const beat2 = chordTones[1] ?? chordTones[0];
  const beat3 = chordTones[2] ?? chordTones[1];
  const nextRoot = bassOct(nextRootMidi);
  const diff = nextRoot - beat3;
  const approach = diff > 0 ? nextRoot - 1 : nextRoot + 1;
  return [root, beat2, beat3, approach];
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
deno test tests/bass.test.ts
```

Expected: all 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/music/bass.ts tests/bass.test.ts
git commit -m "feat(music): extract walkingBassNotes to src/music/bass.ts

9 tests cover: returns 4 notes, all in bass register, beat-by-beat
content (root/3rd/5th/chromatic approach), 5-note voicing support, and
determinism. Reuses bassOct from src/music/octaves.ts.

Mirrors walkingBassNotes in index.html exactly."
```

---

## Form playhead

### Task 4: TDD form playhead — `nextFormPosition` and `currentSectionProg`

**Files:**
- Create: `tests/playhead.test.ts`
- Create: `src/music/playhead.ts`

The current `advanceFormPlayhead()` mutates module-scope variables; we extract a pure version `nextFormPosition(form, position)` that takes the state explicitly and returns the next state plus a `sectionChanged` flag. The flag tells callers when to clear their phrase cache (currently a side effect of `advanceFormPlayhead`).

We also extract `currentSectionProg(form, position)` — given a form and a position, returns the active 4-chord prog (or a sensible fallback if the form is empty).

- [ ] **Step 1: Write the failing test**

Create `/Users/petethorne/Documents/Projects/lofi-stream/tests/playhead.test.ts` with EXACT content:

```typescript
import { assertEquals } from "jsr:@std/assert@^1";
import { currentSectionProg, DEFAULT_PROG, nextFormPosition } from "../src/music/playhead.ts";
import { FORMS } from "../src/music/forms.ts";

Deno.test("nextFormPosition: advances barInSection within a section", () => {
  // FORMS.rainy section 0 has bars=8
  const next = nextFormPosition(FORMS.rainy, { sectionIdx: 0, barInSection: 0 });
  assertEquals(next.position.sectionIdx, 0);
  assertEquals(next.position.barInSection, 1);
  assertEquals(next.sectionChanged, false);
});

Deno.test("nextFormPosition: rolls over to next section when bars are exhausted", () => {
  // FORMS.rainy section 0 has bars=8 (indices 0..7); barInSection=7 means we're on the
  // last bar — next call should advance to section 1, barInSection 0
  const next = nextFormPosition(FORMS.rainy, { sectionIdx: 0, barInSection: 7 });
  assertEquals(next.position.sectionIdx, 1);
  assertEquals(next.position.barInSection, 0);
  assertEquals(next.sectionChanged, true);
});

Deno.test("nextFormPosition: wraps from last section back to first", () => {
  // FORMS.rainy has 5 sections (indices 0..4). Section 4 has bars=2.
  // At sectionIdx=4, barInSection=1, the next call should wrap to sectionIdx=0.
  const next = nextFormPosition(FORMS.rainy, { sectionIdx: 4, barInSection: 1 });
  assertEquals(next.position.sectionIdx, 0);
  assertEquals(next.position.barInSection, 0);
  assertEquals(next.sectionChanged, true);
});

Deno.test("nextFormPosition: 24 calls through rainy completes one full loop", () => {
  // FORMS.rainy has bar totals [8, 8, 4, 2, 2] = 24 bars. Stepping 24 times from
  // (0, 0) should return us to (0, 0).
  let pos = { sectionIdx: 0, barInSection: 0 };
  let sectionChangedCount = 0;
  for (let i = 0; i < 24; i++) {
    const r = nextFormPosition(FORMS.rainy, pos);
    pos = r.position;
    if (r.sectionChanged) sectionChangedCount++;
  }
  assertEquals(pos, { sectionIdx: 0, barInSection: 0 });
  // Should have changed section 5 times during the loop (at the end of each of 5 sections)
  assertEquals(sectionChangedCount, 5);
});

Deno.test("nextFormPosition: cafe completes a full loop in 16 calls", () => {
  let pos = { sectionIdx: 0, barInSection: 0 };
  for (let i = 0; i < 16; i++) {
    pos = nextFormPosition(FORMS.cafe, pos).position;
  }
  assertEquals(pos, { sectionIdx: 0, barInSection: 0 });
});

Deno.test("nextFormPosition: sleepy completes a full loop in 32 calls", () => {
  let pos = { sectionIdx: 0, barInSection: 0 };
  for (let i = 0; i < 32; i++) {
    pos = nextFormPosition(FORMS.sleepy, pos).position;
  }
  assertEquals(pos, { sectionIdx: 0, barInSection: 0 });
});

Deno.test("currentSectionProg: returns the active section's prog", () => {
  // Section 0 of FORMS.rainy
  const prog = currentSectionProg(FORMS.rainy, { sectionIdx: 0, barInSection: 0 });
  assertEquals(prog, FORMS.rainy[0].prog);
});

Deno.test("currentSectionProg: returns the prog of whatever section barInSection is in", () => {
  // Section 2 of FORMS.rainy
  const prog = currentSectionProg(FORMS.rainy, { sectionIdx: 2, barInSection: 1 });
  assertEquals(prog, FORMS.rainy[2].prog);
});

Deno.test("currentSectionProg: returns DEFAULT_PROG when form is empty", () => {
  const prog = currentSectionProg([], { sectionIdx: 0, barInSection: 0 });
  assertEquals(prog, DEFAULT_PROG);
});

Deno.test("DEFAULT_PROG: is the classic 4-chord min7 cycle [0,5,8,3]", () => {
  // Matches the fallback in index.html's currentSectionProg
  assertEquals(DEFAULT_PROG.length, 4);
  assertEquals(DEFAULT_PROG[0], [0, "min7"]);
  assertEquals(DEFAULT_PROG[1], [5, "min7"]);
  assertEquals(DEFAULT_PROG[2], [8, "maj7"]);
  assertEquals(DEFAULT_PROG[3], [3, "min7"]);
});
```

- [ ] **Step 2: Run, verify fail**

```bash
deno test tests/playhead.test.ts
```

Expected: FAIL with import error.

- [ ] **Step 3: Implement**

Create `/Users/petethorne/Documents/Projects/lofi-stream/src/music/playhead.ts` with EXACT content:

```typescript
import type { Chord, Form } from "../types.ts";

/**
 * Position within a `Form`: which section we're in, and how many bars into
 * that section we've already played.
 */
export interface FormPosition {
  readonly sectionIdx: number;
  readonly barInSection: number;
}

/**
 * Result of advancing the playhead by one bar.
 *
 * `sectionChanged` is true when the step crossed a section boundary —
 * callers use this to clear cached phrase melodies for variety.
 */
export interface StepResult {
  readonly position: FormPosition;
  readonly sectionChanged: boolean;
}

/**
 * The fallback 4-chord cycle used when the form is empty. Mirrors the
 * fallback inside `currentSectionProg()` in `index.html`.
 */
export const DEFAULT_PROG: readonly [Chord, Chord, Chord, Chord] = [
  [0, "min7"],
  [5, "min7"],
  [8, "maj7"],
  [3, "min7"],
];

/**
 * Pure version of `advanceFormPlayhead` from `index.html`. Given a form and
 * the current playhead position, returns the next position plus a flag
 * indicating whether we crossed into a new section.
 *
 * Empty forms behave as if every section had 1 bar — `sectionIdx` simply
 * cycles through 0 modulo the (non-existent) length. Callers should avoid
 * stepping an empty form; this is a defensive fallback only.
 */
export function nextFormPosition(form: Form, position: FormPosition): StepResult {
  if (form.length === 0) {
    return {
      position: { sectionIdx: 0, barInSection: 0 },
      sectionChanged: false,
    };
  }
  const section = form[position.sectionIdx % form.length];
  const newBarInSection = position.barInSection + 1;
  if (newBarInSection >= section.bars) {
    return {
      position: {
        sectionIdx: (position.sectionIdx + 1) % form.length,
        barInSection: 0,
      },
      sectionChanged: true,
    };
  }
  return {
    position: {
      sectionIdx: position.sectionIdx,
      barInSection: newBarInSection,
    },
    sectionChanged: false,
  };
}

/**
 * Pure version of `currentSectionProg` from `index.html`. Returns the active
 * 4-chord prog given a form and a position. Falls back to `DEFAULT_PROG`
 * when the form is empty.
 */
export function currentSectionProg(
  form: Form,
  position: FormPosition,
): readonly [Chord, Chord, Chord, Chord] {
  if (form.length === 0) return DEFAULT_PROG;
  return form[position.sectionIdx % form.length].prog;
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
deno test tests/playhead.test.ts
```

Expected: all 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/music/playhead.ts tests/playhead.test.ts
git commit -m "feat(music): extract form playhead to src/music/playhead.ts

Pure FormPosition + StepResult types, nextFormPosition(form, position)
state transition, and currentSectionProg(form, position) lookup.
DEFAULT_PROG exposes the fallback used when a form is empty.

10 tests cover: in-section advance, section rollover, full-form loops
for rainy (24 bars) / cafe (16) / sleepy (32), DEFAULT_PROG shape, and
empty-form fallback. All deterministic — no Math.random."
```

---

## Surface the new exports

### Task 5: Update `src/main.ts` to re-export the new modules

**Files:**
- Modify: `/Users/petethorne/Documents/Projects/lofi-stream/src/main.ts`

- [ ] **Step 1: Edit main.ts**

The current file is:
```typescript
/**
 * Entry point for the bundled module artifact. Phase 2 just re-exports the
 * data modules so the build pipeline has something to bundle and downstream
 * phases can import a single module surface.
 *
 * Phase 3+ will expose these on `window` so the inline script in index.html
 * can read them, removing the duplicate inline definitions.
 */
export { VOICINGS } from "./music/voicings.ts";
export { MOOD_META } from "./music/moods.ts";
export { FORMS } from "./music/forms.ts";
export { DEFAULT_SETTINGS } from "./music/settings.ts";
export type {
  Ambience,
  Chord,
  Form,
  FormSection,
  Mood,
  MoodMeta,
  Settings,
  Timbre,
  VoicingName,
} from "./types.ts";
```

Replace it with:
```typescript
/**
 * Entry point for the bundled module artifact. Re-exports the data modules
 * and the pure music-logic helpers extracted across Phases 2 and 3.
 *
 * Phase 4 will wire `index.html` to import these directly so the inline
 * definitions can be removed.
 */
export { VOICINGS } from "./music/voicings.ts";
export { MOOD_META } from "./music/moods.ts";
export { FORMS } from "./music/forms.ts";
export { DEFAULT_SETTINGS } from "./music/settings.ts";

export { bassOct, melodyOct } from "./music/octaves.ts";
export { walkingBassNotes } from "./music/bass.ts";
export {
  currentSectionProg,
  DEFAULT_PROG,
  nextFormPosition,
} from "./music/playhead.ts";

export type {
  Ambience,
  Chord,
  Form,
  FormSection,
  Mood,
  MoodMeta,
  Settings,
  Timbre,
  VoicingName,
} from "./types.ts";
export type { FormPosition, StepResult } from "./music/playhead.ts";
```

- [ ] **Step 2: Verify full check + test + build**

```bash
export PATH="$HOME/.deno/bin:$PATH"
deno task check
deno task test
deno task build
```

Expected:
- `check` passes (scanner clean, fmt clean, lint clean, type-check clean)
- `test` passes — roughly 79 tests total (50 from Phase 2 + 10 octaves + 9 bass + 10 playhead = 79)
- `build` produces `dist/main.js`

- [ ] **Step 3: Sanity-check the bundle exports**

```bash
deno eval 'const m = await import("./dist/main.js"); console.log(Object.keys(m).sort());'
```

Expected output (alphabetised):
```
[
  "DEFAULT_PROG",
  "DEFAULT_SETTINGS",
  "FORMS",
  "MOOD_META",
  "VOICINGS",
  "bassOct",
  "currentSectionProg",
  "melodyOct",
  "nextFormPosition",
  "walkingBassNotes"
]
```

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat(src): re-export Phase 3 logic helpers from main.ts

main.ts now exposes bassOct, melodyOct, walkingBassNotes,
nextFormPosition, currentSectionProg, DEFAULT_PROG, and the related
types alongside the Phase 2 data modules."
```

---

## Ship

### Task 6: Push, open PR, wait for CI, merge

- [ ] **Step 1: Local sanity (full pipeline)**

```bash
export PATH="$HOME/.deno/bin:$PATH"
deno task check
deno task test
deno task build
```

All three must pass. If anything fails, STOP and report.

- [ ] **Step 2: Push the branch**

```bash
git push -u origin feat/phase-3-music-logic
```

- [ ] **Step 3: Open the PR**

```bash
gh pr create --title "Phase 3: Extract pure music logic into src/music/" --body "$(cat <<'EOF'
## What this changes

Pure additions — no \`index.html\` changes, app behaviour unchanged.

**New modules:**
- \`src/music/octaves.ts\` — \`bassOct\`, \`melodyOct\` (MIDI octave clamps to bass [36, 47] and melody [60, 79] registers)
- \`src/music/bass.ts\` — \`walkingBassNotes(rootMidi, voicing, nextRootMidi)\` returns 4-note walking-bass pattern
- \`src/music/playhead.ts\` — \`FormPosition\`, \`StepResult\` types; \`nextFormPosition(form, position)\` pure state transition; \`currentSectionProg(form, position)\` lookup; \`DEFAULT_PROG\` fallback

**Updated:**
- \`src/main.ts\` re-exports the new helpers and types

**Tests:** 29 new (79 total)
- 10 octaves (in-range identity, shifts, exhaustive bounds, pitch-class preservation)
- 9 bass (4-note shape, register bounds, beat-by-beat content, 5-note voicings, determinism)
- 10 playhead (in-section advance, section rollover, full-form loops for rainy/cafe/sleepy, \`DEFAULT_PROG\` shape, empty-form fallback)

## Scope deviations from the spec (deliberate)

- **\`generatePhrase\` deferred to Phase 4 or later.** It reads/writes module-scope mutable state (\`currentKey\`, \`complexity\`, \`currentPhrase\`, \`phraseBarIdx\`) and uses \`Math.random\` non-deterministically. Extracting it well requires inverting those dependencies — more refactor than fits a low-risk PR.
- **\`window\`-bridge / inline-script wiring deferred to Phase 4.** The cleanest wiring requires converting the inline \`<script>\` to \`<script type="module">\`, which is a meaningful semantic change. Phase 4 is the dedicated integration phase; Phase 3 is logic extraction only.

The app still works by opening \`index.html\` directly — the new modules aren't loaded by the browser yet.

## How to test

- \`deno task check\` passes
- \`deno task test\` passes (79 tests)
- \`deno task build\` produces \`dist/main.js\`
- \`deno eval 'const m = await import("./dist/main.js"); console.log(Object.keys(m).sort());'\` shows the new exports
- Opening \`index.html\` still works as before

## Anything to watch for

Drift risk continues: \`walkingBassNotes\`, \`melodyOct\`, \`advanceFormPlayhead\`, and \`currentSectionProg\` are duplicated between \`index.html\` and the new modules. If you change one, update the other. Phase 4 removes this duplication.
EOF
)"
```

- [ ] **Step 4: Wait for CI**

```bash
gh pr checks --watch
```

If checks fail, STOP and report.

- [ ] **Step 5: Merge if green**

```bash
gh pr merge --squash --delete-branch
git checkout main
git pull origin main
git log --oneline -5
```

- [ ] **Step 6: Final post-merge sanity**

```bash
deno task check && deno task test && deno task build
```

All three must pass on main.

---

## Done

At this point:

- The pure music-logic helpers (octaves, walking bass, form playhead) are extracted and have full deterministic test coverage
- \~79 total tests on main
- `src/main.ts` exposes the full module API surface
- `index.html` is unchanged; the app still works exactly as before
- Phase 4 (integration) is unblocked: it can convert the inline script to a module, replace the inline duplicates with imports, and remove the drift risk entirely
