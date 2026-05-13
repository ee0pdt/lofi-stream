# Final Modularization — Design Spec

**Date:** 2026-05-12 **Status:** Approved, awaiting implementation plan **Project:** lofi-stream
(`lofi forever`)

## Context

Phases 0–4 of the original production-ready-OSS migration are merged. Tooling is in place
(Deno, dev server, build, unicode scanner, CI), pure data and helpers have been extracted to
`src/music/`, and a `<script type="module">` bridge wires those exports onto `window` so the
inline `<script>` (wrapped in a `lofi:ready` listener) can use them.

What remains inline in `index.html` is roughly 2400 lines of **stateful runtime code**: the
audio graph (`initAudio()`, master bus, reverb, warp LFO), instrument synths
(`buildKick`/`buildSnare`/`buildRhodes` etc.), the scheduler (lookahead loop, `scheduleBar`,
`generatePhrase`), the visual layer (WebGPU + Canvas2D background, frequency-band visualiser),
and UI wiring (sliders, sheet drag, mood buttons, mixer cascade).

This spec describes a single-PR refactor that extracts all of it, replaces the `window.*`
bridge with proper imports, introduces a tiny reactive store for UI/settings state, and
reduces `index.html` to a DOM shell. After this PR the spec-Phases 4–9 in the original
production-ready-OSS design are all complete.

## Non-goals

- Changing audible behaviour. The browser experience is byte-equivalent (subject to
  refactor risk — see Risks).
- Adding browser-level audio test infrastructure. Deno tests stay limited to pure logic;
  audio/visual/UI runtime is verified by manual browser QA.
- Replacing Web Audio, WebGPU, or any external API.
- Introducing a UI framework, router, or component library.
- Bundling CSS to a separate file. The `<style>` block stays inline in `index.html` — it's
  small enough that a separate file would add ceremony without benefit.

## Decisions

### State management — Zustand-style store, scope-limited

A small in-repo store module (`src/store.ts`, ~40 LOC) cribs Zustand's API surface:

```ts
interface Store<T> {
  get(): T;
  set(partial: Partial<T> | ((s: T) => Partial<T>)): void;
  subscribe<U>(selector: (s: T) => U, listener: (val: U, prev: U) => void): () => void;
}
```

The store holds **only reactive UI/settings state**:

```ts
interface AppState {
  currentMood: MoodName;
  isPlaying: boolean;
  complexity: number;
  moodSettings: Record<MoodName, MoodSettings>;
  currentSettings: MoodSettings;
}
```

`currentSettings` is a denormalised mirror of `moodSettings[currentMood]` — useful for
fast slider-read paths where you don't want to look up the mood key on every event.

**Not in the store:**

- **Audio node references** (`actx`, `masterGain`, `convolver`, `analyser`, `trackGains`,
  ambience sources, warp LFO bus) live in `src/audio/graph.ts` as module-level refs set by
  `initAudio()`. They're long-lived resources, not reactive values; putting them through the
  subscribe machinery would be dead weight.
- **Scheduler-internal state** (form playhead `formSectionIdx`/`formBarInSection`/
  `currentProgIdx`, `currentPhrase` cache, `phraseBarIdx`, lookahead clock) lives as
  module-scope `let`s inside `src/audio/scheduler.ts`. Nothing outside the scheduler
  subscribes to it; mood-change resets it via a direct call from the cascade handler.

### RNG injection with `Math.random` default

The 24 `Math.random()` call sites in inline code split into:

- **Visual** (background blob phases, noise in IR builder): unchanged. These keep
  `Math.random()` direct.
- **Music** (`generatePhrase`, scheduling probability checks, comp ornaments, ghost notes):
  modules accept an `rng: () => number = Math.random` parameter.

Browser runtime is byte-identical to today (default is `Math.random`). Tests can pass a
seeded Mulberry32 to verify structural invariants of `generatePhrase` — number of bars
returned, MIDI range, beat alignment, duration totals.

We **do not** snapshot-test the actual note content. The point of the injection is
testability of structural properties, not freezing the aesthetic.

### Entry point: drop the `lofi:ready` bridge

After Phase 4, the inline `<script>` is wrapped in a `window.addEventListener("lofi:ready", …)`
listener fired by a bridge `<script type="module">` that exposes module exports on `window`.
This pattern is replaced by:

```html
<script type="module" src="./dist/main.js"></script>
```

`src/main.ts` exports nothing. It runs at module load, builds the store, mounts the UI,
mounts the background, and registers the play-button click handler that lazily creates the
`AudioContext` on first user gesture (unchanged constraint — Web Audio requires a gesture).

`AudioRefs` (the bundle of audio node references built by `initAudio`) is passed explicitly
to the scheduler and cascade wirers. No `window.*` traffic remains.

## Architecture

### Module layout

```
src/
├── main.ts                  ← entry: build store, mount subsystems, wire play button
├── store.ts                 ← Zustand-style: get/set/subscribe (+ unit tests)
├── state-init.ts            ← initialAppState() factory: per-mood defaults from MOOD_META
├── types.ts                 ← (existing) extended with AppState, AudioRefs
├── music/
│   ├── voicings.ts          ← (existing)
│   ├── forms.ts             ← (existing)
│   ├── moods.ts             ← (existing)
│   ├── settings.ts          ← (existing)
│   ├── octaves.ts           ← (existing)
│   ├── playhead.ts          ← (existing)
│   ├── bass.ts              ← (existing)
│   ├── phrase.ts            ← NEW: generatePhrase(prog, rng) + tests
│   └── drum-patterns.ts     ← NEW: KICK/SNARE/HAT/GHOST/OPEN patterns
├── audio/
│   ├── graph.ts             ← NEW: initAudio, masterGain, reverb IR, warp LFO bus,
│   │                              applyWarp, applySettingToAudio. Owns AudioRefs.
│   │                              Exports wireMoodCascade/wireMixerCascade.
│   ├── instruments.ts       ← NEW: buildKick/Snare/Hat + comp-family dispatcher
│   │                              (rhodes/vibraphone/guitar/pad/celesta), buildBass
│   ├── ambience.ts          ← NEW: rain/traffic/room/wind generators
│   └── scheduler.ts         ← NEW: lookahead loop, scheduleBar, scheduler-internal state.
│                                   Exports resetSchedulerStateForMoodChange() for the cascade.
├── visual/
│   ├── webgpu.ts            ← NEW: tryWebGPU + shader
│   ├── canvas2d.ts          ← NEW: fallback
│   ├── analyser.ts          ← NEW: drawVis (32-band frequency display)
│   └── background.ts        ← NEW: orchestrate WebGPU → Canvas2D fallback
└── ui/
    ├── controls.ts          ← NEW: slider/button event wiring + applySettingToAudio dispatch
    ├── sheet.ts             ← NEW: bottom sheet drag (mouse + touch)
    ├── mood-ui.ts           ← NEW: mood buttons + MOOD_UI colour application
    └── play-button.ts       ← NEW: play/pause icon swap, click handler
```

`index.html` after refactor:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>lofi forever</title>
  <style>/* CSS stays inline */</style>
</head>
<body>
  <canvas id="bg"></canvas>
  <button id="playBtn">…</button>
  <!-- mood buttons, bottom sheet, mixer, visualiser canvas -->
  <script type="module" src="./dist/main.js"></script>
</body>
</html>
```

### Initialisation flow

```ts
// src/main.ts
import { createStore } from "./store.ts";
import { initialAppState } from "./state-init.ts";
import { mountBackground } from "./visual/background.ts";
import { mountControls } from "./ui/controls.ts";
import { mountSheet } from "./ui/sheet.ts";
import { mountMoodUI } from "./ui/mood-ui.ts";
import { mountPlayButton } from "./ui/play-button.ts";
import { initAudio } from "./audio/graph.ts";
import { startScheduler, stopScheduler } from "./audio/scheduler.ts";
import { wireMoodCascade, wireMixerCascade } from "./audio/graph.ts";

const store = createStore(initialAppState());

mountBackground(document.getElementById("bg")!, store);
mountControls(store);
mountSheet();
mountMoodUI(store);

let audio: AudioRefs | null = null;

mountPlayButton(async () => {
  if (!store.get().isPlaying) {
    if (!audio) {
      audio = await initAudio(store);
      wireMoodCascade(store, audio);
      wireMixerCascade(store, audio);
    }
    startScheduler(store, audio);
    store.set({ isPlaying: true });
  } else {
    stopScheduler();
    store.set({ isPlaying: false });
  }
});
```

### Mood-change cascade

Currently in inline code: `changeMood()` does crossfade-down → swap currentMood → regenerate
progression → rebuild reverb IR → restart ambience → fade-up, and separately syncs slider
DOM to `moodSettings[mood]`.

After refactor, `wireMoodCascade(store, audio)` registers a single subscription:

```ts
store.subscribe(
  s => s.currentMood,
  async (newMood, oldMood) => {
    if (newMood === oldMood) return;
    await crossfadeDown(audio.masterGain);
    audio.rebuildReverbIR(newMood);
    audio.restartAmbience(newMood);
    resetSchedulerStateForMoodChange();
    store.set({ currentSettings: store.get().moodSettings[newMood] });
    await crossfadeUp(audio.masterGain, store.get().currentSettings.master);
  }
);
```

UI mood buttons call `store.set({ currentMood: "sleepy" })`. The cascade above runs.
Slider DOM sync happens via a separate `wireMixerCascade` subscription on `currentSettings`.

## Migration approach

Single feature branch `feat/final-modularization`, single PR, six atomic commits. Each
commit ends with `deno task check && test && build` passing. Browser QA at the marked
boundaries (C, D, E, F).

| # | Commit group | Scope | Browser QA |
|---|---|---|---|
| A | Scaffolding + store | Add `src/store.ts` (with unit tests), `src/state-init.ts`, extend `src/types.ts` with `AppState`/`AudioRefs`. New module dirs empty. No runtime change. | — |
| B | Music: phrase + drum patterns | Add `src/music/phrase.ts` with injectable RNG + tests for structural invariants. Add `src/music/drum-patterns.ts`. Inline still uses these via the existing window bridge. | — |
| C | Audio graph + instruments + ambience | Extract `initAudio`, master bus, reverb IR builder, warp LFO, `applyWarp`, `applySettingToAudio`, all `build*` instrument functions, ambience generators. Inline removes the corresponding declarations and calls `await initAudio(store)` instead. | Yes |
| D | Scheduler + visual | Extract lookahead loop, `scheduleBar`, scheduler-internal state, and `resetSchedulerStateForMoodChange`. Extract WebGPU/Canvas2D background + frequency-band visualiser. Inline removes corresponding code. | Yes |
| E | UI + store wiring | Extract sliders, sheet drag, mood UI, play button. Create the store in `main.ts`, wire cascades via `store.subscribe`. The `window.*` bridge starts shrinking — most exports no longer needed there. | Yes |
| F | Shell cutover | Reduce `index.html` to DOM + `<style>` + single `<script type="module" src="./dist/main.js">`. Delete `lofi:ready` bridge and listener wrapper. Update README/CONTRIBUTING if anything stale. | Full golden-path |

### Browser QA checklist (used at C, D, E, F)

1. Page loads, no console errors.
2. Click play. AudioContext starts. Music plays.
3. Each mood button switches mood with crossfade; reverb character changes audibly.
4. Each slider changes the expected audio property (drums vol, bass vol, master, reverb wet,
   tape colour, swing, warp, hiss, scratches, ambience, hum, comp brightness, stereo width).
5. Mixer state persists per mood — switch mood, change a slider, switch back, slider matches.
6. Background renders (WebGPU on supported, Canvas2D fallback elsewhere).
7. Bottom sheet drags up/down on both mouse and touch.
8. Frequency-band visualiser reacts to audio.
9. Click pause. Audio stops. Click play again. Resumes correctly.
10. Hide tab for >5 s, restore. Scheduler resumes without timing glitch.

## Risks

1. **Refactor changes the order of `Math.random` calls.** Even with the default RNG = `Math.random`,
   if extraction reorders calls (e.g. moving a probability check above a chord-tone pick),
   the *distribution* of musical decisions shifts. Mitigation: keep RNG call sites in
   identical order to the inline original; review the diff for `Math.random` reorderings
   explicitly; ear-check in browser QA.

2. **Audio graph init order is sensitive.** The warp LFO bus must exist before any oscillator
   connects to it via `applyWarp`. The reverb convolver must have an IR loaded before
   anything routes through it. Mitigation: preserve original initialisation order line-for-line
   in `audio/graph.ts`; add a brief comment at the top of `initAudio` noting the ordering
   constraint.

3. **Scheduler timing is fragile.** The 50 ms tick + 3 s lookahead constants are tuned for
   Safari throttling behaviour. Mitigation: extract values as named constants
   (`SCHEDULER_INTERVAL_MS`, `SCHEDULER_LOOKAHEAD_S`) with comments explaining why they're
   what they are. Do not change the values.

4. **Mood-change cascade reordering.** Currently inline `changeMood()` does
   crossfade-down → mood swap → IR rebuild → ambience restart → fade-up in a specific
   sequence. The store-subscription approach re-implements this same sequence inside the
   subscription callback. Mitigation: line-by-line comparison; the subscription handler
   is essentially the body of `changeMood()` moved verbatim.

5. **First-user-gesture audio constraint.** `AudioContext` must be created inside a user
   gesture handler. The new `initAudio(store)` is awaited inside the play-button click
   handler — same constraint, same lifetime. Mitigation: spec'd above; verify in QA step 2.

## Open questions

None at spec-approval time. Implementation plan will resolve open code-level choices (file
naming for instruments, exact signature of `wireMoodCascade`, etc.).
