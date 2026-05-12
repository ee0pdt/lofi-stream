# Phase 2 — Extract Pure Data + Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the pure data layer (`VOICINGS`, `FORMS`, `MOOD_META`, `DEFAULT_SETTINGS`) and its types from `index.html` into TypeScript modules under `src/music/`, with data-integrity tests and a working build pipeline — without changing the runtime behaviour of `index.html`.

**Architecture:** Pure additions only. The new modules mirror the data already inline in `index.html`. `index.html` is unchanged; its inline script remains the runtime source of truth. The modules + tests prove the data shapes are well-formed and self-consistent (every voicing referenced exists, every mood has a form, etc.), which is the highest-leverage class of test for catching LLM-introduced regressions later. Build pipeline (`deno task build` via esbuild, `deno task dev` via static file server) lands so subsequent phases can hook in.

**Tech Stack:** Deno 2.x, TypeScript (strict), esbuild via `npm:esbuild`, `jsr:@std/assert` for test assertions, `jsr:@std/http/file-server` for dev server.

**Spec:** `docs/superpowers/specs/2026-05-12-production-ready-oss-design.md`

**Risk:** low. No `index.html` changes; data is genuinely standalone.

**Important property:** at every commit on this branch the app still works by opening `index.html` directly (file://) — the new modules are not loaded by the browser yet.

**Drift note:** during Phase 2, the data is duplicated between `index.html` (runtime source) and `src/music/*.ts` (extracted modules). This is the cost of "no behaviour change" in Phase 2. Phase 3+ will start using the module data via a `window`-bridge from `src/main.ts`, eliminating the duplication.

---

## Pre-flight

### Task 1: Create the Phase 2 feature branch

- [ ] **Step 1: Branch from main**

Run:
```bash
git checkout main
git pull origin main
git checkout -b feat/phase-2-data-modules
```

Expected: branch created, working tree clean.

---

## Build infrastructure

### Task 2: Add the build script (`scripts/build.ts`)

**Files:**
- Create: `scripts/build.ts`
- Modify: `deno.json` (add `build` task)

- [ ] **Step 1: Write the build script**

Create `/Users/petethorne/Documents/Projects/lofi-stream/scripts/build.ts` with:
```typescript
import * as esbuild from "npm:esbuild@^0.24";

const result = await esbuild.build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  outfile: "dist/main.js",
  format: "esm",
  target: "es2022",
  sourcemap: "inline",
  logLevel: "info",
});

if (result.errors.length > 0) {
  console.error(result.errors);
  Deno.exit(1);
}

console.log("build: dist/main.js produced");
esbuild.stop();
```

- [ ] **Step 2: Add `build` task to deno.json**

Edit `/Users/petethorne/Documents/Projects/lofi-stream/deno.json`. In the `tasks` block, add a `build` entry between `check` and `test`. The full tasks block should look like:

```jsonc
"tasks": {
  "check": "deno run --allow-read scripts/check-unicode.ts && deno fmt --check && deno lint --permit-no-files",
  "build": "deno run -A scripts/build.ts",
  "test": "deno test -A",
  "fix": "deno fmt && deno lint --fix"
},
```

- [ ] **Step 3: Verify the build script parses (but don't run yet — no `src/main.ts` exists)**

Run:
```bash
export PATH="$HOME/.deno/bin:$PATH"
deno check scripts/build.ts
```

Expected: type-checks clean.

- [ ] **Step 4: Commit**

Run:
```bash
git add scripts/build.ts deno.json
git commit -m "feat(build): add esbuild-based build script

scripts/build.ts bundles src/main.ts into dist/main.js using esbuild via
npm:. Wired into 'deno task build'. Not exercised until src/main.ts
lands in a later task."
```

---

### Task 3: Add the dev server script (`scripts/dev.ts`)

**Files:**
- Create: `scripts/dev.ts`
- Modify: `deno.json` (add `dev` task)

For Phase 2 the dev server is intentionally minimal: rebuild then serve static files on port 8000. Auto-rebuild on file changes can come in a later phase when there's actually code being iterated on.

- [ ] **Step 1: Write the dev script**

Create `/Users/petethorne/Documents/Projects/lofi-stream/scripts/dev.ts` with:
```typescript
import { serveDir } from "jsr:@std/http@^1/file-server";

const buildCmd = new Deno.Command(Deno.execPath(), {
  args: ["run", "-A", "scripts/build.ts"],
  stdout: "inherit",
  stderr: "inherit",
});
const buildResult = await buildCmd.output();
if (!buildResult.success) {
  console.error("dev: initial build failed");
  Deno.exit(1);
}

const port = 8000;
console.log(`dev: serving on http://localhost:${port}`);
Deno.serve({ port }, (req) => serveDir(req, { fsRoot: "." }));
```

- [ ] **Step 2: Add `dev` task to deno.json**

Edit `/Users/petethorne/Documents/Projects/lofi-stream/deno.json` `tasks` block:

```jsonc
"tasks": {
  "check": "deno run --allow-read scripts/check-unicode.ts && deno fmt --check && deno lint --permit-no-files",
  "build": "deno run -A scripts/build.ts",
  "dev": "deno run -A scripts/dev.ts",
  "test": "deno test -A",
  "fix": "deno fmt && deno lint --fix"
},
```

- [ ] **Step 3: Type-check the dev script**

Run:
```bash
deno check scripts/dev.ts
```
Expected: clean.

- [ ] **Step 4: Commit**

Run:
```bash
git add scripts/dev.ts deno.json
git commit -m "feat(dev): add deno task dev (build + static server on :8000)

Minimal dev server for Phase 2: runs the build once, then serves the
project root on port 8000 via @std/http/file-server. Auto-rebuild on
file change is intentionally deferred until later phases."
```

---

### Task 4: Wire `deno check` (TypeScript type-check) into `deno task check`

**Files:**
- Modify: `deno.json`

`deno.json`'s `check` task currently runs the unicode scanner, `deno fmt --check`, and `deno lint --permit-no-files`. Add `deno check src/**/*.ts scripts/**/*.ts tests/**/*.ts` before lint so type errors surface during checks. Use a globbed path that tolerates missing directories.

- [ ] **Step 1: Update the check task**

Edit `/Users/petethorne/Documents/Projects/lofi-stream/deno.json`. Change the `check` task to:

```jsonc
"check": "deno run --allow-read scripts/check-unicode.ts && deno fmt --check && deno lint --permit-no-files && deno check scripts/**/*.ts",
```

Note: only `scripts/**/*.ts` at this point — `src/` and `tests/` are added by Task 11 once those directories have content. Adding them now would fail because the glob expands to nothing on macOS BSD shell.

- [ ] **Step 2: Verify**

Run:
```bash
deno task check
```
Expected: passes. The scanner reports clean; fmt clean; lint --permit-no-files clean; deno check `scripts/build.ts`, `scripts/dev.ts`, `scripts/check-unicode.ts`, `scripts/check-unicode.test.ts` clean.

- [ ] **Step 3: Commit**

Run:
```bash
git add deno.json
git commit -m "ci(check): add 'deno check' for scripts/**/*.ts to deno task check"
```

---

## Types

### Task 5: Create `src/types.ts`

**Files:**
- Create: `src/types.ts`

The shape of every piece of mood/music data lives here. Other modules import from this file rather than redefining types.

- [ ] **Step 1: Write the types module**

Create `/Users/petethorne/Documents/Projects/lofi-stream/src/types.ts` with:
```typescript
/**
 * The four moods the app supports today.
 */
export type Mood = "rainy" | "late" | "cafe" | "sleepy";

/**
 * Comp/melody timbre choice — one of five pre-built instrument voices.
 */
export type Timbre = "rhodes" | "vibraphone" | "guitar" | "pad" | "celesta";

/**
 * Ambience layer choice per mood.
 */
export type Ambience = "rain" | "traffic" | "room" | "wind";

/**
 * Jazz chord-quality recipes used by FORMS. Each maps to an array of semitone
 * offsets from the chord root.
 */
export type VoicingName =
  | "min7"
  | "maj7"
  | "dom7"
  | "min7b5"
  | "maj6"
  | "min9"
  | "dom9"
  | "maj9";

/**
 * A single chord in a FORM: [rootOffsetSemitones, voicingName]. The root
 * offset is relative to the key chosen at newProgression() time.
 */
export type Chord = readonly [rootOffset: number, voicing: VoicingName];

/**
 * One section of a compositional form. Plays its 4-chord `prog` cycle for
 * `bars` bars, then advances to the next section.
 */
export interface FormSection {
  readonly bars: number;
  readonly prog: readonly [Chord, Chord, Chord, Chord];
}

/**
 * A full compositional form: ordered list of sections that loops once
 * exhausted.
 */
export type Form = readonly FormSection[];

/**
 * Per-mood timbral + harmonic configuration.
 */
export interface MoodMeta {
  readonly bpmRange: readonly [number, number];
  readonly swingRange: readonly [number, number];
  readonly names: readonly string[];
  readonly key_pool: readonly number[];
  readonly reverb: { readonly dur: number; readonly decay: number };
  readonly snareFreq: number;
  readonly snareQ: number;
  readonly bassFilter: number;
  readonly bassAttack: number;
  readonly compTimbre: Timbre;
  readonly melTimbre: Timbre;
  readonly ambience: Ambience;
}

/**
 * Per-mood mixer / parameter defaults. Each `Settings` corresponds to one
 * mood and is deep-cloned into the runtime `moodSettings` map at startup so
 * user adjustments are isolated per mood.
 */
export interface Settings {
  readonly drums: number;
  readonly bass: number;
  readonly comp: number;
  readonly melody: number;
  readonly hiss: number;
  readonly scratches: number;
  readonly hum: number;
  readonly warp: number;
  readonly ambience: number;
  readonly rain: number;
  readonly complexity: number;
  readonly vol: number;
}
```

- [ ] **Step 2: Type-check the new file**

Run:
```bash
deno check src/types.ts
```
Expected: clean.

- [ ] **Step 3: Commit**

Run:
```bash
git add src/types.ts
git commit -m "feat(types): add src/types.ts with Mood, Voicing, Form, MoodMeta, Settings"
```

---

## Data modules — TDD pattern repeats for each

The next four tasks (6–9) follow the same TDD shape: write a test that imports a module that doesn't exist, verify it fails, write the module, verify it passes, commit. Each module is a re-export of a const that mirrors the inline definition in `index.html` exactly.

### Task 6: TDD `src/music/voicings.ts`

**Files:**
- Create: `tests/voicings.test.ts`
- Create: `src/music/voicings.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/petethorne/Documents/Projects/lofi-stream/tests/voicings.test.ts` with:
```typescript
import { assertEquals } from "jsr:@std/assert@^1";
import { VOICINGS } from "../src/music/voicings.ts";

Deno.test("VOICINGS: contains all 8 expected chord qualities", () => {
  const expected = ["min7", "maj7", "dom7", "min7b5", "maj6", "min9", "dom9", "maj9"];
  for (const name of expected) {
    assertEquals(name in VOICINGS, true, `missing voicing: ${name}`);
  }
  assertEquals(Object.keys(VOICINGS).length, expected.length);
});

Deno.test("VOICINGS.min7 is [0, 3, 7, 10]", () => {
  assertEquals(VOICINGS.min7, [0, 3, 7, 10]);
});

Deno.test("VOICINGS.maj7 is [0, 4, 7, 11]", () => {
  assertEquals(VOICINGS.maj7, [0, 4, 7, 11]);
});

Deno.test("VOICINGS.dom7 is [0, 4, 7, 10]", () => {
  assertEquals(VOICINGS.dom7, [0, 4, 7, 10]);
});

Deno.test("VOICINGS.min7b5 is [0, 3, 6, 10]", () => {
  assertEquals(VOICINGS.min7b5, [0, 3, 6, 10]);
});

Deno.test("VOICINGS.maj6 is [0, 4, 7, 9]", () => {
  assertEquals(VOICINGS.maj6, [0, 4, 7, 9]);
});

Deno.test("VOICINGS.min9 is [0, 3, 7, 10, 14]", () => {
  assertEquals(VOICINGS.min9, [0, 3, 7, 10, 14]);
});

Deno.test("VOICINGS.dom9 is [0, 4, 7, 10, 14]", () => {
  assertEquals(VOICINGS.dom9, [0, 4, 7, 10, 14]);
});

Deno.test("VOICINGS.maj9 is [0, 4, 7, 11, 14]", () => {
  assertEquals(VOICINGS.maj9, [0, 4, 7, 11, 14]);
});

Deno.test("VOICINGS: every voicing starts on root (0)", () => {
  for (const [name, intervals] of Object.entries(VOICINGS)) {
    assertEquals(intervals[0], 0, `${name} should start on root`);
  }
});

Deno.test("VOICINGS: every voicing is sorted ascending", () => {
  for (const [name, intervals] of Object.entries(VOICINGS)) {
    for (let i = 1; i < intervals.length; i++) {
      assertEquals(
        intervals[i] > intervals[i - 1],
        true,
        `${name} not strictly ascending at index ${i}`,
      );
    }
  }
});
```

- [ ] **Step 2: Run, verify it fails**

Run:
```bash
deno test tests/voicings.test.ts
```
Expected: FAIL with import error (`Cannot find module ../src/music/voicings.ts`).

- [ ] **Step 3: Implement the module**

Create `/Users/petethorne/Documents/Projects/lofi-stream/src/music/voicings.ts` with:
```typescript
import type { VoicingName } from "../types.ts";

/**
 * Jazz chord-quality recipes — each maps to an array of semitone offsets
 * from the chord root. Values must match the inline `VOICINGS` definition
 * in `index.html` until the inline script is removed in a later phase.
 */
export const VOICINGS: Record<VoicingName, readonly number[]> = {
  min7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  dom7: [0, 4, 7, 10],
  min7b5: [0, 3, 6, 10],
  maj6: [0, 4, 7, 9],
  min9: [0, 3, 7, 10, 14],
  dom9: [0, 4, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
} as const;
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
deno test tests/voicings.test.ts
```
Expected: all 11 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/music/voicings.ts tests/voicings.test.ts
git commit -m "feat(music): extract VOICINGS to src/music/voicings.ts

11 tests cover: presence of all 8 chord qualities, exact interval values,
root-at-zero invariant, ascending invariant.

Data mirrors the inline definition in index.html — Phase 2 deliberately
keeps both; Phase 3+ removes the duplication when the inline script
starts reading from window."
```

---

### Task 7: TDD `src/music/moods.ts`

**Files:**
- Create: `tests/moods.test.ts`
- Create: `src/music/moods.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/petethorne/Documents/Projects/lofi-stream/tests/moods.test.ts` with:
```typescript
import { assertEquals } from "jsr:@std/assert@^1";
import { MOOD_META } from "../src/music/moods.ts";
import type { Mood } from "../src/types.ts";

const MOODS: Mood[] = ["rainy", "late", "cafe", "sleepy"];

Deno.test("MOOD_META: contains exactly the four expected moods", () => {
  assertEquals(Object.keys(MOOD_META).sort(), [...MOODS].sort());
});

Deno.test("MOOD_META: every mood has bpmRange [low, high] with low < high", () => {
  for (const mood of MOODS) {
    const [lo, hi] = MOOD_META[mood].bpmRange;
    assertEquals(lo < hi, true, `${mood} bpmRange not ascending`);
    assertEquals(lo > 0, true, `${mood} bpmRange.low must be positive`);
  }
});

Deno.test("MOOD_META: every mood has swingRange [low, high] with low < high in [0, 0.5]", () => {
  for (const mood of MOODS) {
    const [lo, hi] = MOOD_META[mood].swingRange;
    assertEquals(lo < hi, true, `${mood} swingRange not ascending`);
    assertEquals(lo >= 0 && hi <= 0.5, true, `${mood} swingRange out of [0, 0.5]`);
  }
});

Deno.test("MOOD_META: every mood has at least one human-readable name", () => {
  for (const mood of MOODS) {
    assertEquals(MOOD_META[mood].names.length >= 1, true, `${mood} has no names`);
  }
});

Deno.test("MOOD_META: every key_pool entry is a semitone in [0, 11]", () => {
  for (const mood of MOODS) {
    for (const k of MOOD_META[mood].key_pool) {
      assertEquals(k >= 0 && k <= 11, true, `${mood} key_pool has out-of-range ${k}`);
    }
  }
});

Deno.test("MOOD_META: reverb dur > 0, decay in (0, 1)", () => {
  for (const mood of MOODS) {
    const { dur, decay } = MOOD_META[mood].reverb;
    assertEquals(dur > 0, true, `${mood} reverb.dur not positive`);
    assertEquals(decay > 0 && decay < 1, true, `${mood} reverb.decay out of (0, 1)`);
  }
});

Deno.test("MOOD_META: compTimbre and melTimbre are valid timbres", () => {
  const validTimbres = ["rhodes", "vibraphone", "guitar", "pad", "celesta"];
  for (const mood of MOODS) {
    assertEquals(
      validTimbres.includes(MOOD_META[mood].compTimbre),
      true,
      `${mood} compTimbre invalid`,
    );
    assertEquals(
      validTimbres.includes(MOOD_META[mood].melTimbre),
      true,
      `${mood} melTimbre invalid`,
    );
  }
});

Deno.test("MOOD_META: ambience is a valid ambience type", () => {
  const validAmbience = ["rain", "traffic", "room", "wind"];
  for (const mood of MOODS) {
    assertEquals(
      validAmbience.includes(MOOD_META[mood].ambience),
      true,
      `${mood} ambience invalid`,
    );
  }
});

Deno.test("MOOD_META.rainy: spot-check known values", () => {
  const m = MOOD_META.rainy;
  assertEquals(m.bpmRange, [62, 72]);
  assertEquals(m.compTimbre, "rhodes");
  assertEquals(m.ambience, "rain");
});

Deno.test("MOOD_META.sleepy: spot-check known values", () => {
  const m = MOOD_META.sleepy;
  assertEquals(m.bpmRange, [55, 65]);
  assertEquals(m.compTimbre, "pad");
  assertEquals(m.melTimbre, "celesta");
  assertEquals(m.ambience, "wind");
});
```

- [ ] **Step 2: Run, verify fail**

```bash
deno test tests/moods.test.ts
```
Expected: FAIL with import error.

- [ ] **Step 3: Implement the module**

Create `/Users/petethorne/Documents/Projects/lofi-stream/src/music/moods.ts` with:
```typescript
import type { Mood, MoodMeta } from "../types.ts";

/**
 * Per-mood timbral + harmonic configuration. Values must match the inline
 * `MOOD_META` definition in `index.html` until the inline script is
 * removed in a later phase.
 */
export const MOOD_META: Record<Mood, MoodMeta> = {
  rainy: {
    bpmRange: [62, 72],
    swingRange: [0.07, 0.12],
    names: ["grey afternoon", "window seat", "soft rain"],
    key_pool: [0, 2, 3, 5, 9],
    reverb: { dur: 3.2, decay: 0.5 },
    snareFreq: 2200,
    snareQ: 0.5,
    bassFilter: 280,
    bassAttack: 0.02,
    compTimbre: "rhodes",
    melTimbre: "rhodes",
    ambience: "rain",
  },
  late: {
    bpmRange: [65, 75],
    swingRange: [0.06, 0.1],
    names: ["3am brew", "city lights", "last bus"],
    key_pool: [0, 2, 5, 7, 9],
    reverb: { dur: 4.0, decay: 0.42 },
    snareFreq: 2600,
    snareQ: 0.7,
    bassFilter: 200,
    bassAttack: 0.03,
    compTimbre: "vibraphone",
    melTimbre: "vibraphone",
    ambience: "traffic",
  },
  cafe: {
    bpmRange: [70, 80],
    swingRange: [0.04, 0.07],
    names: ["warm espresso", "cosy corner", "notebook"],
    key_pool: [0, 4, 5, 7, 9],
    reverb: { dur: 1.4, decay: 0.72 },
    snareFreq: 3000,
    snareQ: 0.9,
    bassFilter: 400,
    bassAttack: 0.01,
    compTimbre: "guitar",
    melTimbre: "rhodes",
    ambience: "room",
  },
  sleepy: {
    bpmRange: [55, 65],
    swingRange: [0.09, 0.14],
    names: ["almost asleep", "blanket hour", "dim lamp"],
    key_pool: [0, 2, 3, 5, 8],
    reverb: { dur: 5.0, decay: 0.35 },
    snareFreq: 1800,
    snareQ: 0.4,
    bassFilter: 180,
    bassAttack: 0.04,
    compTimbre: "pad",
    melTimbre: "celesta",
    ambience: "wind",
  },
};
```

- [ ] **Step 4: Run tests, verify pass**

```bash
deno test tests/moods.test.ts
```
Expected: all 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/music/moods.ts tests/moods.test.ts
git commit -m "feat(music): extract MOOD_META to src/music/moods.ts

10 tests cover: shape invariants (4 expected moods, ranges ordered, key_pool
semitones in [0,11], reverb dur>0/decay∈(0,1), valid timbres/ambiences) and
spot-checks on rainy/sleepy.

Values mirror the inline MOOD_META in index.html exactly."
```

---

### Task 8: TDD `src/music/forms.ts`

**Files:**
- Create: `tests/forms.test.ts`
- Create: `src/music/forms.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/petethorne/Documents/Projects/lofi-stream/tests/forms.test.ts` with:
```typescript
import { assertEquals } from "jsr:@std/assert@^1";
import { FORMS } from "../src/music/forms.ts";
import { VOICINGS } from "../src/music/voicings.ts";
import type { Mood } from "../src/types.ts";

const MOODS: Mood[] = ["rainy", "late", "cafe", "sleepy"];

Deno.test("FORMS: contains exactly the four expected moods", () => {
  assertEquals(Object.keys(FORMS).sort(), [...MOODS].sort());
});

Deno.test("FORMS: every form has at least one section", () => {
  for (const mood of MOODS) {
    assertEquals(FORMS[mood].length >= 1, true, `${mood} has no sections`);
  }
});

Deno.test("FORMS: every section has bars > 0", () => {
  for (const mood of MOODS) {
    for (const [idx, section] of FORMS[mood].entries()) {
      assertEquals(section.bars > 0, true, `${mood}[${idx}] has bars=${section.bars}`);
    }
  }
});

Deno.test("FORMS: every section's prog is exactly 4 chords", () => {
  for (const mood of MOODS) {
    for (const [idx, section] of FORMS[mood].entries()) {
      assertEquals(section.prog.length, 4, `${mood}[${idx}] prog length wrong`);
    }
  }
});

Deno.test("FORMS: every chord references a voicing that exists in VOICINGS", () => {
  for (const mood of MOODS) {
    for (const [idx, section] of FORMS[mood].entries()) {
      for (const [chordIdx, [_root, voicing]] of section.prog.entries()) {
        assertEquals(
          voicing in VOICINGS,
          true,
          `${mood}[${idx}].prog[${chordIdx}] references missing voicing "${voicing}"`,
        );
      }
    }
  }
});

Deno.test("FORMS: every rootOffset is a semitone in [0, 11]", () => {
  for (const mood of MOODS) {
    for (const [idx, section] of FORMS[mood].entries()) {
      for (const [chordIdx, [root, _voicing]] of section.prog.entries()) {
        assertEquals(
          root >= 0 && root <= 11,
          true,
          `${mood}[${idx}].prog[${chordIdx}] rootOffset ${root} out of [0, 11]`,
        );
      }
    }
  }
});

Deno.test("FORMS.rainy: matches the known 24-bar AABBA' structure", () => {
  // 8 + 8 + 4 + 2 + 2 = 24
  const bars = FORMS.rainy.map((s) => s.bars);
  assertEquals(bars, [8, 8, 4, 2, 2]);
  assertEquals(bars.reduce((a, b) => a + b, 0), 24);
});

Deno.test("FORMS.cafe: matches the known 16-bar AABB' structure", () => {
  const bars = FORMS.cafe.map((s) => s.bars);
  assertEquals(bars, [4, 4, 4, 4]);
  assertEquals(bars.reduce((a, b) => a + b, 0), 16);
});

Deno.test("FORMS.sleepy: matches the known 32-bar AAAB A structure", () => {
  const bars = FORMS.sleepy.map((s) => s.bars);
  assertEquals(bars, [8, 8, 8, 8]);
  assertEquals(bars.reduce((a, b) => a + b, 0), 32);
});
```

- [ ] **Step 2: Run, verify fail**

```bash
deno test tests/forms.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement the module**

Create `/Users/petethorne/Documents/Projects/lofi-stream/src/music/forms.ts` with:
```typescript
import type { Form, Mood } from "../types.ts";

/**
 * Per-mood compositional forms. Each form is an ordered list of sections;
 * sections play in order then the form loops.
 *
 * Each section's `prog` is exactly 4 chords as `[rootOffset, voicingName]`.
 * Values must match the inline `FORMS` definition in `index.html` until
 * the inline script is removed in a later phase.
 */
export const FORMS: Record<Mood, Form> = {
  // RAINY — 24 bars: AABBA'
  rainy: [
    {
      bars: 8,
      prog: [
        [0, "min7"],
        [5, "min7"],
        [8, "maj7"],
        [3, "min7"],
      ],
    }, // A home
    {
      bars: 8,
      prog: [
        [0, "min7"],
        [7, "dom7"],
        [5, "maj7"],
        [3, "min9"],
      ],
    }, // A variant
    {
      bars: 4,
      prog: [
        [0, "min9"],
        [8, "maj7"],
        [5, "dom9"],
        [3, "min7"],
      ],
    }, // B descend
    {
      bars: 2,
      prog: [
        [5, "min7"],
        [8, "maj7"],
        [3, "min7b5"],
        [7, "dom7"],
      ],
    }, // B' darker
    {
      bars: 2,
      prog: [
        [0, "min7"],
        [5, "min7"],
        [8, "maj7"],
        [3, "min7"],
      ],
    }, // A' return
  ],

  // LATE — 32 bars: AABCC'A
  late: [
    {
      bars: 8,
      prog: [
        [0, "min7b5"],
        [5, "min7"],
        [3, "maj7"],
        [7, "dom7"],
      ],
    },
    {
      bars: 8,
      prog: [
        [0, "min7"],
        [3, "min7b5"],
        [8, "maj7"],
        [5, "dom9"],
      ],
    },
    {
      bars: 6,
      prog: [
        [0, "min7"],
        [7, "dom9"],
        [3, "maj7"],
        [8, "maj7"],
      ],
    },
    {
      bars: 2,
      prog: [
        [5, "min7b5"],
        [8, "dom9"],
        [3, "maj7"],
        [0, "min7"],
      ],
    },
    {
      bars: 4,
      prog: [
        [8, "maj7"],
        [3, "maj9"],
        [5, "dom9"],
        [0, "min7"],
      ],
    },
    {
      bars: 4,
      prog: [
        [0, "min7b5"],
        [5, "min7"],
        [3, "maj7"],
        [7, "dom7"],
      ],
    },
  ],

  // CAFE — 16 bars: AABB'
  cafe: [
    {
      bars: 4,
      prog: [
        [0, "maj7"],
        [5, "dom7"],
        [3, "maj6"],
        [7, "dom9"],
      ],
    },
    {
      bars: 4,
      prog: [
        [0, "maj9"],
        [5, "maj7"],
        [3, "dom7"],
        [8, "maj7"],
      ],
    },
    {
      bars: 4,
      prog: [
        [0, "maj7"],
        [7, "dom9"],
        [5, "maj9"],
        [2, "min7"],
      ],
    },
    {
      bars: 4,
      prog: [
        [2, "min7"],
        [7, "dom9"],
        [0, "maj7"],
        [5, "dom7"],
      ],
    },
  ],

  // SLEEPY — 32 bars: AAAB A
  sleepy: [
    {
      bars: 8,
      prog: [
        [0, "min7"],
        [3, "maj7"],
        [5, "min9"],
        [8, "maj7"],
      ],
    }, // A
    {
      bars: 8,
      prog: [
        [0, "min7"],
        [3, "maj7"],
        [5, "min9"],
        [8, "maj7"],
      ],
    }, // A repeat
    {
      bars: 8,
      prog: [
        [0, "min9"],
        [7, "min7"],
        [3, "maj9"],
        [5, "min7"],
      ],
    }, // B
    {
      bars: 8,
      prog: [
        [0, "min7"],
        [3, "maj7"],
        [5, "min9"],
        [8, "maj7"],
      ],
    }, // A return
  ],
};
```

- [ ] **Step 4: Run tests, verify pass**

```bash
deno test tests/forms.test.ts
```
Expected: all 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/music/forms.ts tests/forms.test.ts
git commit -m "feat(music): extract FORMS to src/music/forms.ts

9 tests cover: presence of all 4 moods, all sections have bars>0, every prog
is exactly 4 chords, every chord references a real voicing, every rootOffset
is in [0, 11], and bar totals match per-mood (rainy=24, cafe=16, sleepy=32).

Values mirror the inline FORMS in index.html exactly."
```

---

### Task 9: TDD `src/music/settings.ts`

**Files:**
- Create: `tests/settings.test.ts`
- Create: `src/music/settings.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/petethorne/Documents/Projects/lofi-stream/tests/settings.test.ts` with:
```typescript
import { assertEquals } from "jsr:@std/assert@^1";
import { DEFAULT_SETTINGS } from "../src/music/settings.ts";
import type { Mood } from "../src/types.ts";

const MOODS: Mood[] = ["rainy", "late", "cafe", "sleepy"];

const SLIDER_KEYS = [
  "drums",
  "bass",
  "comp",
  "melody",
  "hiss",
  "scratches",
  "hum",
  "warp",
  "ambience",
  "rain",
  "complexity",
  "vol",
] as const;

Deno.test("DEFAULT_SETTINGS: contains exactly the four expected moods", () => {
  assertEquals(Object.keys(DEFAULT_SETTINGS).sort(), [...MOODS].sort());
});

Deno.test("DEFAULT_SETTINGS: each mood has all 12 slider keys", () => {
  for (const mood of MOODS) {
    const keys = Object.keys(DEFAULT_SETTINGS[mood]).sort();
    assertEquals(keys, [...SLIDER_KEYS].sort(), `${mood} keys mismatch`);
  }
});

Deno.test("DEFAULT_SETTINGS: every slider value is in [0, 1]", () => {
  for (const mood of MOODS) {
    for (const [key, val] of Object.entries(DEFAULT_SETTINGS[mood])) {
      assertEquals(val >= 0 && val <= 1, true, `${mood}.${key}=${val} out of [0, 1]`);
    }
  }
});

Deno.test("DEFAULT_SETTINGS.rainy: spot-check known values", () => {
  const s = DEFAULT_SETTINGS.rainy;
  assertEquals(s.drums, 0.85);
  assertEquals(s.rain, 0.6);
  assertEquals(s.complexity, 0.45);
});

Deno.test("DEFAULT_SETTINGS.cafe: rain is 0 (no rain in cafe)", () => {
  assertEquals(DEFAULT_SETTINGS.cafe.rain, 0);
});

Deno.test("DEFAULT_SETTINGS.sleepy: rain is 0 (no rain when sleepy)", () => {
  assertEquals(DEFAULT_SETTINGS.sleepy.rain, 0);
});
```

- [ ] **Step 2: Run, verify fail**

```bash
deno test tests/settings.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement the module**

Create `/Users/petethorne/Documents/Projects/lofi-stream/src/music/settings.ts` with:
```typescript
import type { Mood, Settings } from "../types.ts";

/**
 * Per-mood mixer/parameter defaults. Each `Settings` is deep-cloned into the
 * runtime `moodSettings` map at startup so user adjustments stay isolated
 * per mood.
 *
 * Values must match the inline `DEFAULT_SETTINGS` in `index.html` until the
 * inline script is removed in a later phase.
 */
export const DEFAULT_SETTINGS: Record<Mood, Settings> = {
  rainy: {
    drums: 0.85,
    bass: 0.85,
    comp: 0.8,
    melody: 0.7,
    hiss: 0.5,
    scratches: 0.65,
    hum: 0.35,
    warp: 0.3,
    ambience: 0.7,
    rain: 0.6,
    complexity: 0.45,
    vol: 0.65,
  },
  late: {
    drums: 0.8,
    bass: 0.9,
    comp: 0.85,
    melody: 0.7,
    hiss: 0.2,
    scratches: 0.7,
    hum: 0.5,
    warp: 0.5,
    ambience: 0.65,
    rain: 0.05,
    complexity: 0.55,
    vol: 0.65,
  },
  cafe: {
    drums: 0.9,
    bass: 0.85,
    comp: 0.85,
    melody: 0.8,
    hiss: 0.45,
    scratches: 0.6,
    hum: 0.3,
    warp: 0.25,
    ambience: 0.45,
    rain: 0,
    complexity: 0.65,
    vol: 0.65,
  },
  sleepy: {
    drums: 0.65,
    bass: 0.7,
    comp: 0.85,
    melody: 0.8,
    hiss: 0.2,
    scratches: 0.55,
    hum: 0.4,
    warp: 0.55,
    ambience: 0.35,
    rain: 0,
    complexity: 0.2,
    vol: 0.6,
  },
};
```

- [ ] **Step 4: Run tests, verify pass**

```bash
deno test tests/settings.test.ts
```
Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/music/settings.ts tests/settings.test.ts
git commit -m "feat(music): extract DEFAULT_SETTINGS to src/music/settings.ts

6 tests cover: 4 moods present, each has all 12 slider keys, all values in
[0, 1], spot-checks on rainy, and the rain=0 invariant for cafe and sleepy.

Values mirror the inline DEFAULT_SETTINGS in index.html exactly."
```

---

## Cross-cutting

### Task 10: Cross-module integrity tests

**Files:**
- Create: `tests/integrity.test.ts`

The highest-leverage tests in the suite: catch the most common LLM regression — adding a mood in one place but forgetting another.

- [ ] **Step 1: Write the test file**

Create `/Users/petethorne/Documents/Projects/lofi-stream/tests/integrity.test.ts` with:
```typescript
import { assertEquals } from "jsr:@std/assert@^1";
import { FORMS } from "../src/music/forms.ts";
import { MOOD_META } from "../src/music/moods.ts";
import { DEFAULT_SETTINGS } from "../src/music/settings.ts";

Deno.test("integrity: MOOD_META, FORMS, and DEFAULT_SETTINGS all use the same mood keys", () => {
  const moodKeys = Object.keys(MOOD_META).sort();
  const formKeys = Object.keys(FORMS).sort();
  const settingsKeys = Object.keys(DEFAULT_SETTINGS).sort();
  assertEquals(moodKeys, formKeys, "MOOD_META and FORMS keys differ");
  assertEquals(moodKeys, settingsKeys, "MOOD_META and DEFAULT_SETTINGS keys differ");
});

Deno.test("integrity: every mood that says ambience='rain' has rain>0 in defaults", () => {
  for (const mood of Object.keys(MOOD_META) as (keyof typeof MOOD_META)[]) {
    if (MOOD_META[mood].ambience === "rain") {
      assertEquals(
        DEFAULT_SETTINGS[mood].rain > 0,
        true,
        `${mood} has ambience=rain but rain default is ${DEFAULT_SETTINGS[mood].rain}`,
      );
    }
  }
});

Deno.test("integrity: every mood that says ambience!='rain' has rain<0.5 in defaults", () => {
  // Non-rain moods may still have a tiny rain layer (e.g., 'late' has 0.05) but
  // shouldn't have a prominent one — guards against accidentally re-enabling rain.
  for (const mood of Object.keys(MOOD_META) as (keyof typeof MOOD_META)[]) {
    if (MOOD_META[mood].ambience !== "rain") {
      assertEquals(
        DEFAULT_SETTINGS[mood].rain < 0.5,
        true,
        `${mood} has ambience=${MOOD_META[mood].ambience} but rain default is ${DEFAULT_SETTINGS[mood].rain}`,
      );
    }
  }
});
```

- [ ] **Step 2: Run, verify all pass**

```bash
deno test tests/integrity.test.ts
```
Expected: 3 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/integrity.test.ts
git commit -m "test(integrity): add cross-module shape invariants

Catches the most common future regression: adding a mood in one place
but forgetting MOOD_META / FORMS / DEFAULT_SETTINGS in the other two."
```

---

### Task 11: Create `src/main.ts` entry point and expand `deno check`

**Files:**
- Create: `src/main.ts`
- Modify: `deno.json` (expand the `deno check` glob)

Phase 2's `src/main.ts` is a small entry point: imports the data modules and re-exports them. It doesn't yet wire anything into `window` or interact with `index.html`. Its purpose is to (a) give the build script something to bundle and (b) make the modules tree-shakeable consumers in later phases.

- [ ] **Step 1: Write the entry point**

Create `/Users/petethorne/Documents/Projects/lofi-stream/src/main.ts` with:
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

- [ ] **Step 2: Expand `deno check` glob in deno.json to include src/ and tests/**

Edit `/Users/petethorne/Documents/Projects/lofi-stream/deno.json`. Change the `check` task to:

```jsonc
"check": "deno run --allow-read scripts/check-unicode.ts && deno fmt --check && deno lint --permit-no-files && deno check scripts/**/*.ts src/**/*.ts tests/**/*.ts",
```

- [ ] **Step 3: Run full check**

```bash
deno task check
```
Expected: passes. Scanner clean, fmt clean, lint clean, deno check clean across all three directories.

- [ ] **Step 4: Run all tests**

```bash
deno task test
```
Expected: scanner tests + voicings (11) + moods (10) + forms (9) + settings (6) + integrity (3) = roughly 50 tests, all pass.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts deno.json
git commit -m "feat(src): add src/main.ts entry point + extend deno check to src/, tests/

main.ts re-exports the four data modules and their types. The build script
now has a buildable target. deno check now type-checks src/ and tests/ in
addition to scripts/."
```

---

### Task 12: Verify the build pipeline end-to-end

**Files:** none (verification only)

- [ ] **Step 1: Run the build**

```bash
deno task build
```
Expected: outputs progress lines from esbuild, then `build: dist/main.js produced`. Exits 0.

- [ ] **Step 2: Verify the output**

```bash
ls -la dist/
test -f dist/main.js && echo "dist/main.js exists"
wc -l dist/main.js
```
Expected: `dist/main.js` exists, non-empty (likely a few hundred lines including the sourcemap).

- [ ] **Step 3: Sanity-check the bundle by importing it**

Run:
```bash
deno eval 'const m = await import("./dist/main.js"); console.log(Object.keys(m));'
```
Expected: prints `[ "DEFAULT_SETTINGS", "FORMS", "MOOD_META", "VOICINGS" ]` (order may vary; types are erased so they don't appear).

If this fails, STOP. The build pipeline isn't producing a loadable artifact.

- [ ] **Step 4: Verify the dev server works**

```bash
deno task dev &
DEV_PID=$!
sleep 2
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/index.html
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/dist/main.js
kill $DEV_PID
```
Expected: both `200` responses. `index.html` and `dist/main.js` are served correctly.

If `dist/main.js` returns 404, the build step in `dev.ts` didn't run before serving.

- [ ] **Step 5: No commit needed**

`dist/` is gitignored. This task is verification only — if it passes, nothing changes on disk that's tracked.

---

## CI + Ship

### Task 13: Update the CI workflow to run the build

**Files:**
- Modify: `.github/workflows/ci.yml`

The `check` job currently runs `deno task check` + `deno task test`. Add a `deno task build` step so CI verifies the bundle compiles. (No smoke job yet — that comes in Phase 8 once the modules are actually loaded by the browser.)

- [ ] **Step 1: Edit the workflow**

Edit `/Users/petethorne/Documents/Projects/lofi-stream/.github/workflows/ci.yml`. After the `Test` step, add a `Build` step. The full file should be:

```yaml
name: ci

on:
  pull_request:
  push:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v2
        with:
          deno-version: v2.x
      - name: Check (fmt + lint + type-check + unicode)
        run: deno task check
      - name: Test
        run: deno task test
      - name: Build
        run: deno task build
```

- [ ] **Step 2: Verify locally one more time**

```bash
deno task check && deno task test && deno task build
```
All three must succeed.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run deno task build alongside check + test

Verifies the bundle compiles. Smoke tests come in Phase 8."
```

---

### Task 14: Push, open PR, wait for CI, merge

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/phase-2-data-modules
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --title "Phase 2: Extract pure data + types into src/music/" --body "$(cat <<'EOF'
## What this changes

Pure additions — no \`index.html\` changes, app behaviour unchanged.

**New modules in \`src/\`:**
- \`src/types.ts\` — Mood, Timbre, Ambience, VoicingName, Chord, FormSection, Form, MoodMeta, Settings
- \`src/music/voicings.ts\` — VOICINGS (8 chord-quality recipes)
- \`src/music/moods.ts\` — MOOD_META (per-mood timbral + harmonic config)
- \`src/music/forms.ts\` — FORMS (per-mood compositional structures)
- \`src/music/settings.ts\` — DEFAULT_SETTINGS (per-mood slider defaults)
- \`src/main.ts\` — entry point (re-exports the four data modules)

**Build pipeline:**
- \`scripts/build.ts\` — esbuild via npm:, produces \`dist/main.js\`
- \`scripts/dev.ts\` — builds then serves on :8000 via @std/http/file-server
- \`deno task build\` and \`deno task dev\` added

**Type-checking:**
- \`deno task check\` now runs \`deno check\` across \`scripts/\`, \`src/\`, and \`tests/\`

**Tests:** ~39 new tests
- 11 voicings (shape + interval values)
- 10 moods (ranges, key_pool bounds, valid timbres/ambience, spot-checks)
- 9 forms (every chord references a real voicing, bar totals per mood)
- 6 settings (12 keys per mood, all values in [0,1], rain=0 invariants)
- 3 integrity (cross-module key consistency, ambience↔rain coupling)

**CI:** \`build\` step added.

## How to test

- \`deno task check\` passes
- \`deno task test\` passes (~50 tests including the scanner suite)
- \`deno task build\` produces \`dist/main.js\`
- \`deno task dev\` serves on :8000 and \`/dist/main.js\` returns 200
- Opening \`index.html\` directly still works exactly as before (the new modules aren't loaded by the browser yet)

## Anything to watch for

**Drift risk:** the data is now duplicated between the inline definitions in \`index.html\` and the new modules. Tests verify the module copy is well-formed, but they don't detect drift against the inline source. Phase 3 starts using the module data via a \`window\`-bridge, eliminating the duplication. Until then: if you change \`VOICINGS\`, \`FORMS\`, \`MOOD_META\`, or \`DEFAULT_SETTINGS\`, update both places.
EOF
)"
```

- [ ] **Step 3: Wait for CI**

```bash
gh pr checks --watch
```
If checks fail, STOP and report.

- [ ] **Step 4: Merge**

```bash
gh pr merge --squash --delete-branch
git checkout main
git pull origin main
git log --oneline -5
```

- [ ] **Step 5: Sanity test the merged state**

```bash
deno task check && deno task test && deno task build
open index.html
```
Expected: all three commands pass; opening `index.html` still renders the app correctly.

---

## Done

At this point:

- The four data modules + types exist with full test coverage
- The build pipeline (`deno task build`/`dev`) is working
- `deno task check` now includes type-checking
- CI gates all three checks (check, test, build)
- `index.html` is unchanged; the app still works
- The repo is ready for Phase 3: extracting pure music logic (`generatePhrase`, `advanceFormPlayhead`, walking-bass helpers) and wiring the inline script to read mood data from `window` via a `window`-bridge from `src/main.ts`

Phase 3's plan should be written next.
