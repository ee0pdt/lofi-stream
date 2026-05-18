# Melody trading + piano-roll viz — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three-layer melodic stack (base melody + primary lane + secondary lane) with exactly two melodic voices per mood that always play distinct timbres and trade `lead`/`support` roles, and add a piano-roll visualisation in place of the spectrum-bar canvas so the trading can be seen as well as heard.

**Architecture:** Three phases. Phase 1 builds the piano roll first against today's audio so subsequent refactors are visually verifiable. Phase 2 collapses the lane model into a two-voice `VoiceState` + role-swap roll, updating mood config and rewriting the scheduler's melody section. Phase 3 splits the single `melody` track bus into `melody1`/`melody2`, renames the "piano" knob label to "chords", and wires the new mixer cells.

**Tech Stack:** Deno + native ES modules, Web Audio API, plain DOM (no framework). Tests use `Deno.test` with `jsr:@std/assert`. Local dev: `deno task dev` → http://localhost:8000. Verification: `deno task check && deno task test` must pass before each commit.

**Spec reference:** `docs/superpowers/specs/2026-05-18-melody-trading-design.md`.

---

## Phase 1 — Piano-roll viz

End-state: the 400×56 `#vis` canvas shows scrolling rectangles for chord/bass/melody notes in four colours; the spectrum-bar visualiser is gone; audio behaviour is unchanged. With improv on under a current mood like `cafe`, the listener sees coral rectangles (base melody — temporarily mapped to `mel1`) and teal rectangles (primary/secondary lane fills — mapped to `mel2`) plus amber (chords) and purple (bass).

### Task 1: Piano-roll ring buffer + `recordNote` API

**Files:**
- Create: `src/visual/piano-roll.ts`
- Test: `tests/piano-roll.test.ts`

- [ ] **Step 1: Write the failing test for `recordNote` + buffer reads**

Write `tests/piano-roll.test.ts`:

```ts
import { assertEquals } from "jsr:@std/assert@^1";
import {
  __pruneOlderThanForTest,
  __resetPianoRollForTest,
  __snapshotPianoRollForTest,
  recordNote,
  type RollVoice,
} from "../src/visual/piano-roll.ts";

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
```

- [ ] **Step 2: Run test to confirm it fails (module missing)**

Run: `deno test tests/piano-roll.test.ts`
Expected: FAIL — module `../src/visual/piano-roll.ts` not found.

- [ ] **Step 3: Implement the ring buffer + `recordNote`**

Write `src/visual/piano-roll.ts` (renderer added in Task 2; this step is buffer-only):

```ts
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
```

- [ ] **Step 4: Run test, confirm pass**

Run: `deno test tests/piano-roll.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: `deno task check` clean**

Run: `deno task check`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/visual/piano-roll.ts tests/piano-roll.test.ts
git commit -m "feat(viz): piano-roll ring buffer + recordNote API"
```

### Task 2: Piano-roll renderer + `mountPianoRoll`

**Files:**
- Modify: `src/visual/piano-roll.ts` — add `mountPianoRoll`, integrate prune into render loop.

- [ ] **Step 1: Add the public mount function + renderer**

Append to `src/visual/piano-roll.ts` (after the test helpers):

```ts
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
  const ctx = canvas.getContext("2d");
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
    ctx!.fillRect(visW / 2 - Math.max(1, dpr / 2), 0, Math.max(1, dpr), visH);
  }

  frame();
}
```

Note: the `halfWindowSec` formula simplified to `halfSec = 8 * beatDur` (4 bars × 4 beats × beatDur, divided by 2 = 8 × beatDur).

- [ ] **Step 2: `deno task check` clean**

Run: `deno task check`
Expected: 0 errors. (TS may complain that `roundRect` doesn't exist on `CanvasRenderingContext2D`. If so, cast at the call site: `(ctx as unknown as { roundRect?: (...args: number[]) => void }).roundRect?.(...)`.)

Recommended typing fix if needed: add an interface assertion at the top of the file:

```ts
type Ctx2D = CanvasRenderingContext2D & {
  roundRect?: (x: number, y: number, w: number, h: number, r: number) => void;
};
```

And use `const ctx = canvas.getContext("2d") as Ctx2D | null;`.

- [ ] **Step 3: Confirm existing tests still pass**

Run: `deno task test`
Expected: PASS — all existing tests + the 3 new piano-roll tests.

- [ ] **Step 4: Commit**

```bash
git add src/visual/piano-roll.ts
git commit -m "feat(viz): piano-roll renderer with centred playhead"
```

### Task 3: Wire `recordNote` into the scheduler

**Files:**
- Modify: `src/audio/scheduler.ts` — add `recordNote` calls everywhere a note is scheduled.

- [ ] **Step 1: Import `recordNote` at top of scheduler.ts**

Add to the imports block in `src/audio/scheduler.ts` (after the existing `../audio/voices.ts` import):

```ts
import { recordNote } from "../visual/piano-roll.ts";
```

- [ ] **Step 2: Record chord notes**

In `scheduler.ts`, inside the `voicing.forEach((interval, i) => { ... })` loop in `scheduleBar`, find the existing `playComp(audio, midiNote, barStart + strum, chordDur, vel, ...)` call. Immediately after that call, add:

```ts
recordNote({ time: barStart + strum, midi: midiNote, dur: chordDur, voice: "chords" });
```

Do the same after each of the two additional conditional `playComp` calls inside that loop (the `effectiveComplexity > 0.3` block and the `effectiveComplexity > 0.7` block). Use the same `time`/`midi`/`dur` you passed to `playComp`.

- [ ] **Step 3: Record base-melody notes (temporary Phase 1 mapping → `mel1`)**

After the existing base-melody `playMelody(audio, note.midi, noteTime, note.dur, 0.17, "rhodesMel", mood);` call (the one inside `for (const note of baseBarMelody)`), add:

```ts
recordNote({ time: noteTime, midi: note.midi, dur: note.dur, voice: "mel1" });
```

Then the anticipation call further down — after `playMelody(audio, baseNext[0].midi, barStart + bd * 4 - bd * 0.25, baseNext[0].dur, 0.14, "rhodesMel", mood)`, add:

```ts
recordNote({
  time: barStart + bd * 4 - bd * 0.25,
  midi: baseNext[0].midi,
  dur: baseNext[0].dur,
  voice: "mel1",
});
```

- [ ] **Step 4: Record lane-fill notes (temporary Phase 1 mapping → `mel2`)**

Inside the `for (const entry of activeLanes)` block, after the existing `playMelodyTimbre(audio, note.midi, noteTime, note.dur, vel, "mel", lane.def.timbre)` call, add:

```ts
recordNote({ time: noteTime, midi: note.midi, dur: note.dur, voice: "mel2" });
```

And after the anticipation `playMelodyTimbre` call further down, add:

```ts
recordNote({
  time: barStart + bd * 4 - bd * 0.25,
  midi: nextBarMelody[0].midi,
  dur: nextBarMelody[0].dur,
  voice: "mel2",
});
```

- [ ] **Step 5: Record bass notes**

In the `bassNotes.forEach((midiNote, i) => { ... })` block, after the existing `playBass(audio, midiNote, barStart + bd * i, bd * 0.88, vel, mood)` call, add:

```ts
recordNote({ time: barStart + bd * i, midi: midiNote, dur: bd * 0.88, voice: "bass" });
```

Then after the conditional ghost-bass `playBass(audio, ghostMidi, barStart + bd * 3.5, bd * 0.3, ...)` call, add:

```ts
recordNote({ time: barStart + bd * 3.5, midi: ghostMidi, dur: bd * 0.3, voice: "bass" });
```

- [ ] **Step 6: `deno task check && deno task test`**

Run: `deno task check && deno task test`
Expected: 0 errors, all tests pass. (Existing tests don't exercise scheduler.ts directly so this is mostly a typecheck.)

- [ ] **Step 7: Commit**

```bash
git add src/audio/scheduler.ts
git commit -m "feat(viz): record every scheduled note for the piano roll"
```

### Task 4: Replace spectrum visualiser with piano roll

**Files:**
- Modify: `src/main.ts` — swap `mountAnalyserVisualiser` call for `mountPianoRoll`.
- Modify: `src/visual/background.ts` — move `readAccentRgb` here (currently in analyser.ts). The piano roll doesn't need accent — but `main.ts` imports `readAccentRgb` from `analyser.ts` and uses it for the background, so it has to be relocated before deleting `analyser.ts`.
- Delete: `src/visual/analyser.ts`.
- Modify: `src/audio/scheduler.ts` — export a `getCurrentBeatDur()` helper so `mountPianoRoll` can read the live tempo.

- [ ] **Step 1: Add `getCurrentBeatDur` exporter to scheduler.ts**

In `src/audio/scheduler.ts`, near the bottom (after `setCurrentBPM`), add:

```ts
/** Read the live beat duration in seconds. Used by the piano-roll viz. */
export function getCurrentBeatDur(): number {
  return beatDur(currentBPM);
}
```

- [ ] **Step 2: Move `readAccentRgb` from analyser.ts to background.ts**

Open `src/visual/background.ts`. At the end of the file, append:

```ts
/** Parse the current `--warm` CSS custom property into an [r,g,b] triple. */
export function readAccentRgb(): readonly [number, number, number] {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue("--warm")
    .trim();
  if (v.startsWith("#")) {
    const r = parseInt(v.slice(1, 3), 16);
    const g = parseInt(v.slice(3, 5), 16);
    const b = parseInt(v.slice(5, 7), 16);
    return [r, g, b];
  }
  const m = v.match(/(\d+(?:\.\d+)?)/g);
  if (m && m.length >= 3) return [+m[0], +m[1], +m[2]];
  return [201, 125, 64];
}
```

- [ ] **Step 3: Update `main.ts` to mount piano roll instead of analyser**

In `src/main.ts`:

1. Change line 31 from:
   ```ts
   import { mountAnalyserVisualiser, readAccentRgb } from "./visual/analyser.ts";
   ```
   to:
   ```ts
   import { readAccentRgb } from "./visual/background.ts";
   import { mountPianoRoll } from "./visual/piano-roll.ts";
   import { getCurrentBeatDur } from "./audio/scheduler.ts";
   ```

2. Find the `mountAnalyserVisualiser(visCanvas, ...)` call site and replace it with:
   ```ts
   mountPianoRoll(visCanvas, () => audio?.actx ?? null, () => getCurrentBeatDur());
   ```

(The variable name `visCanvas` is what main.ts currently uses for the `#vis` element — preserve whatever the actual local is.)

- [ ] **Step 4: Delete `src/visual/analyser.ts`**

```bash
git rm src/visual/analyser.ts
```

- [ ] **Step 5: `deno task check && deno task test`**

Run: `deno task check && deno task test`
Expected: 0 errors, all tests pass.

- [ ] **Step 6: Manual smoke test**

Run: `deno task dev`
Open: http://localhost:8000
Press play. Toggle improv on. Verify:
- `#vis` shows scrolling rectangles, not spectrum bars.
- Amber rectangles (chords), purple (bass), coral (base melody — mapped temporarily to mel1), teal (lane fills — mapped temporarily to mel2) visible.
- Playhead line in the centre; notes scroll right-to-left.
- Background blob pulsing still works (proves `createAmplitudeReader` survived).

- [ ] **Step 7: Commit**

```bash
git add src/main.ts src/visual/background.ts src/audio/scheduler.ts
git rm src/visual/analyser.ts
git commit -m "feat(viz): replace spectrum bars with piano roll on #vis"
```

---

## Phase 2 — Voice model refactor

End-state: `voice-lane.ts` is gone, replaced by `voice.ts` with `VoiceState`, two-voice trading, role swaps at phrase boundaries, support seeded from the lead's last note. Every mood declares two distinct timbres for improv. With improv on, listener hears two distinct timbres weaving around each other; piano roll shows coral + teal trading prominence. Both voices still route through the existing `melody` track bus — the mixer split arrives in Phase 3.

### Task 5: Update `MoodImprovConfig` shape in types.ts

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Remove `LaneDef` and rewrite `MoodImprovConfig`**

In `src/types.ts`, find the existing `LaneDef` interface and the `MoodImprovConfig` interface (lines ~57–75). Replace them with:

```ts
/**
 * Per-mood improv-mode configuration. Two distinct melodic timbres are
 * required; the role of `lead` and `support` swaps probabilistically at
 * phrase boundaries (see `voice.ts`). `breakoutThreshold` is the melody
 * energy level (0-1) above which the current lead may switch from
 * structured phrases into a dense improv run.
 */
export interface MoodImprovConfig {
  readonly peakDensityCap: number;
  readonly bridgeSubstitutions: readonly [Chord, Chord, Chord, Chord];
  readonly voices: readonly [Timbre, Timbre];
  readonly breakoutThreshold: number;
}
```

(The `LaneDef` interface is deleted entirely.)

- [ ] **Step 2: `deno task check` to surface every consumer**

Run: `deno task check`
Expected: FAIL — TS errors in `src/music/moods.ts`, `src/audio/scheduler.ts`, `src/music/voice-lane.ts`, `tests/improv-energy.test.ts` referencing the old shape. **Do not fix yet — the next tasks fix them in order.**

- [ ] **Step 3: Commit (typecheck still red — that's expected mid-refactor)**

```bash
git add src/types.ts
git commit -m "refactor(types): replace LaneDef with two-voice MoodImprovConfig"
```

### Task 6: Update `MOOD_META` to the new shape

**Files:**
- Modify: `src/music/moods.ts`

- [ ] **Step 1: Rewrite each mood's `improv` block**

In `src/music/moods.ts`, for each mood, replace the existing `improv` object with a version using the new schema. The full updated object follows.

**rainy:**
```ts
improv: {
  peakDensityCap: 0.75,
  bridgeSubstitutions: [
    [10, "maj7"],
    [5, "min9"],
    [3, "maj9"],
    [8, "dom9"],
  ],
  voices: ["rhodes", "vibraphone"],
  breakoutThreshold: 0.72,
},
```

**late:**
```ts
improv: {
  peakDensityCap: 1.0,
  bridgeSubstitutions: [
    [2, "min7b5"],
    [7, "dom9"],
    [0, "min9"],
    [5, "maj9"],
  ],
  voices: ["vibraphone", "bell"],
  breakoutThreshold: 0.62,
},
```

**cafe:**
```ts
improv: {
  peakDensityCap: 1.0,
  bridgeSubstitutions: [
    [9, "min7"],
    [2, "dom9"],
    [7, "maj9"],
    [0, "maj7"],
  ],
  voices: ["rhodes", "vibraphone"],
  breakoutThreshold: 0.68,
},
```

**sleepy:**
```ts
improv: {
  peakDensityCap: 0.65,
  bridgeSubstitutions: [
    [10, "maj9"],
    [3, "maj7"],
    [8, "maj7"],
    [5, "min9"],
  ],
  voices: ["celesta", "bell"],
  breakoutThreshold: 0.78,
},
```

**transit:**
```ts
improv: {
  peakDensityCap: 0.9,
  bridgeSubstitutions: [
    [10, "min7"],
    [5, "min7"],
    [8, "dom9"],
    [3, "maj9"],
  ],
  voices: ["bell", "vibraphone"],
  breakoutThreshold: 0.65,
},
```

- [ ] **Step 2: Check moods.ts in isolation typechecks**

Run: `deno check src/music/moods.ts`
Expected: PASS (other modules still fail, but moods.ts itself is now correct).

- [ ] **Step 3: Commit**

```bash
git add src/music/moods.ts
git commit -m "refactor(moods): MOOD_META uses voices + top-level breakoutThreshold"
```

### Task 7: Create `voice.ts` (TDD)

**Files:**
- Create: `src/music/voice.ts`
- Test: `tests/voice.test.ts`

- [ ] **Step 1: Write failing tests for the new voice module**

Write `tests/voice.test.ts`:

```ts
import { assertEquals, assertNotEquals } from "jsr:@std/assert@^1";
import { FORMS } from "../src/music/forms.ts";
import {
  advanceVoiceBar,
  initVoice,
  startNextPhrase,
  swapRoles,
  updateVoiceMidi,
  type VoiceState,
} from "../src/music/voice.ts";

const testProg = FORMS["late"][0].prog;
const beatDur = 60 / 70;

Deno.test("voice: initVoice defaults", () => {
  const v = initVoice(1, "vibraphone", "lead");
  assertEquals(v.id, 1);
  assertEquals(v.timbre, "vibraphone");
  assertEquals(v.role, "lead");
  assertEquals(v.mode, "structured");
  assertEquals(v.phrase, null);
  assertEquals(v.phraseBarIdx, 0);
  assertEquals(v.barsInMode, 0);
  assertEquals(v.lastMidi, null);
});

Deno.test("voice: lead startNextPhrase returns a structured phrase from formProg", () => {
  const v = initVoice(1, "vibraphone", "lead");
  const next = startNextPhrase(v, {
    formProg: testProg,
    currentKey: 0,
    complexity: 0.5,
    beatDur,
    melodyEnergy: 0.3, // below breakout threshold
    breakoutThreshold: 0.62,
    leadLastMidi: null,
    rng: () => 0.99, // RNG that defeats breakout roll
  });
  assertEquals(next.phrase !== null, true);
  assertEquals(next.mode, "structured");
});

Deno.test("voice: lead with high energy can enter improv mode", () => {
  const v = initVoice(1, "vibraphone", "lead");
  const next = startNextPhrase(v, {
    formProg: testProg,
    currentKey: 0,
    complexity: 0.5,
    beatDur,
    melodyEnergy: 0.85, // above threshold
    breakoutThreshold: 0.62,
    leadLastMidi: null,
    rng: () => 0.1, // RNG that succeeds the breakout roll (< 0.45)
  });
  assertEquals(next.mode, "improv");
});

Deno.test("voice: support always stays structured even at high energy", () => {
  const v = initVoice(2, "bell", "support");
  const next = startNextPhrase(v, {
    formProg: testProg,
    currentKey: 0,
    complexity: 0.5,
    beatDur,
    melodyEnergy: 0.95,
    breakoutThreshold: 0.62,
    leadLastMidi: 60,
    rng: () => 0.05,
  });
  assertEquals(next.mode, "structured");
});

Deno.test("voice: support is seeded with lead's last midi (not its own)", () => {
  // Self-midi 50 but lead at 70. The phrase generator's seedNote should
  // be the lead's 70, not the voice's own 50. We can't see seedNote directly,
  // but the first generated midi should land in a neighbourhood of the seed.
  // For determinism we instead snapshot the function call by passing a fake
  // rng that picks the seed midi unmodified: phrase.ts uses seedNote as the
  // starting reference. We assert that the support's first note is closer
  // to 70 than to 50.
  const v = updateVoiceMidi(initVoice(2, "bell", "support"), 50);
  const next = startNextPhrase(v, {
    formProg: testProg,
    currentKey: 0,
    complexity: 0.3,
    beatDur,
    melodyEnergy: 0.4,
    breakoutThreshold: 0.62,
    leadLastMidi: 70,
    rng: () => 0.5,
  });
  const firstMidi = next.phrase![0][0].midi;
  // Heuristic: must be in the upper octave centred on 70, not 50.
  // The phrase generator constrains notes within ~an octave of seed.
  assertEquals(firstMidi > 58, true, `first midi ${firstMidi} should be closer to 70 than to 50`);
});

Deno.test("voice: advanceVoiceBar increments phraseBarIdx", () => {
  let v = initVoice(1, "rhodes", "lead");
  v = advanceVoiceBar(v);
  assertEquals(v.phraseBarIdx, 1);
});

Deno.test("voice: updateVoiceMidi stores last midi", () => {
  const v = initVoice(1, "rhodes", "lead");
  const next = updateVoiceMidi(v, 64);
  assertEquals(next.lastMidi, 64);
});

Deno.test("voice: swapRoles flips both voices and clears mode/bars-in-mode", () => {
  let a = initVoice(1, "rhodes", "lead");
  let b = initVoice(2, "vibraphone", "support");
  a = { ...a, mode: "improv", barsInMode: 4 };
  [a, b] = swapRoles(a, b);
  assertEquals(a.role, "support");
  assertEquals(b.role, "lead");
  assertEquals(a.mode, "structured");
  assertEquals(a.barsInMode, 0);
});
```

- [ ] **Step 2: Run tests — confirm fail**

Run: `deno test tests/voice.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/music/voice.ts`**

```ts
/**
 * Two-voice improv model. Each `VoiceState` is one melodic voice with a
 * lead/support role. The scheduler holds two instances; the role bit is
 * the trading mechanism — phrase boundaries roll an RNG and may swap.
 *
 * Lead: generates structured phrases over the form chord. Can enter an
 *   `improv` mode (dense run) when melody energy crosses
 *   `breakoutThreshold` and an RNG roll succeeds.
 * Support: always `structured`, always `sparse`-styled. Phrase is seeded
 *   with the LEAD's last note (not its own) so the support's contour
 *   echoes the lead.
 */

import type { Chord, Timbre } from "../types.ts";
import { generatePhrase, type Phrase, type PhraseStyle } from "./phrase.ts";

export type VoiceRole = "lead" | "support";
export type VoiceMode = "structured" | "improv";

export interface VoiceState {
  readonly id: 1 | 2;
  readonly timbre: Timbre;
  readonly role: VoiceRole;
  readonly phrase: Phrase | null;
  readonly phraseBarIdx: number;
  readonly mode: VoiceMode;
  readonly barsInMode: number;
  readonly lastMidi: number | null;
}

export function initVoice(id: 1 | 2, timbre: Timbre, role: VoiceRole): VoiceState {
  return {
    id,
    timbre,
    role,
    phrase: null,
    phraseBarIdx: 0,
    mode: "structured",
    barsInMode: 0,
    lastMidi: null,
  };
}

export interface VoiceAdvanceOptions {
  readonly formProg: readonly [Chord, Chord, Chord, Chord];
  readonly currentKey: number;
  readonly complexity: number;
  readonly beatDur: number;
  readonly melodyEnergy: number;
  readonly breakoutThreshold: number;
  /** Lead's last MIDI note. Used to seed the support's next phrase. */
  readonly leadLastMidi: number | null;
  readonly rng: () => number;
}

/**
 * Decide the mode for the next phrase and generate it. Called once per
 * phrase cycle (phraseBarIdx === 0). Returns updated voice state with a
 * fresh phrase and mode set.
 */
export function startNextPhrase(state: VoiceState, opts: VoiceAdvanceOptions): VoiceState {
  let mode: VoiceMode = "structured";

  if (state.role === "lead") {
    const energyOver = opts.melodyEnergy > opts.breakoutThreshold;
    const rollBreakout = opts.rng() < 0.45;
    const rollSettle = state.mode === "improv" && state.barsInMode >= 8 && opts.rng() < 0.5;
    if (rollSettle) {
      mode = "structured";
    } else if (state.mode === "improv" || (energyOver && rollBreakout)) {
      mode = "improv";
    }
  }

  const phraseStyle: PhraseStyle =
    state.role === "support" ? "sparse" : mode === "improv" ? "dense" : "normal";

  // Support seeds from the LEAD's last note; lead self-seeds.
  const seedNote = state.role === "support"
    ? (opts.leadLastMidi ?? state.lastMidi ?? undefined)
    : (state.lastMidi ?? undefined);

  const phrase = generatePhrase(opts.formProg, {
    currentKey: opts.currentKey,
    complexity: mode === "improv" ? Math.min(1, opts.complexity + 0.3) : opts.complexity,
    beatDur: opts.beatDur,
    phraseStyle,
    seedNote,
  });

  return {
    ...state,
    phrase,
    phraseBarIdx: 0,
    mode,
    barsInMode: state.mode === mode ? state.barsInMode + 4 : 0,
  };
}

export function advanceVoiceBar(state: VoiceState): VoiceState {
  return { ...state, phraseBarIdx: state.phraseBarIdx + 1 };
}

export function updateVoiceMidi(state: VoiceState, midi: number | null): VoiceState {
  return { ...state, lastMidi: midi };
}

/**
 * Swap the roles of two voices. Resets `mode` to `structured` and
 * `barsInMode` to 0 on both — the new lead starts a fresh structured
 * phrase, the new support drops any in-flight improv.
 */
export function swapRoles(
  a: VoiceState,
  b: VoiceState,
): readonly [VoiceState, VoiceState] {
  const reset = (v: VoiceState, nextRole: VoiceRole): VoiceState => ({
    ...v,
    role: nextRole,
    mode: "structured",
    barsInMode: 0,
  });
  return [reset(a, b.role), reset(b, a.role)];
}
```

- [ ] **Step 4: Run tests — confirm pass**

Run: `deno test tests/voice.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/music/voice.ts tests/voice.test.ts
git commit -m "feat(music): voice.ts — two-voice trading model"
```

### Task 8: Rewrite scheduler's melody section to use two voices

**Files:**
- Modify: `src/audio/scheduler.ts`

- [ ] **Step 1: Update scheduler imports**

In `src/audio/scheduler.ts`, replace the existing imports of `voice-lane.ts`:

Remove:
```ts
import {
  advanceLaneBar,
  initLaneState,
  type LaneState,
  startNextPhrase,
  updateLaneMidi,
} from "../music/voice-lane.ts";
```

Add (in the same spot, alphabetically ordered with siblings):
```ts
import {
  advanceVoiceBar,
  initVoice,
  startNextPhrase,
  swapRoles,
  updateVoiceMidi,
  type VoiceState,
} from "../music/voice.ts";
```

- [ ] **Step 2: Replace the lane state declarations and the base-melody trackers**

Find these lines near the top of the module:

```ts
let primaryLane: LaneState = initLaneState(
  { timbre: "rhodes", breakoutThreshold: 0.72 },
  false,
);
let secondaryLane: LaneState | null = null;
// Base melody phrase tracker — always follows the form, independent of lanes.
let basePhrase: import("../music/phrase.ts").Phrase | null = null;
let basePhraseBarIdx = 0;
let baseLastMidi: number | null = null;
```

Replace with:

```ts
let voice1: VoiceState = initVoice(1, "rhodes", "lead");
let voice2: VoiceState = initVoice(2, "vibraphone", "support");
```

- [ ] **Step 3: Add a helper for swap-probability per section type**

Above `scheduleBar`, add:

```ts
function swapProbability(sectionType: import("../music/improv-sequencer.ts").SectionType): number {
  switch (sectionType) {
    case "normal":
      return 0.10;
    case "buildup":
    case "peak":
      return 0.35;
    case "break":
    case "bridge":
      return 0.15;
  }
}
```

- [ ] **Step 4: Update `newProgression` to init voices from the mood config**

In `newProgression`, find the existing lane-init lines:

```ts
const lanes = MOOD_META[mood].improv.lanes;
primaryLane = initLaneState(lanes.primary, false);
secondaryLane = lanes.secondary ? initLaneState(lanes.secondary, true) : null;
basePhrase = null;
basePhraseBarIdx = 0;
baseLastMidi = null;
```

Replace with:

```ts
const [t1, t2] = MOOD_META[mood].improv.voices;
voice1 = initVoice(1, t1, "lead");
voice2 = initVoice(2, t2, "support");
```

- [ ] **Step 5: Update `resetImprovState`**

Replace the body of `resetImprovState` with:

```ts
export function resetImprovState(mood: Mood = "rainy"): void {
  energyState = initEnergyState(mood);
  const [t1, t2] = MOOD_META[mood].improv.voices;
  voice1 = initVoice(1, t1, "lead");
  voice2 = initVoice(2, t2, "support");
}
```

- [ ] **Step 6: Update `advancePlayhead` section-change handler**

Find inside `advancePlayhead`:

```ts
if (sectionChanged) {
  primaryLane = initLaneState(primaryLane.def, false);
  if (secondaryLane) secondaryLane = initLaneState(secondaryLane.def, true);
  basePhrase = null;
  basePhraseBarIdx = 0;
}
```

Replace with:

```ts
if (sectionChanged) {
  voice1 = initVoice(voice1.id, voice1.timbre, voice1.role);
  voice2 = initVoice(voice2.id, voice2.timbre, voice2.role);
}
```

- [ ] **Step 7: Rewrite the melody section of `scheduleBar`**

This is the largest single change. Delete the existing **base melody block** (`// --- Base melody: always plays, always follows the form ---` through `basePhraseBarIdx++;`) AND the existing **improv fills block** (`// --- Improv fills: additive layer on top of the base melody ---` through the `for (const entry of activeLanes)` loop's closing brace).

Replace both with this single block (place it where the deleted code was):

```ts
// --- Two-voice melody ---
// In non-improv mode: voice1 (lead) plays the form on melTimbre, voice2 silent.
// In improv mode: both voices play their improv-config timbres with trading roles.
// `leadTimbre` is recomputed after any role swap below so it always tracks
// whichever voice is currently leading.

if (isImprov) {
  // Possibly swap roles at phrase boundary (only when both voices are at the
  // start of a phrase — phraseBarIdx === 0 for both — which is always the
  // case here because lanes reset together on prog change).
  if (voice1.phraseBarIdx === 0 && voice2.phraseBarIdx === 0) {
    if (Math.random() < swapProbability(energyState.sectionType)) {
      [voice1, voice2] = swapRoles(voice1, voice2);
    }
  }
}

// Identify lead and support for this bar (after any swap above).
const lead: VoiceState = voice1.role === "lead" ? voice1 : voice2;
const support: VoiceState = voice1.role === "support" ? voice1 : voice2;
const leadTimbre = isImprov ? lead.timbre : MOOD_META[mood].melTimbre;

// ---- LEAD ----
let leadVoice = lead;
if (leadVoice.phraseBarIdx === 0 || leadVoice.phrase === null) {
  leadVoice = startNextPhrase(leadVoice, {
    formProg,
    currentKey,
    complexity: effectiveComplexity,
    beatDur: bd,
    melodyEnergy: energyState.energies.melody,
    breakoutThreshold: MOOD_META[mood].improv.breakoutThreshold,
    leadLastMidi: leadVoice.lastMidi,
    rng: Math.random,
  });
}
const leadBar = leadVoice.phrase![leadVoice.phraseBarIdx % leadVoice.phrase!.length];
const leadVelBase = 0.17;
for (const note of leadBar) {
  const noteTime = barStart + note.beat;
  if (noteTime >= barStart - 0.01) {
    playMelodyTimbre(audio, note.midi, noteTime, note.dur, leadVelBase, "mel", leadTimbre);
    recordNote({
      time: noteTime,
      midi: note.midi,
      dur: note.dur,
      voice: leadVoice.id === 1 ? "mel1" : "mel2",
    });
  }
}
if (leadBar.length > 0) {
  leadVoice = updateVoiceMidi(leadVoice, leadBar[leadBar.length - 1].midi);
}
const leadNext = leadVoice.phrase![(leadVoice.phraseBarIdx + 1) % leadVoice.phrase!.length];
if (leadNext?.[0]?.anticipation) {
  const at = barStart + bd * 4 - bd * 0.25;
  playMelodyTimbre(audio, leadNext[0].midi, at, leadNext[0].dur, leadVelBase * 0.82, "mel", leadTimbre);
  recordNote({
    time: at,
    midi: leadNext[0].midi,
    dur: leadNext[0].dur,
    voice: leadVoice.id === 1 ? "mel1" : "mel2",
  });
}
leadVoice = advanceVoiceBar(leadVoice);

// ---- SUPPORT ----
let supportVoice = support;
const supportSilent = !isImprov || leadVoice.mode === "improv"; // breathing rule
if (!supportSilent) {
  if (supportVoice.phraseBarIdx === 0 || supportVoice.phrase === null) {
    supportVoice = startNextPhrase(supportVoice, {
      formProg,
      currentKey,
      complexity: effectiveComplexity,
      beatDur: bd,
      melodyEnergy: energyState.energies.melody,
      breakoutThreshold: MOOD_META[mood].improv.breakoutThreshold,
      leadLastMidi: lead.lastMidi, // seed with the LEAD's last note
      rng: Math.random,
    });
  }
  const supBar = supportVoice.phrase![supportVoice.phraseBarIdx % supportVoice.phrase!.length];
  const supVelBase = 0.10;
  for (const note of supBar) {
    const noteTime = barStart + note.beat;
    if (noteTime >= barStart - 0.01) {
      playMelodyTimbre(audio, note.midi, noteTime, note.dur, supVelBase, "mel", supportVoice.timbre);
      recordNote({
        time: noteTime,
        midi: note.midi,
        dur: note.dur,
        voice: supportVoice.id === 1 ? "mel1" : "mel2",
      });
    }
  }
  if (supBar.length > 0) {
    supportVoice = updateVoiceMidi(supportVoice, supBar[supBar.length - 1].midi);
  }
  const supNext = supportVoice.phrase![(supportVoice.phraseBarIdx + 1) % supportVoice.phrase!.length];
  if (supNext?.[0]?.anticipation) {
    const at = barStart + bd * 4 - bd * 0.25;
    playMelodyTimbre(audio, supNext[0].midi, at, supNext[0].dur, supVelBase * 0.82, "mel", supportVoice.timbre);
    recordNote({
      time: at,
      midi: supNext[0].midi,
      dur: supNext[0].dur,
      voice: supportVoice.id === 1 ? "mel1" : "mel2",
    });
  }
}
// Always advance the bar counter (so silent phrases age out).
supportVoice = advanceVoiceBar(supportVoice);

// Write the local mutations back to the module-level voices, preserving id.
if (leadVoice.id === 1) voice1 = leadVoice;
else voice2 = leadVoice;
if (supportVoice.id === 1) voice1 = supportVoice;
else voice2 = supportVoice;
```

(Note: the old Phase 1 `recordNote` calls for the base melody and lane fills are removed by this rewrite — they're replaced by the new `recordNote` calls inside the lead/support blocks above.)

- [ ] **Step 8: Update the `tick` reset on prog change**

In `tick`, find:

```ts
if (energyState.progBarAge === 0 && prevAge > 0) {
  primaryLane = initLaneState(primaryLane.def, false);
  if (secondaryLane) secondaryLane = initLaneState(secondaryLane.def, true);
  basePhrase = null;
  basePhraseBarIdx = 0;
}
```

Replace with:

```ts
if (energyState.progBarAge === 0 && prevAge > 0) {
  voice1 = initVoice(voice1.id, voice1.timbre, voice1.role);
  voice2 = initVoice(voice2.id, voice2.timbre, voice2.role);
}
```

- [ ] **Step 9: Update `cycleCurrentKey`**

Find:

```ts
primaryLane = initLaneState(primaryLane.def, false);
if (secondaryLane) secondaryLane = initLaneState(secondaryLane.def, true);
basePhrase = null;
basePhraseBarIdx = 0;
```

Replace with:

```ts
voice1 = initVoice(voice1.id, voice1.timbre, voice1.role);
voice2 = initVoice(voice2.id, voice2.timbre, voice2.role);
```

- [ ] **Step 10: `deno task check` clean**

Run: `deno task check`
Expected: scheduler.ts now typechecks. Remaining failures should be in `voice-lane.ts` and `tests/improv-energy.test.ts` only.

- [ ] **Step 11: Commit (deferring delete of voice-lane.ts to next task)**

```bash
git add src/audio/scheduler.ts
git commit -m "refactor(scheduler): drive melody from two-voice model with role swaps"
```

### Task 9: Delete `voice-lane.ts` and update tests

**Files:**
- Delete: `src/music/voice-lane.ts`
- Modify: `tests/improv-energy.test.ts` — strip the voice-lane test block (the energy tests stay).

- [ ] **Step 1: Strip voice-lane tests from `improv-energy.test.ts`**

In `tests/improv-energy.test.ts`, delete everything from line 63 (`import { advanceLaneBar, ... }`) to the end of the file. The file should end after the last `stepEnergyState` test (around line 61).

- [ ] **Step 2: Delete `src/music/voice-lane.ts`**

```bash
git rm src/music/voice-lane.ts
```

- [ ] **Step 3: `deno task check && deno task test`**

Run: `deno task check && deno task test`
Expected: 0 errors, all tests pass.

- [ ] **Step 4: Manual smoke test**

Run: `deno task dev` → http://localhost:8000.

For each of `rainy`, `late`, `cafe`, `sleepy`, `transit`:
- Switch to the mood, press play, toggle improv on, listen ~20s.
- Verify in the piano roll: two distinct colours (coral + teal) playing simultaneously.
- Audibly: two distinct timbres in the melody range.
- Watch a few section transitions: occasionally the busier line switches colours (role swap visible). At least one peak section should show one colour going dense briefly while the other goes silent for a phrase (soloist breathing).

- [ ] **Step 5: Commit**

```bash
git add tests/improv-energy.test.ts
git rm src/music/voice-lane.ts
git commit -m "refactor: delete voice-lane.ts; trim its tests"
```

---

## Phase 3 — Mixer split + rename

End-state: the comp knob is labelled "chords"; the `melody` mixer cell is replaced by `mel 1` and `mel 2`; `playMelodyTimbre` routes to `melody1`/`melody2` track buses; per-mood mixer defaults split the old `melody` value across the two new keys.

### Task 10: Add `melody1`/`melody2` track buses

**Files:**
- Modify: `src/audio/graph.ts`

- [ ] **Step 1: Update `trackKeys` and `defaultGains`**

In `src/audio/graph.ts`, find the `trackKeys` declaration (just above `defaultGains`). Update:

Replace:
```ts
const defaultGains: Record<string, number> = {
  drums: 0.9,
  bass: 0.85,
  comp: 0.8,
  melody: 0.75,
  hiss: 0.5,
  scratches: 0.7,
  ambience: 0.6,
  hum: 0.4,
};
```

With:
```ts
const defaultGains: Record<string, number> = {
  drums: 0.9,
  bass: 0.85,
  comp: 0.8,
  melody1: 0.75,
  melody2: 0.65,
  hiss: 0.5,
  scratches: 0.7,
  ambience: 0.6,
  hum: 0.4,
};
```

Find the `trackKeys` array nearby (it iterates `defaultGains` keys or has its own enumerated list — adjust whichever shape is present so it includes `melody1`, `melody2`, and excludes `melody`).

- [ ] **Step 2: Check `applySettingToAudio` handles the new keys**

In the same file, look for `applySettingToAudio`. It currently does something like `audio.trackGains[key].gain.value = val` when `key` is a known track. The new `melody1`/`melody2` keys flow through this path automatically because `trackGains` now has those entries — no explicit case needed.

- [ ] **Step 3: `deno task check`**

Run: `deno task check`
Expected: errors in `Settings` interface (still has `melody`), `controls.ts` (still has `melody` in slider map), `voices.ts` (still routes to `audio.trackGains.melody`). Those are fixed in the next tasks.

- [ ] **Step 4: Commit (typecheck still red — expected mid-refactor)**

```bash
git add src/audio/graph.ts
git commit -m "refactor(graph): split melody track into melody1 + melody2 buses"
```

### Task 11: Add `voice` param to `playMelodyTimbre`; update scheduler call sites

**Files:**
- Modify: `src/audio/voices.ts`
- Modify: `src/audio/scheduler.ts`

- [ ] **Step 1: Update `playMelodyTimbre` signature in voices.ts**

Find the current `playMelodyTimbre` in `src/audio/voices.ts`. Look inside each `play*` (rhodes/vibraphone/celesta/bell) implementation: they each connect to `audio.trackGains.melody` at the end. The simplest, cleanest change is to add a `voice: 1 | 2` parameter to `playMelodyTimbre` and have it temporarily wrap each timbre's output node and route through `trackGains.melody1` or `trackGains.melody2`.

Easier alternative (Recommended): wrap the timbre output in a thin per-voice gain node here. Update `playMelodyTimbre`:

```ts
/** Play a melody note with an explicit timbre rather than deriving it from mood.
 *  `voice` selects which melody bus the note routes to (1 → melody1, 2 → melody2). */
export function playMelodyTimbre(
  audio: AudioRefs,
  midi: number,
  time: number,
  dur: number,
  vel: number,
  role: string,
  timbre: import("../types.ts").Timbre,
  voice: 1 | 2 = 1,
): void {
  // The individual play* functions connect to audio.trackGains.melody internally.
  // We need to redirect that to melody1 or melody2. The cleanest fix is to give
  // each timbre function a target bus; but since they take AudioRefs we can
  // mutate `audio.trackGains.melody` temporarily — that's racy. Instead, we
  // pass through the actual bus key.
  // ...
  // (See implementation step 2 — depends on how each timbre is currently wired.)
}
```

Inspect each timbre file (`src/audio/timbres/rhodes.ts`, `vibraphone.ts`, `celesta.ts`, `bell.ts`) to confirm how they reach the bus. They all read `audio.trackGains.melody` directly.

**Decision:** add a `melBusKey` parameter to each timbre function. This is a small ripple but keeps the routing explicit and avoids the temptation to mutate `audio.trackGains.melody`.

- [ ] **Step 2: Update each melody timbre to take a bus key**

For each of `src/audio/timbres/rhodes.ts`, `vibraphone.ts`, `celesta.ts`, `bell.ts`: open the file, find the `play<Name>` export, locate the line `... .connect(audio.trackGains.melody)`. Add a final parameter `melBus: GainNode = audio.trackGains.melody1` and replace the connect target:

```ts
// Before:
sp.output.connect(audio.trackGains.melody);
// After:
sp.output.connect(melBus);
```

And the function signature gains `melBus?: GainNode` at the end.

Note: `playComp` uses these same timbre functions in some cases (rhodes/vibraphone). For comp use, the bus should be `audio.trackGains.comp`. Update `playComp` in `src/audio/voices.ts` to pass `audio.trackGains.comp` as `melBus` when calling them, so existing comp routing is preserved.

(If a timbre is only ever used for one of comp/melody, no change needed for that one — but the four listed above are all melody-capable.)

- [ ] **Step 3: Update `playMelodyTimbre` to pick the bus and pass it**

```ts
export function playMelodyTimbre(
  audio: AudioRefs,
  midi: number,
  time: number,
  dur: number,
  vel: number,
  role: string,
  timbre: import("../types.ts").Timbre,
  voice: 1 | 2 = 1,
): void {
  const melBus = voice === 1 ? audio.trackGains.melody1 : audio.trackGains.melody2;
  if (timbre === "vibraphone") playVibraphone(audio, midi, time, dur, vel, role, melBus);
  else if (timbre === "celesta") playCelesta(audio, midi, time, dur, vel, role, melBus);
  else if (timbre === "bell") playBell(audio, midi, time, dur, vel, role, melBus);
  else playRhodes(audio, midi, time, dur, vel, role, melBus);
}
```

And update `playMelody`:

```ts
export function playMelody(
  audio: AudioRefs,
  midi: number,
  time: number,
  dur: number,
  vel: number,
  role: string,
  mood: Mood,
): void {
  playMelodyTimbre(audio, midi, time, dur, vel, role, MOOD_META[mood].melTimbre, 1);
}
```

- [ ] **Step 4: Pass `voice` from the scheduler**

In `src/audio/scheduler.ts`, find the two `playMelodyTimbre` call sites in the lead block and the two in the support block (Phase 2 work). Add `leadVoice.id` and `supportVoice.id` as the trailing argument:

```ts
playMelodyTimbre(audio, note.midi, noteTime, note.dur, leadVelBase, "mel", leadTimbre, leadVoice.id);
// ...
playMelodyTimbre(audio, note.midi, noteTime, note.dur, supVelBase, "mel", supportVoice.timbre, supportVoice.id);
```

(Plus the two anticipation calls — same treatment.)

- [ ] **Step 5: `deno task check && deno task test`**

Run: `deno task check && deno task test`
Expected: clean.

- [ ] **Step 6: Manual smoke test**

Run: `deno task dev`. Play, toggle improv. Audio still works; the two voices still sound distinct. (No mixer behaviour change visible yet — the mixer panel still has the single "melody" cell. That's fixed in Task 12.)

- [ ] **Step 7: Commit**

```bash
git add src/audio/voices.ts src/audio/timbres/rhodes.ts src/audio/timbres/vibraphone.ts src/audio/timbres/celesta.ts src/audio/timbres/bell.ts src/audio/scheduler.ts
git commit -m "feat(audio): route playMelodyTimbre to melody1/melody2 buses"
```

### Task 12: Update `index.html` — rename piano label, split melody cell

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Rename "piano" → "chords"**

In `index.html`, find the comp mixer cell (`<div class="kn-cell" id="mx-comp">` around line 743). Two changes inside that cell:

1. `aria-label="piano"` → `aria-label="chords"`
2. `<span class="kn-lbl">piano</span>` → `<span class="kn-lbl">chords</span>`

Do NOT change `data-track="comp"` or `id="mx-comp"` — audio routing keys are unchanged.

- [ ] **Step 2: Replace the single `mx-melody` cell with two cells**

Find the `<div class="kn-cell" id="mx-melody">` block (around line 758–771). Replace the entire cell (including its closing `</div>`) with two cells:

```html
<div class="kn-cell" id="mx-melody1">
  <div class="kn-wrap">
    <svg class="kn-svg" viewBox="0 0 52 52" aria-hidden="true">
      <circle class="kn-body" cx="26" cy="26" r="24"/>
      <path class="kn-track" d="M 13.27 38.73 A 18 18 0 1 1 38.73 38.73"/>
      <path class="kn-fill" d=""/>
      <circle class="kn-dot" cx="13.27" cy="38.73" r="3"/>
    </svg>
    <input class="kn-input" type="range" data-track="melody1"
      aria-label="mel 1" min="0" max="1" step="0.01" value="0.75"/>
  </div>
  <span class="kn-lbl">mel 1</span>
  <span class="kn-val" id="val-melody1">75</span>
</div>

<div class="kn-cell" id="mx-melody2">
  <div class="kn-wrap">
    <svg class="kn-svg" viewBox="0 0 52 52" aria-hidden="true">
      <circle class="kn-body" cx="26" cy="26" r="24"/>
      <path class="kn-track" d="M 13.27 38.73 A 18 18 0 1 1 38.73 38.73"/>
      <path class="kn-fill" d=""/>
      <circle class="kn-dot" cx="13.27" cy="38.73" r="3"/>
    </svg>
    <input class="kn-input" type="range" data-track="melody2"
      aria-label="mel 2" min="0" max="1" step="0.01" value="0.65"/>
  </div>
  <span class="kn-lbl">mel 2</span>
  <span class="kn-val" id="val-melody2">65</span>
</div>
```

- [ ] **Step 3: Commit (HTML-only)**

```bash
git add index.html
git commit -m "feat(ui): rename piano→chords; split melody cell into mel1/mel2"
```

### Task 13: Update `Settings` type + per-mood defaults + controls slider map

**Files:**
- Modify: `src/types.ts`
- Modify: `src/music/settings.ts`
- Modify: `src/ui/controls.ts`

- [ ] **Step 1: Update the `Settings` interface in types.ts**

In `src/types.ts`, find the `Settings` interface and update:

Replace:
```ts
readonly melody: number;
```

With:
```ts
readonly melody1: number;
readonly melody2: number;
```

(Keep `comp`. The `comp` key represents the audio bus, not the UI label — its UI label change to "chords" was already cosmetic in HTML.)

- [ ] **Step 2: Update `DEFAULT_SETTINGS` in music/settings.ts**

For each of the five moods, replace the line:
```ts
melody: <value>,
```

with:
```ts
melody1: <value>,
melody2: <value * 0.87>,  // pin a slightly quieter default for the support voice
```

Computed values:
- rainy: `melody: 0.7` → `melody1: 0.7, melody2: 0.61`
- late: `melody: 0.7` → `melody1: 0.7, melody2: 0.61`
- cafe: `melody: 0.8` → `melody1: 0.8, melody2: 0.7`
- sleepy: `melody: 0.8` → `melody1: 0.8, melody2: 0.7`
- transit: `melody: 0.75` → `melody1: 0.75, melody2: 0.65`

- [ ] **Step 3: Update the slider map in controls.ts**

In `src/ui/controls.ts`, find the `TRACK_SLIDERS` constant. Replace:

```ts
melody: 'input[data-track="melody"]',
```

with:

```ts
melody1: 'input[data-track="melody1"]',
melody2: 'input[data-track="melody2"]',
```

- [ ] **Step 4: `deno task check && deno task test`**

Run: `deno task check && deno task test`
Expected: clean. Existing `tests/state-init.test.ts` and `tests/settings.test.ts` may check shape — verify they still pass (they should, since they only reference structural properties).

- [ ] **Step 5: Manual smoke test — full feature**

Run: `deno task dev`. Open the controls panel:

- Knob labels read: `drums`, `bass`, `chords`, `mel 1`, `mel 2`, `hiss`, …
- Drag `mel 1` to 0 with improv on — coral notes still appear in the piano roll but you don't hear them. Drag `mel 2` to 0 — teal notes still appear but you don't hear them.
- Restore both to their defaults — both voices audible again.
- Switch mood — defaults reload as expected (rainy mel 1 = 70%, mel 2 = 61%, etc.).
- Piano roll still shows the four colours correctly.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/music/settings.ts src/ui/controls.ts
git commit -m "feat(ui): wire melody1/melody2 sliders + per-mood defaults"
```

---

## Post-implementation

After Task 13, the spec is fully delivered. Final acceptance test:

- [ ] **Run the full check + test pipeline**

```bash
deno task check && deno task test
```

Expected: 0 errors, all tests pass.

- [ ] **Acceptance listening: each mood for 60 seconds with improv on**

For each of `rainy`, `late`, `cafe`, `sleepy`, `transit`:
1. Switch to mood, press play, toggle improv on.
2. Listen 60 seconds. Watch piano roll.
3. **Pass criteria:**
   - Two distinct timbres audible in the melody range.
   - Piano roll shows coral + teal rectangles in different rhythmic positions.
   - At least one role swap visible during the window (the "busier" colour changes).
   - During a peak section, soloist breathing visible — one voice goes silent for a phrase while the other plays a dense run.
4. Adjust `mel 1` and `mel 2` sliders independently and confirm only the affected colour goes quieter.

- [ ] **Push and open PR**

```bash
git push -u origin feat/improv-mode
gh pr create --title "feat(improv): two-voice trading + piano-roll viz" --body "$(cat <<'EOF'
## Summary
- Collapse base-melody + lanes into a clean two-voice trading model with role-swap rolls at phrase boundaries
- Add a piano-roll viz to the `#vis` canvas (replaces the spectrum bars) — four colours, centred playhead, 4-bar window
- Split the `melody` track bus into `melody1`/`melody2`; rename the comp knob "piano" → "chords"

Spec: `docs/superpowers/specs/2026-05-18-melody-trading-design.md`
Plan: `docs/superpowers/plans/2026-05-18-melody-trading.md`

## Test plan
- [ ] `deno task check && deno task test` clean
- [ ] Each mood (rainy/late/cafe/sleepy/transit) for 60s with improv on: two distinct timbres audible, two colours visible on the piano roll, at least one role swap observed
- [ ] Independent `mel 1` / `mel 2` sliders work: zero'ing one silences only that colour
- [ ] Non-improv mode: only `mel 1` (coral) visible; `mel 2` absent
EOF
)"
```
