# Architecture

## Overview

`lofi forever` is a single-page, zero-runtime-dependency generative lofi music player. `index.html` is a shell (DOM + inline `<style>`) plus one `<script type="module" src="./dist/main.js">`. All runtime behaviour lives in TypeScript modules under `src/`, bundled to `dist/main.js` by `scripts/build.ts`.

## Running locally

`deno task dev` — local dev server on port 8000. Opening `index.html` directly via `file://` no longer works (native ES modules cannot load from the filesystem).

A user gesture is required before audio starts: the `AudioContext` is created lazily inside the play-button click handler in `src/main.ts`.

## Module layout

```
src/
├── main.ts                     ← entry point. Builds the store, mounts every
│                                  subsystem, orchestrates audio boot + play/pause.
├── store.ts                    ← tiny Zustand-style reactive store (~40 LOC).
├── state-init.ts               ← initialAppState() factory.
├── types.ts                    ← shared types: Mood, AppState, AudioRefs,
│                                  MoodSettings, etc.
├── music/                      ← pure data + helpers (no Web Audio)
│   ├── voicings.ts             ←   jazz chord-quality recipes
│   ├── forms.ts                ←   per-mood compositional forms
│   ├── moods.ts                ←   MOOD_META (BPM, swing, key pool, reverb,
│   │                                timbre, ambience choice per mood)
│   ├── settings.ts             ←   DEFAULT_SETTINGS (per-mood mixer defaults)
│   ├── octaves.ts              ←   bassOct, melodyOct register clampers
│   ├── playhead.ts             ←   nextFormPosition, currentSectionProg
│   ├── bass.ts                 ←   walkingBassNotes
│   ├── phrase.ts               ←   generatePhrase (with injectable RNG)
│   └── drum-patterns.ts        ←   16th-note kick/snare/hat/ghost/open arrays
├── audio/
│   ├── graph.ts                ← initAudio (builds AudioRefs), applyWarp,
│   │                              buildIR, applyMoodReverb, makeSpatial,
│   │                              makeHaasSpatial, applySettingToAudio,
│   │                              noiseBuffer, SPATIAL constants.
│   ├── instruments.ts          ← playKick/Snare/Hat + playRhodes/Vibraphone/
│   │                              Guitar/Pad/Celesta + dispatchers playComp/
│   │                              playMelody + playBass, plus startTapeHiss,
│   │                              startScratches/playVinylScratch, flashRow,
│   │                              midiToFreq, beatDur, swungTime.
│   ├── ambience.ts             ← per-mood ambience: noise beds, scheduled
│   │                              siren (late), clinks (cafe), rain layers.
│   └── scheduler.ts            ← lookahead bar scheduler, scheduleBar,
│                                  newProgression, key/BPM setters. Owns the
│                                  form playhead + phrase cache + nextBarTime.
├── visual/
│   ├── webgpu.ts               ← WebGPU background renderer with shader.
│   ├── canvas2d.ts             ← Canvas2D fallback.
│   ├── analyser.ts             ← 32-band frequency visualiser + readAccentRgb.
│   └── background.ts           ← orchestrator: tries WebGPU, falls back to
│                                  Canvas2D. Also exports createAmplitudeReader.
└── ui/
    ├── play-button.ts          ← mount click handler, icon, status text + dot
    ├── controls.ts             ← every slider, mixer toggle, per-mood
    │                              moodSettings map, applyMoodSettings
    ├── mood-ui.ts              ← mood buttons, accent palette, active state
    └── sheet.ts                ← bottom-sheet drag (mouse + touch)
```

## Background renderer

`mountBackground` (in `src/visual/background.ts`) tries WebGPU first. If unavailable or it throws, falls back to `startCanvas2D`. Both render five drifting Gaussian blobs over a per-mood base colour; blob radius pulses on a smoothed amplitude value supplied by `createAmplitudeReader` (which polls `audio.analyser` per frame).

## Music generation

Deterministic-form / probabilistic-content system — the chord sequence is fixed per mood, but voicings, melodies, and ornaments are sampled fresh each bar.

- **`FORMS`** (`src/music/forms.ts`): per-mood compositional forms as ordered arrays of `{ bars, prog }` sections, where each `prog` is a 4-chord cycle of `[rootOffsetSemitones, voicingName]`. The form playhead advances once per bar in `src/audio/scheduler.ts`; sections loop in order.
- **`MOOD_META`** (`src/music/moods.ts`): per-mood timbral + harmonic config — BPM range, swing range, allowed keys, reverb impulse parameters, snare/bass filter shaping, comp/melody timbre choice, ambience type.
- **`VOICINGS`** (`src/music/voicings.ts`): jazz chord-quality recipes as semitone-offset arrays.
- **`generatePhrase`** (`src/music/phrase.ts`): pure 4-bar phrase generator with injectable RNG (default `Math.random`). Returns a fresh Phrase; never mutates caller state.
- **`scheduleBar`** (`src/audio/scheduler.ts`): generates one 4-bar melodic phrase per chord cycle, then schedules comp/melody/bass/drums for the next bar. The store's `complexity` value (0–1) gates re-comps, melodic ornaments, and walking-bass density.

## Web Audio scheduler

Lookahead scheduler in `src/audio/scheduler.ts`. 50 ms `setTimeout` tick interval with a 3-second lookahead. The 3 s buffer is deliberate: Safari throttles `setTimeout` to ~1 Hz when the tab is hidden, but the Web Audio clock keeps running, so pre-scheduled events still fire on time. `main.ts` registers a `visibilitychange` handler that resumes the `AudioContext` and immediately flushes the scheduler on tab restore.

## Audio graph

`initAudio` in `src/audio/graph.ts` builds the graph once on the first play click and returns an `AudioRefs` bag. Per-track gain nodes (`drums`, `bass`, `comp`, `melody`, `hiss`, `scratches`, `ambience`, `hum`) → `masterGain` → `DynamicsCompressor` → low-shelf + high-shelf filters (tape colour) → split into dry + reverb (`ConvolverNode` with a per-mood IR built by `buildIR`) → `AnalyserNode` → destination. Rain bus bypasses track gains (the rain slider is its own master). Ambience, hum, and a global wow/flutter LFO bus (`warpModGain`, summed into oscillator `detune` params via `applyWarp`) are constructed in the same call.

## Mood switching

`changeMood` in `src/main.ts`: crossfades master gain down (0.7 s), swaps `store.currentMood`, applies the new mood's saved mixer settings, calls `newProgression` (which rolls a fresh key/BPM/swing for the mood and rebuilds the reverb IR), restarts ambience, then fades up (1.2 s) to the new mood's saved volume. Each mood has its own slider state in the controls module's `moodSettings` map — switching moods restores that mood's last-used mixer values.

## UI

A draggable bottom sheet (`src/ui/sheet.ts`) with a Web Audio frequency-band visualiser (`src/visual/analyser.ts`). Most controls are plain `<input type="range">` elements wired by `src/ui/controls.ts` to dispatch each slider to `applySettingToAudio` (in `src/audio/graph.ts`), which routes it to the relevant `AudioParam`.

## State

Three places hold state, by intent:

- **`src/store.ts`** — reactive UI/settings state (`currentMood`, `isPlaying`, `complexity`, `moodSettings`, `currentSettings`). Subscribers fire only when their selected slice changes (`Object.is`).
- **`src/audio/graph.ts`** — the `AudioRefs` bag (long-lived audio node references). Created once by `initAudio` and passed explicitly to consumers. Not in the store because subscribing to a node reference is meaningless.
- **`src/audio/scheduler.ts`** — scheduler-internal state (form playhead, phrase cache, BPM, swing, key, nextBarTime, timer handle). Module-scope `let` bindings; nothing outside the scheduler subscribes to them. Mood changes call `newProgression` to roll fresh values.

## Conventions

- All audio scheduling uses `actx.currentTime` and absolute times — never `setTimeout` for note timing.
- New oscillators that should respond to global warp must be wired through `applyWarp(audio, osc)` after creation.
- Per-mood differences belong in `MOOD_META` and `FORMS` — avoid `if (currentMood === ...)` branches deep in the scheduler; add a config field instead.
- Audio refs (`AudioContext`, gain nodes, etc.) live in `src/audio/graph.ts`. Scheduler-internal state lives in `src/audio/scheduler.ts`. Reactive UI/settings state lives in `src/store.ts`. Don't mix the layers.
