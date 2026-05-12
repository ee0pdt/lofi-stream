# Final Modularization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the remaining ~2400 lines of stateful runtime code from `index.html` into focused modules under `src/`, drop the `lofi:ready` window-bridge in favour of proper imports, introduce a tiny Zustand-style reactive store for UI/settings state, and reduce `index.html` to a DOM shell.

**Architecture:** Single feature branch (`feat/final-modularization`), single PR, six atomic commits (A–F). State splits three ways: reactive UI/settings → `src/store.ts`; audio node references → module-level refs in `src/audio/graph.ts` (built by `initAudio`, returned as an `AudioRefs` bag and passed explicitly to consumers); scheduler-internal state stays module-scope inside `src/audio/scheduler.ts`. `Math.random` injection (default-armed) lets us add structural tests for `generatePhrase`.

**Tech Stack:** TypeScript via Deno 2.x. Native ES modules. esbuild bundle via `scripts/build.ts`. Browser-only runtime — no Node/Deno audio test infra.

**Spec:** `docs/superpowers/specs/2026-05-12-final-modularization-design.md`

**Risk:** Medium-high. This is the largest single refactor of the project. Mitigations: each commit ends with `deno task check && test && build` passing; commits C/D/E/F have a manual browser-QA gate before moving on; `Math.random` call sites preserve their original order line-by-line so phrase distributions don't shift.

---

## Pre-flight

### Task 1: Verify clean baseline on the feature branch

- [ ] **Step 1: Confirm on feat/final-modularization with the spec already committed**

```bash
git status --short
git branch --show-current
git log --oneline -3
```

Expected:
- `git status --short` empty (no uncommitted changes)
- branch = `feat/final-modularization`
- top of log = the spec commit (`docs: add final-modularization design spec`)

If not on the feature branch, run:
```bash
git checkout feat/final-modularization
```

- [ ] **Step 2: Set up the deno PATH and confirm version**

```bash
export PATH="$HOME/.deno/bin:$PATH"
deno --version
```

Expected: `deno 2.7.x` or newer. The PATH export is needed for every shell that runs deno tasks — repeat at the top of any new shell session.

- [ ] **Step 3: Verify a clean baseline runs**

```bash
export PATH="$HOME/.deno/bin:$PATH"
deno task check && deno task test && deno task build
```

All three must pass. If any fails, STOP — the branch is not in a sane starting state.

- [ ] **Step 4: Survey the index.html line numbers this plan references**

```bash
grep -nE "^      (async )?function (tryWebGPU|startCanvas2D|initAudio|generatePhrase|scheduleBar|drawVis|changeMood|applyWarp|applySettingToAudio|buildIR|playKick|playSnare|playHat|playRhodes|playVibraphone|playGuitar|playPad|playCelesta|playComp|playMelody|playBass)\b" index.html
```

Expected (approximate, ±2 lines):
```
751: tryWebGPU
1000: startCanvas2D
1254: initAudio
1407: applyWarp
1411: buildIR
1733: playRhodes
1769: playVibraphone
1804: playGuitar
1844: playPad
1878: playCelesta
1911: playComp
1918: playMelody
1926: playBass
1980: playKick
2007: playSnare
2030: playHat
2082: generatePhrase
2146: scheduleBar
2439: drawVis
2680: applySettingToAudio
2783: changeMood
```

If lines have shifted by more than ~5 in any direction, the inline structure has changed since this plan was written — pause and re-check before extracting.

---

## Commit A — Scaffolding + store

**Files:**
- Create: `src/store.ts`
- Create: `src/state-init.ts`
- Modify: `src/types.ts` (add `AppState`, `AudioRefs`, `MoodSettings`)
- Create: `tests/store.test.ts`
- Create: empty directories `src/audio/`, `src/visual/`, `src/ui/` (via placeholder files removed at end of commit, or simply created lazily by later commits)

No runtime change in this commit. The store is added, types are added, the bridge in `index.html` is unchanged.

### Task 2: Extend types.ts with AppState, AudioRefs, MoodSettings

- [ ] **Step 1: Re-read the current types.ts**

Already seen in pre-flight context. Note that `Settings` is `readonly` for the per-mood defaults. The runtime `MoodSettings` is a mutable copy.

- [ ] **Step 2: Add new types at the bottom of `src/types.ts`**

Use Edit to append the following after the existing `Settings` interface (after line 88):

```ts

/**
 * Per-mood mutable mixer state. Same shape as `Settings` but mutable so
 * sliders can write to it during runtime.
 */
export interface MoodSettings {
  drums: number;
  bass: number;
  comp: number;
  melody: number;
  hiss: number;
  scratches: number;
  hum: number;
  warp: number;
  ambience: number;
  rain: number;
  reverb: number;
  complexity: number;
  vol: number;
}

/**
 * Reactive application state held by the store. Audio node references and
 * scheduler-internal state are intentionally NOT in here — see the design
 * spec for rationale.
 */
export interface AppState {
  currentMood: Mood;
  isPlaying: boolean;
  complexity: number;
  moodSettings: Record<Mood, MoodSettings>;
  currentSettings: MoodSettings;
}

/**
 * Bag of audio node references built by `initAudio`. Owned by
 * `src/audio/graph.ts` and passed explicitly to scheduler and cascade
 * wirers. Methods on this bag (rebuildReverbIR, restartAmbience, applyWarp,
 * applySettingToAudio) are exported as free functions from `audio/graph.ts`
 * that take an `AudioRefs` as their first argument.
 */
export interface AudioRefs {
  readonly actx: AudioContext;
  readonly masterGain: GainNode;
  readonly compressor: DynamicsCompressorNode;
  readonly lowShelf: BiquadFilterNode;
  readonly highShelf: BiquadFilterNode;
  readonly dryGain: GainNode;
  readonly wetGain: GainNode;
  readonly convolver: ConvolverNode;
  readonly analyser: AnalyserNode;
  readonly trackGains: Record<string, GainNode>;
  readonly warpModGain: GainNode;
  readonly humGain: GainNode;
  readonly ambienceGain: GainNode;
}
```

- [ ] **Step 3: Verify the file still type-checks**

```bash
export PATH="$HOME/.deno/bin:$PATH"
deno check src/types.ts
```

Expected: passes (no exports used yet outside, so type-only changes are fine).

### Task 3: Implement src/store.ts (Zustand-style)

- [ ] **Step 1: Write the failing tests first**

Create `tests/store.test.ts`:

```ts
import { assertEquals, assertStrictEquals } from "jsr:@std/assert@^1";
import { createStore } from "../src/store.ts";

interface TestState {
  count: number;
  name: string;
}

const initial = (): TestState => ({ count: 0, name: "init" });

Deno.test("store.get returns the current state", () => {
  const store = createStore<TestState>(initial());
  assertEquals(store.get(), { count: 0, name: "init" });
});

Deno.test("store.set with a partial object merges into state", () => {
  const store = createStore<TestState>(initial());
  store.set({ count: 5 });
  assertEquals(store.get(), { count: 5, name: "init" });
});

Deno.test("store.set with a function receives current state and returns partial", () => {
  const store = createStore<TestState>(initial());
  store.set((s) => ({ count: s.count + 10 }));
  store.set((s) => ({ count: s.count + 10 }));
  assertEquals(store.get().count, 20);
});

Deno.test("store.subscribe fires when the selected slice changes", () => {
  const store = createStore<TestState>(initial());
  const events: Array<[number, number]> = [];
  store.subscribe(
    (s) => s.count,
    (next, prev) => events.push([next, prev]),
  );
  store.set({ count: 1 });
  store.set({ count: 2 });
  assertEquals(events, [[1, 0], [2, 1]]);
});

Deno.test("store.subscribe does NOT fire when an unselected slice changes", () => {
  const store = createStore<TestState>(initial());
  const events: number[] = [];
  store.subscribe(
    (s) => s.count,
    (next) => events.push(next),
  );
  store.set({ name: "changed" });
  store.set({ name: "changed-again" });
  assertEquals(events, []);
});

Deno.test("store.subscribe returns an unsubscribe function", () => {
  const store = createStore<TestState>(initial());
  const events: number[] = [];
  const unsub = store.subscribe(
    (s) => s.count,
    (next) => events.push(next),
  );
  store.set({ count: 1 });
  unsub();
  store.set({ count: 2 });
  assertEquals(events, [1]);
});

Deno.test("store.subscribe with object selector uses referential equality", () => {
  const store = createStore<TestState>(initial());
  const events: TestState[] = [];
  store.subscribe(
    (s) => s,
    (next) => events.push(next),
  );
  store.set({ count: 1 });
  // Same value via function-form set produces a new state object — fires.
  store.set((s) => ({ count: s.count }));
  assertEquals(events.length, 2);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
export PATH="$HOME/.deno/bin:$PATH"
deno task test
```

Expected: `tests/store.test.ts` errors with "could not find module" or similar. The rest pass.

- [ ] **Step 3: Implement `src/store.ts`**

Create `src/store.ts`:

```ts
/**
 * Tiny Zustand-style reactive store. Holds a single state object, supports
 * partial updates via `set`, and slice-selective subscriptions via `subscribe`.
 *
 * Listeners fire only when the value returned by their selector changes
 * (referential equality, `Object.is`). State is replaced atomically on each
 * `set` so reading an old reference always shows the pre-update value.
 */

type Listener<U> = (next: U, prev: U) => void;

interface Subscription<T, U> {
  selector: (state: T) => U;
  listener: Listener<U>;
  lastValue: U;
}

export interface Store<T> {
  get(): T;
  set(partial: Partial<T> | ((state: T) => Partial<T>)): void;
  subscribe<U>(
    selector: (state: T) => U,
    listener: Listener<U>,
  ): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state: T = initial;
  // deno-lint-ignore no-explicit-any
  const subs = new Set<Subscription<T, any>>();

  function get(): T {
    return state;
  }

  function set(
    partial: Partial<T> | ((state: T) => Partial<T>),
  ): void {
    const next = typeof partial === "function" ? partial(state) : partial;
    state = { ...state, ...next };
    for (const sub of subs) {
      const newValue = sub.selector(state);
      if (!Object.is(newValue, sub.lastValue)) {
        const prev = sub.lastValue;
        sub.lastValue = newValue;
        sub.listener(newValue, prev);
      }
    }
  }

  function subscribe<U>(
    selector: (state: T) => U,
    listener: Listener<U>,
  ): () => void {
    const sub: Subscription<T, U> = {
      selector,
      listener,
      lastValue: selector(state),
    };
    subs.add(sub);
    return () => {
      subs.delete(sub);
    };
  }

  return { get, set, subscribe };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
export PATH="$HOME/.deno/bin:$PATH"
deno task test
```

Expected: all tests pass, including 7 new store tests.

### Task 4: Implement src/state-init.ts

- [ ] **Step 1: Create `src/state-init.ts`**

```ts
import { DEFAULT_SETTINGS } from "./music/settings.ts";
import type { AppState, Mood, MoodSettings, Settings } from "./types.ts";

const MOODS: readonly Mood[] = ["rainy", "late", "cafe", "sleepy"];

/**
 * Deep-clone the readonly per-mood Settings into mutable MoodSettings.
 */
function cloneSettings(s: Settings): MoodSettings {
  return {
    drums: s.drums,
    bass: s.bass,
    comp: s.comp,
    melody: s.melody,
    hiss: s.hiss,
    scratches: s.scratches,
    hum: s.hum,
    warp: s.warp,
    ambience: s.ambience,
    rain: s.rain,
    reverb: s.reverb,
    complexity: s.complexity,
    vol: s.vol,
  };
}

/**
 * Build the initial AppState. Per-mood mixer values are cloned from
 * DEFAULT_SETTINGS so sliders mutating them don't pollute the source-of-truth
 * defaults.
 */
export function initialAppState(): AppState {
  const moodSettings = {} as Record<Mood, MoodSettings>;
  for (const m of MOODS) {
    moodSettings[m] = cloneSettings(DEFAULT_SETTINGS[m]);
  }
  return {
    currentMood: "rainy",
    isPlaying: false,
    complexity: moodSettings.rainy.complexity,
    moodSettings,
    currentSettings: moodSettings.rainy,
  };
}
```

- [ ] **Step 2: Verify type-check passes**

```bash
export PATH="$HOME/.deno/bin:$PATH"
deno task check
```

Expected: passes.

### Task 5: Verify, format, lint, build, and commit Group A

- [ ] **Step 1: Full verification**

```bash
export PATH="$HOME/.deno/bin:$PATH"
deno task check && deno task test && deno task build
```

All three must pass. If `deno fmt --check` fails, run `deno task fix` first then re-run check.

- [ ] **Step 2: Stage and commit**

```bash
git add src/store.ts src/state-init.ts src/types.ts tests/store.test.ts
git status --short
git commit -m "$(cat <<'EOF'
feat(store): add Zustand-style reactive store + initial AppState

A tiny createStore<T>(initial) returns get/set/subscribe with slice-selective
listeners that fire only when their selector value changes (Object.is). No
runtime wiring yet — this commit only adds the scaffolding plus AppState,
AudioRefs, MoodSettings type declarations and an initialAppState() factory.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Commit B — Music: phrase + drum patterns

**Files:**
- Create: `src/music/phrase.ts`
- Create: `src/music/drum-patterns.ts`
- Create: `tests/phrase.test.ts`
- Modify: `src/main.ts` (extend re-exports)
- Modify: `index.html` bridge `<script type="module">` (expose new exports on window)

After this commit, the inline `generatePhrase` and drum-pattern constants still exist and still take precedence (they're declared inside the `lofi:ready` wrapper). The module versions exist alongside them as future call targets and get tested by deno. Inline removal happens in commit C alongside the audio extraction.

### Task 6: Implement src/music/drum-patterns.ts

- [ ] **Step 1: Read the inline drum patterns**

```bash
sed -n '2054,2059p' /Users/petethorne/Documents/Projects/lofi-stream/index.html
```

Expected (mirrors the constants you'll port):
```
      const KICK_PAT_NORMAL = [1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0];
      const KICK_PAT_SOFT = [1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0];
      const SNARE_PAT = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
      const GHOST_PAT = [0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0];
      const HAT_PAT = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0];
      const OPEN_PAT = [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0];
```

- [ ] **Step 2: Create `src/music/drum-patterns.ts`**

```ts
/**
 * 16th-note drum pattern arrays. Each is a 16-element array of 0/1.
 * Scheduled by scheduleBar at 16 swung positions per bar.
 */
export const KICK_PAT_NORMAL: readonly number[] = [
  1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0,
];
/** Sleepy/late variant — simpler. */
export const KICK_PAT_SOFT: readonly number[] = [
  1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0,
];
export const SNARE_PAT: readonly number[] = [
  0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0,
];
export const GHOST_PAT: readonly number[] = [
  0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0,
];
export const HAT_PAT: readonly number[] = [
  1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
];
export const OPEN_PAT: readonly number[] = [
  0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0,
];
```

### Task 7: Implement src/music/phrase.ts with injectable RNG

- [ ] **Step 1: Read the inline generatePhrase**

```bash
sed -n '2082,2145p' /Users/petethorne/Documents/Projects/lofi-stream/index.html
```

Capture the full function body to port. (It's roughly 60 lines.)

- [ ] **Step 2: Write the failing tests first**

Create `tests/phrase.test.ts`:

```ts
import { assertEquals } from "jsr:@std/assert@^1";
import { generatePhrase } from "../src/music/phrase.ts";
import type { Chord } from "../src/types.ts";

const PROG: readonly [Chord, Chord, Chord, Chord] = [
  [0, "min7"],
  [5, "min7"],
  [8, "maj7"],
  [3, "min7"],
];

/**
 * Mulberry32 — small deterministic PRNG suitable for structural tests.
 * Returns a function with the same shape as Math.random.
 */
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

Deno.test("generatePhrase returns 4 bars", () => {
  const phrase = generatePhrase(PROG, mulberry32(1));
  assertEquals(phrase.length, 4);
});

Deno.test("generatePhrase: each bar contains one or more notes", () => {
  const phrase = generatePhrase(PROG, mulberry32(42));
  for (const bar of phrase) {
    if (bar.length === 0) {
      throw new Error(`empty bar found: ${JSON.stringify(bar)}`);
    }
  }
});

Deno.test("generatePhrase: all notes have valid midi (60..96) and beat (0..4)", () => {
  const phrase = generatePhrase(PROG, mulberry32(7));
  for (const bar of phrase) {
    for (const note of bar) {
      if (note.midi < 60 || note.midi > 96) {
        throw new Error(`midi ${note.midi} out of range`);
      }
      if (note.beat < 0 || note.beat >= 4) {
        throw new Error(`beat ${note.beat} out of range`);
      }
      if (note.dur <= 0 || note.dur > 4) {
        throw new Error(`dur ${note.dur} out of range`);
      }
    }
  }
});

Deno.test("generatePhrase: deterministic with seeded RNG", () => {
  const a = generatePhrase(PROG, mulberry32(123));
  const b = generatePhrase(PROG, mulberry32(123));
  assertEquals(a, b);
});

Deno.test("generatePhrase: different seeds produce different output", () => {
  const a = generatePhrase(PROG, mulberry32(1));
  const b = generatePhrase(PROG, mulberry32(2));
  // Highly unlikely two different seeds produce identical 4-bar phrases.
  // If this ever asserts equal, generatePhrase has lost its dependency on rng.
  const same = JSON.stringify(a) === JSON.stringify(b);
  if (same) throw new Error("expected different output from different seeds");
});

Deno.test("generatePhrase: default rng is Math.random (call shape)", () => {
  // Smoke: omit rng arg, must not throw.
  const phrase = generatePhrase(PROG);
  assertEquals(phrase.length, 4);
});
```

- [ ] **Step 3: Run tests to confirm failure**

```bash
export PATH="$HOME/.deno/bin:$PATH"
deno task test
```

Expected: phrase tests fail with "could not find module ../src/music/phrase.ts".

- [ ] **Step 4: Port the inline generatePhrase to `src/music/phrase.ts`**

Port `generatePhrase` from `index.html` lines 2082–2145 verbatim, with these adaptations:
- Wrap with a `(prog, rng = Math.random)` signature.
- Replace every `Math.random()` call with `rng()` — count them in the inline source first to verify the port preserves the order.
- Replace every call to `rand(a, b)` with the inline form `a + rng() * (b - a)` (since `rand` is module-scope in `index.html`; we want phrase.ts to be self-contained without importing helpers we'll just delete).
- Import `melodyOct` from `./octaves.ts`.
- Declare a `PhraseNote` type and export it; declare a `Bar = readonly PhraseNote[]` and `Phrase = readonly [Bar, Bar, Bar, Bar]` (the function returns 4 bars).

Skeleton:

```ts
import { melodyOct } from "./octaves.ts";
import { VOICINGS } from "./voicings.ts";
import type { Chord } from "../types.ts";

export interface PhraseNote {
  readonly beat: number;
  readonly midi: number;
  readonly dur: number;
}

export type Bar = readonly PhraseNote[];
export type Phrase = readonly [Bar, Bar, Bar, Bar];

/**
 * Generate a 4-bar melodic phrase over a 4-chord progression.
 *
 * The returned phrase mirrors the original inline implementation. RNG is
 * injectable for tests; defaults to Math.random for byte-identical runtime
 * behaviour. `rng` is called in the same order as the original inline code
 * — preserving distribution under the default RNG is a hard requirement.
 */
export function generatePhrase(
  prog: readonly [Chord, Chord, Chord, Chord],
  rng: () => number = Math.random,
): Phrase {
  // [Body ported from index.html lines 2082-2145. Replace Math.random() -> rng().
  //  Replace rand(a, b) -> a + rng() * (b - a). Replace randInt -> Math.floor(rng()*N).
  //  Replace pick(arr) -> arr[Math.floor(rng() * arr.length)]. Read each replacement
  //  from the inline source to verify the order is preserved.]
  // ...
}
```

> **Important:** Don't write the body from scratch — port it from `index.html`. Use Read with `offset: 2082, limit: 64` on `index.html` to get the inline source, then mechanically substitute the calls described above.

- [ ] **Step 5: Run tests until they pass**

```bash
export PATH="$HOME/.deno/bin:$PATH"
deno task test
```

Expected: 6 new phrase tests pass.

### Task 8: Re-export new modules from main.ts and bridge to window

- [ ] **Step 1: Extend src/main.ts re-exports**

Use Edit. Find the existing export block in `src/main.ts` (lines 8–15). Add after the existing `walkingBassNotes` re-export:

```ts
export { generatePhrase } from "./music/phrase.ts";
export type { Bar, Phrase, PhraseNote } from "./music/phrase.ts";

export {
  GHOST_PAT,
  HAT_PAT,
  KICK_PAT_NORMAL,
  KICK_PAT_SOFT,
  OPEN_PAT,
  SNARE_PAT,
} from "./music/drum-patterns.ts";
```

- [ ] **Step 2: Extend the inline bridge in index.html to expose new exports on window**

The bridge module was added in Phase 4. Use Edit. Find this section in `index.html`:

```html
    <script type="module">
      // Phase 4 bridge: import the modules built in Phases 2 and 3 and expose
      // them on `window`, then signal readiness so the classic inline script
      // (which is wrapped in a `lofi:ready` listener) can run.
      import {
        VOICINGS,
        FORMS,
        MOOD_META,
        DEFAULT_SETTINGS,
        bassOct,
        melodyOct,
        walkingBassNotes,
        nextFormPosition,
        currentSectionProg as currentSectionProgPure,
        DEFAULT_PROG,
      } from "./dist/main.js";
```

Add to the import list (preserve alphabetical-ish ordering — slot before `walkingBassNotes`):

```ts
        GHOST_PAT,
        HAT_PAT,
        KICK_PAT_NORMAL,
        KICK_PAT_SOFT,
        OPEN_PAT,
        SNARE_PAT,
        generatePhrase,
```

And to the `Object.assign(window, { ... })` call, add the same names. The result should look like (full block for clarity):

```html
    <script type="module">
      import {
        DEFAULT_PROG,
        DEFAULT_SETTINGS,
        FORMS,
        GHOST_PAT,
        HAT_PAT,
        KICK_PAT_NORMAL,
        KICK_PAT_SOFT,
        MOOD_META,
        OPEN_PAT,
        SNARE_PAT,
        VOICINGS,
        bassOct,
        currentSectionProg as currentSectionProgPure,
        generatePhrase,
        melodyOct,
        nextFormPosition,
        walkingBassNotes,
      } from "./dist/main.js";

      Object.assign(window, {
        DEFAULT_PROG,
        DEFAULT_SETTINGS,
        FORMS,
        GHOST_PAT,
        HAT_PAT,
        KICK_PAT_NORMAL,
        KICK_PAT_SOFT,
        MOOD_META,
        OPEN_PAT,
        SNARE_PAT,
        VOICINGS,
        bassOct,
        currentSectionProgPure,
        generatePhrase,
        melodyOct,
        nextFormPosition,
        walkingBassNotes,
      });

      window.dispatchEvent(new Event("lofi:ready"));
    </script>
```

(The original Phase 4 bridge had a slightly different ordering. The above sorts alphabetically for stability — preserve the original style if you prefer; the point is that the new names are added.)

> **Note:** The inline drum-pattern constants in `index.html` lines 2054–2059 still exist and still take precedence over `window.KICK_PAT_NORMAL` etc. inside the `lofi:ready` wrapper. They get removed in commit C alongside the drum-playing functions that read them. Same for `generatePhrase`.

### Task 9: Verify, format, build, commit Group B

- [ ] **Step 1: Full verification**

```bash
export PATH="$HOME/.deno/bin:$PATH"
deno task check && deno task test && deno task build
```

All three pass. Phrase tests bring the total up by 6.

- [ ] **Step 2: Smoke-test the dev server**

```bash
export PATH="$HOME/.deno/bin:$PATH"
deno task dev &
DEV_PID=$!
sleep 2
echo "index: $(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/index.html)"
echo "dist: $(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/dist/main.js)"
kill $DEV_PID 2>/dev/null
wait $DEV_PID 2>/dev/null
```

Expected: both 200. If port 8000 is busy, skip and continue.

- [ ] **Step 3: Stage and commit**

```bash
git add src/music/phrase.ts src/music/drum-patterns.ts src/main.ts tests/phrase.test.ts index.html
git status --short
git commit -m "$(cat <<'EOF'
feat(music): extract generatePhrase + drum patterns to modules

generatePhrase ports verbatim from the inline version with an injectable
rng parameter (defaults to Math.random — runtime byte-identical). Adds
structural tests: 4 bars returned, valid MIDI/beat/dur ranges, determinism
under seeded RNG, divergence under different seeds.

Drum pattern constants (KICK/SNARE/HAT/GHOST/OPEN) move to a small
src/music/drum-patterns.ts. The window bridge exposes both, but inline
declarations still take precedence — they get removed in commit C
alongside the drum and instrument functions that read them.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Commit C — Audio graph + instruments + ambience

**Files:**
- Create: `src/audio/graph.ts`
- Create: `src/audio/instruments.ts`
- Create: `src/audio/ambience.ts`
- Modify: `src/main.ts` (re-export `initAudio`, `AudioRefs` builder, helpers)
- Modify: `index.html` bridge + inline (replace inline definitions with calls to `await initAudio(store)` and friends)

This is the biggest commit. After it, the audio graph, all the `build*`/`play*` instrument functions, the ambience generators, and `applySettingToAudio` are no longer inline. The inline scheduler still calls them via `window.*`.

**Architecture choice:** `initAudio` returns an `AudioRefs` bag (no mutable module-scope `actx` etc.). Instrument and ambience modules accept `audio: AudioRefs` as their first parameter. `applySettingToAudio` becomes `applySettingToAudio(audio, key, val)`.

### Task 10: Extract ambience to src/audio/ambience.ts

- [ ] **Step 1: Identify the inline range**

Functions to move (line numbers from pre-flight survey):
- `noiseBuffer` (1458)
- `makeLoopedNoise` (1471)
- `loopedNoise` (1491)
- `buildAmbienceForMood` (1497)
- `scheduleSiren` (1523)
- `scheduleClink` (1553)
- `buildRainLayers` (1579)
- `startAmbience` (1449)
- `stopAmbience` (1440)
- `applyMoodReverb` (1431)

Also helper closures inside this range that don't escape (e.g. `makeDistanceChain` at 1609, `makeSpatial` at 1622, `makeHaasSpatial` at 1634 — these are used by ambience and instruments, so they need to live somewhere shared). Move them to `src/audio/graph.ts` as exported helpers (see Task 11).

- [ ] **Step 2: Create `src/audio/ambience.ts` skeleton**

```ts
import type { AudioRefs, Mood } from "../types.ts";
import { makeSpatial } from "./graph.ts";

/**
 * Module-scope refs to the currently-running ambience sources. Tracked so
 * stopAmbience can disconnect them on mood change.
 */
let currentSources: AudioNode[] = [];

/**
 * Build a 1-channel or 2-channel noise buffer of the given length in
 * seconds. Used by tape hiss, ambience layers, and the reverb IR builder
 * (the reverb IR builder is in graph.ts and has its own copy).
 */
export function noiseBuffer(
  actx: AudioContext,
  secs: number,
  stereo = false,
): AudioBuffer {
  // [Port lines 1458-1469 from index.html. Replace `actx.` refs (the inline
  // function captures `actx` from the IIFE scope; we now take it explicitly).]
  // ...
}

// makeLoopedNoise, loopedNoise, buildAmbienceForMood, scheduleSiren,
// scheduleClink, buildRainLayers — same pattern: accept (audio: AudioRefs)
// where the inline used closed-over actx/masterGain/etc.

export function stopAmbience(): void {
  for (const s of currentSources) {
    try {
      (s as AudioBufferSourceNode | OscillatorNode).stop();
    } catch (_) {
      // already stopped
    }
    s.disconnect();
  }
  currentSources = [];
}

export function startAmbience(audio: AudioRefs, mood: Mood): void {
  // [Port lines 1449-1456. Use the mood to dispatch to buildAmbienceForMood
  //  and push returned sources into currentSources.]
  // ...
}
```

- [ ] **Step 3: Port each function from index.html line-by-line**

For each function listed in Step 1, port it into `src/audio/ambience.ts` with these mechanical substitutions:
- Closed-over `actx` → first parameter `audio: AudioRefs` and use `audio.actx` (or accept just `actx: AudioContext` for the small leaf helpers like `noiseBuffer`).
- Closed-over `masterGain`, `ambienceGain`, `wetGain`, `dryGain` → `audio.masterGain` etc.
- `Math.random()` → leave as-is (ambience is visual/atmospheric).
- Any reference to `MOOD_META[mood]` → import `MOOD_META` from `"../music/moods.ts"`.

> **Verification along the way:** after each function is ported, run `deno task check` to keep the type system honest.

### Task 11: Extract audio graph + spatial helpers to src/audio/graph.ts

- [ ] **Step 1: Identify ranges**

Functions to move:
- `initAudio` (1254-1405)
- `applyWarp` (1407-1409)
- `buildIR` (1411-1429)
- `applyMoodReverb` (1431-1438)
- `makeDistanceChain` (1609-1620)
- `makeSpatial` (1622-1633)
- `makeHaasSpatial` (1634-1665)
- `applySettingToAudio` (2680-2774)

Plus mood-cascade and mixer-cascade wirers (new — not in inline code today).

- [ ] **Step 2: Create the module skeleton**

```ts
import { MOOD_META } from "../music/moods.ts";
import { startAmbience, stopAmbience } from "./ambience.ts";
import type { AppState, AudioRefs, Mood, MoodSettings } from "../types.ts";
import type { Store } from "../store.ts";

/**
 * Build the full audio graph. Must be called from inside a user gesture
 * (Web Audio constraint). Returns the AudioRefs bag — pass it explicitly
 * to scheduler, instruments, ambience, and cascade wirers; do NOT stash
 * it on window or in a global.
 *
 * Init order matters:
 *   1. Create AudioContext
 *   2. Master bus (compressor + tape filters + masterGain)
 *   3. Reverb (convolver with per-mood IR) and dry/wet split
 *   4. Analyser at the end of the bus
 *   5. Per-track gain nodes (drums/bass/comp/melody/hiss/scratches/ambience/hum)
 *   6. Warp LFO bus (must exist before any oscillator is applyWarp'd)
 *   7. Start tape hiss + scratches + ambience for current mood
 */
export async function initAudio(store: Store<AppState>): Promise<AudioRefs> {
  // [Port the body of inline initAudio (lines 1254-1405). Read each piece
  //  from the inline source and build it here, returning the AudioRefs bag.
  //  Replace closed-over module-scope `let` declarations with const bindings
  //  built inside this function and returned in the bag.]
  // ...
  // const actx = new AudioContext();
  // ...
  // return { actx, masterGain, compressor, lowShelf, highShelf, dryGain, wetGain,
  //          convolver, analyser, trackGains, warpModGain, humGain, ambienceGain };
}

export function applyWarp(audio: AudioRefs, osc: OscillatorNode): void {
  // Port lines 1407-1409: connect audio.warpModGain to osc.detune.
}

export function buildIR(
  audio: AudioRefs,
  dur: number,
  decay: number,
): AudioBuffer {
  // Port lines 1411-1429. Uses audio.actx.
}

export function applyMoodReverb(audio: AudioRefs, mood: Mood): void {
  // Port lines 1431-1438. Calls buildIR with MOOD_META[mood].reverb.
  const m = MOOD_META[mood];
  audio.convolver.buffer = buildIR(audio, m.reverb.dur, m.reverb.decay);
}

export function makeDistanceChain(
  audio: AudioRefs,
  s: { /* matches SPATIAL.role shape */ },
): /* return type from inline */ {
  // Port lines 1609-1620.
}

export function makeSpatial(audio: AudioRefs, role: string): AudioNode {
  // Port lines 1622-1633. Returns a connected GainNode/PannerNode chain end.
}

export function makeHaasSpatial(
  audio: AudioRefs,
  role: string,
  delayMs = 14,
): AudioNode {
  // Port lines 1634-1665.
}

export function applySettingToAudio(
  audio: AudioRefs,
  key: keyof MoodSettings,
  val: number,
): void {
  // Port lines 2680-2774. Switch on key — each branch writes to the
  // appropriate AudioParam on audio.<node>. Replace closed-over names with
  // audio.<name>.
}

/**
 * Subscribe the mood-change cascade. On store.currentMood change:
 *   - fade master gain down
 *   - rebuild reverb IR
 *   - stop+restart ambience for the new mood
 *   - call resetSchedulerStateForMoodChange()
 *   - swap currentSettings in the store
 *   - fade master gain up to the new mood's stored volume
 */
export function wireMoodCascade(
  store: Store<AppState>,
  audio: AudioRefs,
  resetSchedulerStateForMoodChange: () => void,
): () => void {
  return store.subscribe(
    (s) => s.currentMood,
    async (newMood, oldMood) => {
      if (newMood === oldMood) return;
      const actx = audio.actx;
      const t = actx.currentTime;
      // Fade-down (port from inline changeMood ~line 2783-2820).
      audio.masterGain.gain.cancelScheduledValues(t);
      audio.masterGain.gain.setValueAtTime(audio.masterGain.gain.value, t);
      audio.masterGain.gain.linearRampToValueAtTime(0, t + 0.7);
      await new Promise((r) => setTimeout(r, 700));

      applyMoodReverb(audio, newMood);
      stopAmbience();
      startAmbience(audio, newMood);
      resetSchedulerStateForMoodChange();

      const newSettings = store.get().moodSettings[newMood];
      store.set({ currentSettings: newSettings });

      const t2 = actx.currentTime;
      const targetVol = newSettings.vol;
      audio.masterGain.gain.cancelScheduledValues(t2);
      audio.masterGain.gain.setValueAtTime(0, t2);
      audio.masterGain.gain.linearRampToValueAtTime(targetVol, t2 + 1.2);
    },
  );
}

/**
 * Subscribe the mixer cascade. On store.currentSettings change (typically
 * after a mood swap), re-apply every slider value to its audio param.
 */
export function wireMixerCascade(
  store: Store<AppState>,
  audio: AudioRefs,
): () => void {
  return store.subscribe(
    (s) => s.currentSettings,
    (next) => {
      for (const key of Object.keys(next) as Array<keyof MoodSettings>) {
        applySettingToAudio(audio, key, next[key]);
      }
    },
  );
}
```

- [ ] **Step 3: Port instrument functions to src/audio/instruments.ts**

Functions to move (line numbers from pre-flight):
- `playRhodes` (1733), `playVibraphone` (1769), `playGuitar` (1804), `playPad` (1844), `playCelesta` (1878)
- `playComp` (1911) — the family dispatcher
- `playMelody` (1918), `playBass` (1926)
- `playKick` (1980), `playSnare` (2007), `playHat` (2030)
- `playVinylScratch` (1667), `startScratches` (1710), `startTapeHiss` (1719)
- `midiToFreq` (1168) — utility used here, keep it in instruments.ts as a helper
- `beatDur` (2061), `swungTime` (2064) — used by scheduler; export from instruments.ts or move to a separate `src/audio/timing.ts`. Choose instruments.ts for simplicity (the scheduler imports them from there).
- `flashRow` (1964) — visual side-effect. Keep here if simple; otherwise move to `src/visual/`. (Decide based on call sites — likely a small enough function to leave with the instruments that call it.)

Skeleton:

```ts
import { MOOD_META } from "../music/moods.ts";
import { applyWarp, makeSpatial, makeHaasSpatial } from "./graph.ts";
import { noiseBuffer } from "./ambience.ts";
import type { AudioRefs, Mood, Timbre } from "../types.ts";

export function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export function beatDur(bpm: number): number {
  return 60 / bpm;
}

export function swungTime(i: number, barStart: number, bpm: number, swing: number): number {
  // Port lines 2064-2076.
}

export function playKick(audio: AudioRefs, time: number, mood: Mood): void {
  // Port lines 1980-2005. Replace closed-over actx/trackGains/drums with audio.*.
}

// ... playSnare, playHat, playRhodes, playVibraphone, playGuitar, playPad,
//     playCelesta, playMelody, playBass, playVinylScratch, startScratches,
//     startTapeHiss, flashRow ...

/**
 * Dispatch a comp/melody timbre choice to the right play* function.
 * Inline name: `playComp` / `playMelody`. Same dispatch logic.
 */
export function playComp(
  audio: AudioRefs,
  midi: number,
  time: number,
  dur: number,
  vel: number,
  role: string,
  timbre: Timbre,
): void {
  switch (timbre) {
    case "rhodes": return playRhodes(audio, midi, time, dur, vel, role);
    case "vibraphone": return playVibraphone(audio, midi, time, dur, vel, role);
    case "guitar": return playGuitar(audio, midi, time, dur, vel, role);
    case "pad": return playPad(audio, midi, time, dur, vel, role);
    case "celesta": return playCelesta(audio, midi, time, dur, vel, role);
  }
}
```

- [ ] **Step 4: Verify type-check on the new files**

```bash
export PATH="$HOME/.deno/bin:$PATH"
deno task check
```

Expected: passes. Initially you may have to stub function bodies — that's OK as long as they type-check.

### Task 12: Remove the inline duplicates and wire inline to call modules

After Task 11, `src/audio/graph.ts`, `src/audio/instruments.ts`, and `src/audio/ambience.ts` exist with correctly-ported function bodies. Now we delete the inline copies and have the inline scheduler call the module versions.

- [ ] **Step 1: Extend main.ts re-exports**

```ts
export { initAudio, applyWarp, applySettingToAudio, applyMoodReverb,
         wireMoodCascade, wireMixerCascade } from "./audio/graph.ts";
export { playKick, playSnare, playHat, playRhodes, playVibraphone, playGuitar,
         playPad, playCelesta, playComp, playMelody, playBass, playVinylScratch,
         startScratches, startTapeHiss, flashRow, midiToFreq, beatDur, swungTime,
       } from "./audio/instruments.ts";
export { startAmbience, stopAmbience } from "./audio/ambience.ts";
```

- [ ] **Step 2: Update the inline bridge to expose all these on window**

Use Edit to add to both the `import { ... }` list and the `Object.assign(window, { ... })` block in `index.html`'s `<script type="module">`:

```
applyMoodReverb, applySettingToAudio, applyWarp,
beatDur, flashRow, initAudio as initAudioPure, midiToFreq,
playBass, playCelesta, playComp, playGuitar, playHat, playKick,
playMelody, playPad, playRhodes, playSnare, playVibraphone,
playVinylScratch, startAmbience, startScratches, startTapeHiss,
stopAmbience, swungTime,
wireMixerCascade, wireMoodCascade,
```

Rename `initAudio` to `initAudioPure` on the bridge to avoid shadowing the inline call sites that still write to `actx` etc. The inline `initAudio` will be the last thing replaced in commit E.

- [ ] **Step 3: Replace the bodies of the inline duplicates with calls into the module**

For each inline function that now has a module equivalent, replace the body with a one-liner. Example for `applyWarp`:

Find in `index.html`:
```js
      function applyWarp(osc) {
        // ...inline body...
      }
```

Replace with:
```js
      function applyWarp(osc) {
        return window.applyWarp(window.__audio, osc);
      }
```

> **Important:** The inline still has `actx`, `masterGain`, etc. as module-scope `let`s. To bridge inline-and-module, the inline `initAudio` (lines 1254-1405) will be replaced with:
>
> ```js
>       async function initAudio() {
>         const audio = await window.initAudioPure(window.__store);
>         actx = audio.actx;
>         masterGain = audio.masterGain;
>         // ...assign every other module-scope let from audio.<name>...
>         window.__audio = audio;
>       }
> ```
>
> This lets the inline `playKick`/`scheduleBar`/etc. keep reading `actx` etc. from inline scope while delegating actual node creation to the module. Later commits remove these inline `let`s entirely.

For `applySettingToAudio`, `playKick`, `playSnare`, `playHat`, `playRhodes`, …, `playBass`, `startAmbience`, `stopAmbience`, `playVinylScratch`, `startScratches`, `startTapeHiss`: replace the body with `return window.<name>(window.__audio, ...args)`.

The inline scheduler's `scheduleBar` keeps its current name and body but its `playKick(t)` calls now dispatch through these thin wrappers, which delegate to the module.

> **Note for the engineer:** This commit accepts the temporary `window.__audio` global. It's a bridge to keep inline scheduling working while audio is extracted. Commit E removes both the inline-let bridge and the `window.__audio` global by extracting the scheduler.

- [ ] **Step 4: Delete the inline drum-pattern constants**

The inline `KICK_PAT_NORMAL` etc. (lines 2054-2059) shadow the `window.*` versions. Now that the module has them, delete the inline declarations. The drum-playing wrappers (`playKick` etc., now thin) read `window.KICK_PAT_NORMAL` via plain scope — works.

- [ ] **Step 5: Initialise `window.__store` early**

Add to the bridge `<script type="module">` after `Object.assign(window, ...)`:

```ts
      // Build the store early so initAudio has it when invoked.
      import("./dist/main.js").then(({ createStore, initialAppState }) => {
        window.__store = createStore(initialAppState());
      });
```

Wait — `createStore` and `initialAppState` need re-exporting from `main.ts`. Add to its export block:

```ts
export { createStore } from "./store.ts";
export { initialAppState } from "./state-init.ts";
```

Simpler — put store construction directly in the bridge:

```ts
      import { createStore, initialAppState } from "./dist/main.js";
      window.__store = createStore(initialAppState());
```

Add these names to the import list at the top of the bridge as well.

### Task 13: Browser QA after commit C

**This step is a manual pause-for-user.** The plan executor should stop, report status, and wait for the human to confirm before proceeding.

- [ ] **Step 1: Run dev server**

```bash
export PATH="$HOME/.deno/bin:$PATH"
deno task build
deno task dev
```

- [ ] **Step 2: Open <http://localhost:8000> in a browser**

- [ ] **Step 3: Run the browser QA checklist from the spec**

1. Page loads, no console errors.
2. Click play. AudioContext starts. Music plays.
3. Each mood button switches mood with crossfade; reverb character changes audibly.
4. Each slider changes the expected audio property (drums vol, bass vol, master, reverb wet, tape colour, swing, warp, hiss, scratches, ambience, hum, comp brightness, stereo width).
5. Mixer state persists per mood — switch mood, change a slider, switch back, slider matches.
6. Background renders.
7. Bottom sheet drags up/down.
8. Frequency-band visualiser reacts to audio.
9. Click pause. Audio stops. Click play again. Resumes correctly.

If anything is broken, STOP and report — do not proceed to commit D.

### Task 14: Commit Group C

- [ ] **Step 1: Final verification**

```bash
export PATH="$HOME/.deno/bin:$PATH"
deno task check && deno task test && deno task build
```

All three pass.

- [ ] **Step 2: Commit**

```bash
git add src/audio/ src/main.ts index.html
git status --short
git commit -m "$(cat <<'EOF'
refactor(audio): extract graph, instruments, ambience to src/audio/

initAudio now returns an AudioRefs bag instead of stashing module-scope
lets. All play*/build*/start*/stop* functions accept AudioRefs as first
arg. applySettingToAudio, applyMoodReverb, wireMoodCascade, and
wireMixerCascade ship from src/audio/graph.ts.

Inline duplicates of these functions become thin window.* wrappers that
delegate to the modules — a temporary bridge so the inline scheduler
continues to work. Commit D extracts the scheduler and removes the
bridge.

Browser QA: play/pause/mood-change/sliders/ambience/background all
verified working before commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Commit D — Scheduler + visual

**Files:**
- Create: `src/audio/scheduler.ts`
- Create: `src/visual/webgpu.ts`, `src/visual/canvas2d.ts`, `src/visual/analyser.ts`, `src/visual/background.ts`
- Modify: `src/main.ts`, `index.html`

After this commit, the lookahead loop, `scheduleBar`, scheduler-internal state, the WebGPU/Canvas2D background, and the frequency-band visualiser all live in modules. The inline scheduler is reduced to a `startScheduler(store, audio)` call.

### Task 15: Extract the scheduler

- [ ] **Step 1: Identify the inline scheduler range**

- `scheduleBar` (2146-~2306)
- `scheduler` (2308-2339)
- `newProgression` (2341-~2390)
- Module-scope state: `currentForm`, `formSectionIdx`, `formBarInSection`, `formBarInProg`, `currentProgIdx`, `currentPhrase`, `phraseBarIdx`, `nextBarTime`, scheduler timer handle, `bpm`, `swingAmount`, current key

- [ ] **Step 2: Create `src/audio/scheduler.ts`**

```ts
import { MOOD_META } from "../music/moods.ts";
import { FORMS } from "../music/forms.ts";
import { VOICINGS } from "../music/voicings.ts";
import { generatePhrase, type Phrase } from "../music/phrase.ts";
import { currentSectionProg, DEFAULT_PROG, nextFormPosition } from "../music/playhead.ts";
import { walkingBassNotes } from "../music/bass.ts";
import { melodyOct } from "../music/octaves.ts";
import { KICK_PAT_NORMAL, KICK_PAT_SOFT, SNARE_PAT, GHOST_PAT, HAT_PAT, OPEN_PAT } from "../music/drum-patterns.ts";
import {
  playKick, playSnare, playHat, playComp, playMelody, playBass,
  beatDur, swungTime, flashRow,
} from "./instruments.ts";
import type { AppState, AudioRefs, Form, Mood } from "../types.ts";
import type { Store } from "../store.ts";

const SCHEDULER_INTERVAL_MS = 50;
const SCHEDULER_LOOKAHEAD_S = 3;

let currentForm: Form = [];
let formSectionIdx = 0;
let formBarInSection = 0;
let formBarInProg = 0;
let currentProgIdx = 0;
let currentPhrase: Phrase | null = null;
let phraseBarIdx = 0;
let bpm = 80;
let swingAmount = 0.08;
let currentKey = 0;
let nextBarTime = 0;
let timerHandle: number | null = null;

function newProgression(mood: Mood): void {
  // Port inline newProgression (lines 2341-2390). Pick a random key from
  // MOOD_META[mood].key_pool, set currentKey, set currentForm = FORMS[mood],
  // reset playhead vars.
}

function scheduleBar(audio: AudioRefs, store: Store<AppState>, barStart: number): void {
  // Port inline scheduleBar (lines 2146-~2306). Replace closed-over names:
  //   - actx -> audio.actx
  //   - playKick(t) -> playKick(audio, t, store.get().currentMood)
  //   - same for playSnare/playHat/playComp/playMelody/playBass
  //   - complexity -> store.get().complexity
  //   - currentForm/playhead/phrase/etc. -> these module-scope lets
  //   - Math.random() calls preserve their original order
}

function tick(audio: AudioRefs, store: Store<AppState>): void {
  // Port inline scheduler loop (lines 2308-2339). Schedule bars whose start
  // is within SCHEDULER_LOOKAHEAD_S of audio.actx.currentTime.
}

export function startScheduler(audio: AudioRefs, store: Store<AppState>): void {
  if (timerHandle != null) return;
  const mood = store.get().currentMood;
  newProgression(mood);
  nextBarTime = audio.actx.currentTime + 0.1;
  timerHandle = setInterval(() => tick(audio, store), SCHEDULER_INTERVAL_MS);
}

export function stopScheduler(): void {
  if (timerHandle != null) {
    clearInterval(timerHandle);
    timerHandle = null;
  }
}

export function resetSchedulerStateForMoodChange(mood: Mood): void {
  newProgression(mood);
  currentPhrase = null;
  phraseBarIdx = 0;
  formSectionIdx = 0;
  formBarInSection = 0;
  formBarInProg = 0;
}
```

- [ ] **Step 3: Re-export from main.ts**

```ts
export { startScheduler, stopScheduler, resetSchedulerStateForMoodChange }
  from "./audio/scheduler.ts";
```

- [ ] **Step 4: Update the inline scheduler call sites**

Replace the inline `scheduler()` call (look for the `setInterval` near line 2335-ish) and `newProgression()` call with thin pass-throughs to `window.startScheduler(window.__audio, window.__store)`.

The inline play-button click handler (around line 2545: `if (!actx) initAudio();`) becomes:

```js
        playBtn.addEventListener("click", async () => {
          if (!window.__store.get().isPlaying) {
            if (!window.__audio) {
              await initAudio(); // still calls inline initAudio which calls module + sets window.__audio
              window.wireMoodCascade(
                window.__store,
                window.__audio,
                () => window.resetSchedulerStateForMoodChange(window.__store.get().currentMood),
              );
              window.wireMixerCascade(window.__store, window.__audio);
            }
            window.startScheduler(window.__audio, window.__store);
            window.__store.set({ isPlaying: true });
          } else {
            window.stopScheduler();
            window.__store.set({ isPlaying: false });
          }
        });
```

- [ ] **Step 5: Delete inline `scheduleBar`, `scheduler`, `newProgression`, `generatePhrase`, `currentSectionProg`, `advanceFormPlayhead`, drum-pattern reads, `beatDur`, `swungTime`, plus the module-scope playhead `let`s**

These are all replaced by the module versions. Be careful: some inline names (e.g. `currentMood`, `complexity`) are read by other inline code that hasn't moved yet (UI handlers). Those names stay until commit E.

### Task 16: Extract the visual layer

- [ ] **Step 1: Move `tryWebGPU` to `src/visual/webgpu.ts`**

Inline range: 751-998. Function signature becomes:

```ts
export async function tryWebGPU(
  canvas: HTMLCanvasElement,
  getAmplitude: () => number,
  getMoodColours: () => { primary: string; accent: string },
): Promise<boolean>;
```

`getAmplitude` and `getMoodColours` are callbacks the visual module calls each frame — they read from the store inside `main.ts`.

- [ ] **Step 2: Move `startCanvas2D` to `src/visual/canvas2d.ts`**

Inline range: 1000-1135. Same callback shape as `tryWebGPU`.

- [ ] **Step 3: Move `drawVis` + `getAccentRgb` + `syncVisSize` to `src/visual/analyser.ts`**

Inline range: 2393-~2521. Function signature:

```ts
export function mountAnalyserVisualiser(
  canvas: HTMLCanvasElement,
  getAnalyser: () => AnalyserNode | null,
  getAccent: () => string,
): void;
```

Subscribes to `requestAnimationFrame` internally.

- [ ] **Step 4: Create `src/visual/background.ts` orchestrator**

```ts
import { tryWebGPU } from "./webgpu.ts";
import { startCanvas2D } from "./canvas2d.ts";
import type { AppState } from "../types.ts";
import type { Store } from "../store.ts";

export async function mountBackground(
  canvas: HTMLCanvasElement,
  store: Store<AppState>,
  getAmplitude: () => number,
): Promise<void> {
  const getMoodColours = () => {
    // Return primary/accent based on store.get().currentMood.
    // Port from inline MOOD_COLOURS (lines 743-...).
  };
  const ok = await tryWebGPU(canvas, getAmplitude, getMoodColours);
  if (!ok) startCanvas2D(canvas, getAmplitude, getMoodColours);
}
```

- [ ] **Step 5: Wire the visualiser amplitude reader**

The inline `updateBgAmplitude` (1141) reads from the analyser and stores in `bgAmplitude`. Move it into a small `src/audio/amplitude.ts` or expose `audio.analyser` directly. Simplest: `getAmplitude` reads `audio.analyser` via a closure provided by `main.ts`.

- [ ] **Step 6: Re-export and bridge**

```ts
// main.ts
export { mountBackground } from "./visual/background.ts";
export { mountAnalyserVisualiser } from "./visual/analyser.ts";
```

Bridge: add these to the import + `Object.assign(window, { ... })`. The inline visual code is removed and `mountBackground`/`mountAnalyserVisualiser` are called from the inline init block.

### Task 17: Browser QA + commit Group D

- [ ] **Step 1: Verification**

```bash
export PATH="$HOME/.deno/bin:$PATH"
deno task check && deno task test && deno task build
```

All pass.

- [ ] **Step 2: Browser QA — same checklist as Task 13**

**PAUSE FOR USER.** Especially watch for:
- Scheduler timing on tab-hide-and-return (3-second lookahead handles Safari throttling — verify after a 5s tab hide).
- WebGPU still works on supported browsers.
- Canvas2D fallback works (test by temporarily forcing `navigator.gpu = undefined` in devtools, refresh).
- Visualiser still animates.

If broken, STOP and report.

- [ ] **Step 3: Commit**

```bash
git add src/audio/scheduler.ts src/visual/ src/main.ts index.html
git commit -m "$(cat <<'EOF'
refactor(scheduler+visual): extract scheduler and visual layer

Scheduler (lookahead loop, scheduleBar, newProgression) moves to
src/audio/scheduler.ts with its internal state (form playhead, phrase
cache, bpm/swing/key) as module-scope. Public surface:
startScheduler/stopScheduler/resetSchedulerStateForMoodChange.

Visual layer splits into webgpu.ts (WebGPU + shader), canvas2d.ts
(fallback), analyser.ts (32-band frequency display), background.ts
(orchestrates the WebGPU->Canvas2D fallback).

Inline scheduler and visual code removed. Browser QA: scheduler timing,
tab-hide/restore, WebGPU/Canvas2D both verified.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Commit E — UI + store wiring (drop the window bridge)

**Files:**
- Create: `src/ui/controls.ts`, `src/ui/sheet.ts`, `src/ui/mood-ui.ts`, `src/ui/play-button.ts`
- Modify: `src/main.ts` (becomes the real entry — runs at module load, mounts everything)
- Modify: `index.html` (remove all inline JS except `<script type="module" src="./dist/main.js">` — but this is part of commit F; in this commit the inline is reduced to a thin bootstrap)

### Task 18: Extract play button, sliders, sheet, mood UI

- [ ] **Step 1: `src/ui/play-button.ts`**

```ts
export function mountPlayButton(onToggle: () => Promise<void> | void): void {
  const btn = document.getElementById("playBtn")!;
  btn.addEventListener("click", onToggle);
}

export function setPlayIcon(playing: boolean): void {
  // Port inline setPlayIcon (line ~2531).
}
```

- [ ] **Step 2: `src/ui/sheet.ts` — port the IIFE drag handler**

The bottom sheet drag IIFE lives at the end of the inline script (look for `handle.addEventListener("mousedown", onStart);`). Port it verbatim into:

```ts
export function mountSheet(): void {
  // Move the IIFE body here. References to `document` and DOM elements stay.
}
```

- [ ] **Step 3: `src/ui/mood-ui.ts`**

```ts
import type { AppState, Mood } from "../types.ts";
import type { Store } from "../store.ts";

export function mountMoodUI(store: Store<AppState>): void {
  // Port inline mood-button setup (around line 2825-2832):
  //   for each .moodBtn: btn.addEventListener("click", () => store.set({ currentMood: ... }))
  // Plus the MOOD_UI accent-colour application — subscribe to currentMood and
  // re-paint accents.
}

export function applyMoodUI(mood: Mood): void {
  // Port inline applyMoodUI (line 2776).
}
```

- [ ] **Step 4: `src/ui/controls.ts`**

```ts
import { applySettingToAudio } from "../audio/graph.ts";
import type { AppState, AudioRefs, MoodSettings } from "../types.ts";
import type { Store } from "../store.ts";

const TRACK_SLIDERS: ReadonlyArray<[string, keyof MoodSettings]> = [
  // Port inline TRACK_SLIDERS (line ~2643)
  ["drumsVol", "drums"],
  ["bassVol", "bass"],
  // ... full list ...
];

export function mountControls(store: Store<AppState>, getAudio: () => AudioRefs | null): void {
  for (const [id, key] of TRACK_SLIDERS) {
    const el = document.getElementById(id) as HTMLInputElement;
    el.addEventListener("input", () => {
      const val = Number(el.value);
      store.set((s) => ({
        moodSettings: {
          ...s.moodSettings,
          [s.currentMood]: { ...s.moodSettings[s.currentMood], [key]: val },
        },
        currentSettings: { ...s.currentSettings, [key]: val },
      }));
      const audio = getAudio();
      if (audio) applySettingToAudio(audio, key, val);
    });
  }

  // Subscribe to currentSettings so external changes (mood switch) update DOM.
  store.subscribe(
    (s) => s.currentSettings,
    (next) => {
      for (const [id, key] of TRACK_SLIDERS) {
        const el = document.getElementById(id) as HTMLInputElement | null;
        if (el) el.value = String(next[key]);
      }
    },
  );
}
```

### Task 19: Rewrite src/main.ts as the real entry point

- [ ] **Step 1: Replace re-export-only main.ts with the actual bootstrap**

```ts
import { createStore } from "./store.ts";
import { initialAppState } from "./state-init.ts";
import { initAudio, wireMoodCascade, wireMixerCascade } from "./audio/graph.ts";
import {
  resetSchedulerStateForMoodChange,
  startScheduler,
  stopScheduler,
} from "./audio/scheduler.ts";
import { mountBackground } from "./visual/background.ts";
import { mountAnalyserVisualiser } from "./visual/analyser.ts";
import { mountControls } from "./ui/controls.ts";
import { mountSheet } from "./ui/sheet.ts";
import { mountMoodUI, applyMoodUI } from "./ui/mood-ui.ts";
import { mountPlayButton, setPlayIcon } from "./ui/play-button.ts";
import type { AudioRefs } from "./types.ts";

const store = createStore(initialAppState());

let audio: AudioRefs | null = null;

const bgCanvas = document.getElementById("bg") as HTMLCanvasElement;
const visCanvas = document.getElementById("vis") as HTMLCanvasElement;

mountBackground(bgCanvas, store, () => {
  if (!audio) return 0;
  // Same amplitude-extraction logic as the inline updateBgAmplitude.
  const buf = new Uint8Array(audio.analyser.frequencyBinCount);
  audio.analyser.getByteTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / buf.length);
});

mountAnalyserVisualiser(
  visCanvas,
  () => audio?.analyser ?? null,
  () => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim(),
);

mountControls(store, () => audio);
mountSheet();
mountMoodUI(store);

// Mood-UI re-paint subscription (accents).
store.subscribe((s) => s.currentMood, (next) => applyMoodUI(next));

mountPlayButton(async () => {
  if (!store.get().isPlaying) {
    if (!audio) {
      audio = await initAudio(store);
      wireMoodCascade(store, audio, () =>
        resetSchedulerStateForMoodChange(store.get().currentMood)
      );
      wireMixerCascade(store, audio);
      // Apply initial settings once.
      const initial = store.get().currentSettings;
      for (const key of Object.keys(initial) as Array<keyof typeof initial>) {
        // re-trigger to set node values
      }
    }
    startScheduler(audio, store);
    store.set({ isPlaying: true });
    setPlayIcon(true);
  } else {
    stopScheduler();
    store.set({ isPlaying: false });
    setPlayIcon(false);
  }
});

// Initial accent paint based on default mood.
applyMoodUI(store.get().currentMood);
```

- [ ] **Step 2: Update `scripts/build.ts` if needed**

The build script presumably bundles `src/main.ts` to `dist/main.js`. Since `main.ts` now has side effects (runs at load), confirm esbuild's defaults preserve top-level statements. (They do.) No change should be needed.

### Task 20: Trim the inline `<script>` in index.html to just bootstrap

- [ ] **Step 1: Replace the entire inline content**

At this point, the inline script has only:
- The thin `<script type="module">` bridge that exposes window helpers
- The `lofi:ready` wrapper containing the play-button click handler, the mood-button click handler, slider listeners, sheet IIFE, mood UI accent code, the `bgAmplitude`/`bgMood` module-scope lets, the visualiser-canvas setup, the analyser amplitude reader, the `setPlayIcon` function

All of those now have module homes. Replace the entire `<script>...</script>` (lines ~688 through ~3159) AND the `<script type="module">...</script>` bridge above it with:

```html
    <script type="module" src="./dist/main.js"></script>
```

### Task 21: Browser QA + commit Group E

- [ ] **Step 1: Build and dev-test**

```bash
export PATH="$HOME/.deno/bin:$PATH"
deno task check && deno task test && deno task build && deno task dev
```

Then open <http://localhost:8000>.

- [ ] **Step 2: Run the full browser QA checklist (10 items from spec)**

**PAUSE FOR USER.** This is the most consequential commit — every UI handler, every cascade, every audio param wiring just changed plumbing. Specifically verify:
- Mood swap fades down → IR rebuild → ambience restart → fade up
- Mixer values persist per mood
- Sliders update audio in real-time
- Sheet drag still works on touch (test on a real touch device or browser device-emulation)
- Visualiser still animates

If anything is off, STOP and report.

- [ ] **Step 3: Commit**

```bash
git add src/ui/ src/main.ts index.html
git commit -m "$(cat <<'EOF'
refactor(ui): extract UI + drop the window bridge

UI splits into controls.ts (sliders + applySettingToAudio dispatch),
sheet.ts (bottom-sheet drag), mood-ui.ts (mood buttons + accent
application), play-button.ts. main.ts becomes the real entry point —
builds the store, mounts subsystems, wires the play-button toggle and
mood/mixer cascades.

index.html's inline script and lofi:ready bridge are deleted. Only the
shell <script type="module" src="./dist/main.js"></script> remains.

Browser QA: full 10-item golden path verified.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Commit F — Shell cutover + docs

**Files:**
- Modify: `index.html` (clean up — verify it's a pure shell now)
- Modify: `docs/ARCHITECTURE.md` (refresh to reflect the new module layout)
- Modify: `README.md` / `CONTRIBUTING.md` (only if stale wording remains)

### Task 22: Verify index.html is a clean shell

- [ ] **Step 1: Confirm no inline JS remains**

```bash
grep -nE "<script" /Users/petethorne/Documents/Projects/lofi-stream/index.html
```

Expected: exactly one match — `<script type="module" src="./dist/main.js"></script>`.

- [ ] **Step 2: Confirm no stale comments / IIFEs / function declarations remain**

```bash
grep -cE "function |IIFE|const KICK_PAT|let actx" /Users/petethorne/Documents/Projects/lofi-stream/index.html
```

Expected: 0.

- [ ] **Step 3: Confirm CSS still in `<style>`**

```bash
grep -nE "<style|</style>" /Users/petethorne/Documents/Projects/lofi-stream/index.html
```

Expected: one `<style>` open and one `</style>` close. CSS stays inline per spec.

### Task 23: Refresh ARCHITECTURE.md

- [ ] **Step 1: Read the current architecture doc**

`docs/ARCHITECTURE.md` currently says "Today everything (HTML, CSS, JS) lives in `index.html`." That's no longer true. Update the "Overview" section to reflect:

- HTML + CSS in `index.html` (shell)
- JS as ES modules under `src/`, bundled to `dist/main.js` via esbuild
- Audio graph, scheduler, visual, UI all in their own subdirectories

Rewrite paragraphs in the "Background renderer", "Music generation", "Web Audio scheduler", "Audio graph", "Mood switching", and "UI" sections to reference the new module paths (`src/visual/`, `src/audio/scheduler.ts`, etc.) instead of inline locations.

- [ ] **Step 2: Refresh the Conventions list**

Existing conventions stay valid; add:
- "All shared mutable UI/settings state lives in the store (`src/store.ts`). Audio node references live as module refs in `src/audio/graph.ts`. Scheduler-internal state lives in `src/audio/scheduler.ts` and is reset by `resetSchedulerStateForMoodChange()` from the mood cascade."

### Task 24: Final verification + commit + push + PR

- [ ] **Step 1: Full final check**

```bash
export PATH="$HOME/.deno/bin:$PATH"
deno task check && deno task test && deno task build
```

All pass.

- [ ] **Step 2: One more browser QA pass**

```bash
deno task dev
```

Browser at <http://localhost:8000>. Run the full 10-item checklist again. **PAUSE FOR USER.**

- [ ] **Step 3: Commit Group F**

```bash
git add index.html docs/ARCHITECTURE.md
git status --short
git commit -m "$(cat <<'EOF'
docs(arch): refresh ARCHITECTURE for the new module layout

index.html is now a pure shell — DOM + CSS + a single module-script tag.
All runtime JS lives under src/. Architecture doc updated to point at
the new module paths and to add the state-location convention.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Push the branch**

```bash
git push -u origin feat/final-modularization
```

- [ ] **Step 5: Open the PR**

```bash
gh pr create --title "Final modularization: index.html becomes a shell" --body "$(cat <<'EOF'
## What this changes

Extracts the remaining ~2400 lines of stateful runtime code from \`index.html\`
into focused modules under \`src/\`. Drops the \`lofi:ready\` window bridge in
favour of proper imports. Introduces a tiny Zustand-style reactive store
(\`src/store.ts\`) for UI/settings state.

After this PR, \`index.html\` is a pure shell: DOM + inline CSS + one
\`<script type="module" src="./dist/main.js"></script>\` tag. All runtime
behaviour lives under \`src/\`.

**Commit groups (atomic, each ends with check+test+build green):**

- A — Scaffolding: \`src/store.ts\` (with unit tests), \`AppState\`/\`AudioRefs\`/\`MoodSettings\` types, \`initialAppState()\`. No runtime change.
- B — Music: \`generatePhrase\` (with injectable RNG + 6 structural tests), drum patterns extracted to \`src/music/\`. Inline still uses them via window.
- C — Audio graph + instruments + ambience extracted to \`src/audio/\`. Inline becomes thin wrappers.
- D — Scheduler + visual extracted to \`src/audio/scheduler.ts\` and \`src/visual/\`.
- E — UI extracted to \`src/ui/\`. \`main.ts\` becomes the real entry. \`lofi:ready\` bridge deleted.
- F — Verify shell, refresh \`docs/ARCHITECTURE.md\`.

**Risk:** Medium-high. Largest single refactor of the project. Mitigated by atomic commits, browser-QA gates after C/D/E/F, and preservation of \`Math.random\` call ordering so phrase distributions don't shift.

## Spec

\`docs/superpowers/specs/2026-05-12-final-modularization-design.md\`

## How to test

- \`deno task check\` passes
- \`deno task test\` passes (store + phrase tests added)
- \`deno task build\` produces \`dist/main.js\`
- \`deno task dev\` then open <http://localhost:8000>
- Full 10-item golden-path checklist from the spec
EOF
)"
```

- [ ] **Step 6: Wait for CI**

```bash
gh pr checks --watch
```

If any check fails, STOP and report.

- [ ] **Step 7: Merge**

```bash
gh pr merge --squash --delete-branch
git checkout main
git pull origin main
git log --oneline -5
```

- [ ] **Step 8: Post-merge sanity**

```bash
export PATH="$HOME/.deno/bin:$PATH"
deno task check && deno task test && deno task build
```

All three pass on main.

---

## Done

After this PR:

- `index.html` is a DOM + CSS shell with one module-script tag.
- All runtime behaviour lives in `src/`: store, music (existing + phrase + drum-patterns), audio (graph + instruments + ambience + scheduler), visual (webgpu/canvas2d/analyser/background), ui (controls/sheet/mood-ui/play-button).
- The `window.*` bridge is gone. No global state. Cascades are wired via `store.subscribe`.
- Tests cover store mechanics (7 tests) and `generatePhrase` structural invariants (6 tests) on top of the existing 79 tests.
- The original spec's Phases 4–9 are all complete.
