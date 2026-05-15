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
│   ├── voices.ts               ← playComp/playMelody dispatchers (pick timbre
│   │                              from MOOD_META then call timbres/*) + playBass.
│   ├── timbres/                ← one file per instrument; all pure Web Audio,
│   │   ├── routing.ts          │    no music logic. Each file exports a single
│   │   ├── rhodes.ts           │    play* function: (audio, midi, time, dur,
│   │   ├── vibraphone.ts       │    vel, role?) → void. routing.ts maps role
│   │   ├── guitar.ts           │    strings to trackKey + rowId.
│   │   ├── pad.ts              │
│   │   ├── coldsynth.ts        │
│   │   ├── celesta.ts          │
│   │   ├── bell.ts             │
│   │   ├── kick.ts             │
│   │   ├── snare.ts            │
│   │   └── hat.ts              ←
│   ├── ambience.ts             ← per-mood ambience: noise beds, scheduled
│   │                              siren (late), clinks (cafe), rain layers.
│   ├── timing.ts               ← midiToFreq, beatDur, swungTime.
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

`changeMood` in `src/main.ts`: fades master gain down (0.7 s), then at the end of the fade-out severs the scheduled lookahead — disconnects the `drums`/`bass`/`comp`/`melody` track gains from master and replaces them with fresh `GainNode`s — so oscillators already queued for the old mood play out into orphaned nodes and never reach the bus. The old `nextBarTime` (parked ~3 s out at the tail of the old buffer) is reset via `resetSchedulerTime` so the first new-mood bar lands during the fade-in. Then swaps `store.currentMood`, applies the new mood's saved mixer settings, calls `newProgression` (which rolls a fresh key/BPM/swing for the mood and rebuilds the reverb IR), restarts ambience, and fades master up (1.2 s) to the new mood's saved volume. Hiss, scratches, ambience, hum, and rain are left wired during the swap so they cross-fade with master. Each mood has its own slider state in the controls module's `moodSettings` map — switching moods restores that mood's last-used mixer values.

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

## One bar, start to finish

This is the path a single bar takes through the system — useful when tracing a bug or adding a new instrument.

1. **`tick()`** (scheduler.ts) fires every 50 ms via `setTimeout`. It loops while `nextBarTime < actx.currentTime + 3.0`, calling `scheduleBar()` for each bar that falls inside the lookahead window.

2. **`scheduleBar()`** reads the current form position to get the active `prog` — a 4-chord array of `[rootOffsetSemitones, voicingName]`. It resolves the root MIDI note, looks up the voicing intervals from `VOICINGS`, and schedules:
   - **Comp** — `playComp()` in `voices.ts`, which dispatches to the timbre chosen in `MOOD_META[mood].compTimbre` (e.g. `playRhodes`).
   - **Melody** — `playMelody()` similarly dispatches on `melTimbre`. The melody is drawn from a 4-bar `Phrase` generated once per section by `generatePhrase()` and cached in `currentPhrase`.
   - **Bass** — `playBass()` (in `voices.ts`) schedules up to 4 walking-bass notes directly.
   - **Drums** — kick, snare, hat, open-hat scheduled step by step from the 16-step pattern arrays, with swing applied by `swungTime()`.

3. Every **timbre function** (`src/audio/timbres/*.ts`) creates oscillators/noise nodes, sets up envelope `AudioParam` ramps, connects through a spatial panner, and routes its output to the appropriate track gain node (`audio.trackGains.comp`, `.melody`, `.bass`, `.drums`). It calls `osc.start(time)` and `osc.stop(time + dur + 0.05)` — the node is self-disposing.

4. All track gains flow to `masterGain` → compressor → tape EQ → dry+reverb split → analyser → destination.

5. After scheduling, `currentProgIdx` is incremented and `advancePlayhead()` moves the form cursor. `nextBarTime` advances by one bar duration.

## Glossary

Domain terms used throughout the codebase:

| Term | Meaning |
|------|---------|
| **mood** | One of the named scenes (`rainy`, `late`, `cafe`, `sleepy`). Controls BPM range, swing, allowed keys, reverb shape, timbre choices, and ambience type. |
| **form** | The overall song structure for a mood: an ordered list of sections that loop. Defined in `FORMS` (`src/music/forms.ts`). |
| **section** | One unit within a form: a `{ bars, prog }` pair. The scheduler plays the section's `prog` for `bars` bars before advancing to the next section. |
| **prog** | Short for "chord progression". An array of 4 `[rootOffset, voicingName]` pairs that cycle within a section. |
| **rootOffset** | Semitone offset from `currentKey` to the chord root. `0` = tonic, `5` = fourth, `7` = fifth, etc. |
| **voicing** | A chord quality recipe: an array of semitone intervals above the root. Defined in `VOICINGS` (`src/music/voicings.ts`). E.g. `min7 = [0, 3, 7, 10]`. |
| **phrase** | A 4-bar melodic sequence generated by `generatePhrase()`. Generated fresh at the start of each section, then reused bar-by-bar until the next section. |
| **comp** | The chordal/harmonic instrument (comping). Track gain key: `comp`. |
| **mel / melody** | The single-note melodic line. Track gain key: `melody`. |
| **timbre** | Which instrument plays comp or melody for a given mood — e.g. `rhodes`, `vibraphone`, `guitar`, `pad`, `coldsynth`, `celesta`, `bell`. Set in `MOOD_META[mood].compTimbre` / `melTimbre`. |
| **role** | A string tag passed to timbre functions to distinguish comp (`"rhodesComp"`) from melody (`"rhodesMel"`). `roleRouting()` maps it to a track gain key and mixer row ID. |
| **warp** | The global wow/flutter LFO. Oscillators wired through `applyWarp()` have their detune modulated by a shared LFO, giving the tape-warble effect. |
| **swing** | Delay applied to off-beat 16th-note steps via `swungTime()`. A value of `0` is straight; `~0.08–0.12` is a loose jazz shuffle. |
| **BPM** | Tempo in beats per minute. Randomised within `MOOD_META[mood].bpmRange` on each `newProgression()` call. |
| **lookahead** | The 3-second window the scheduler fills ahead of `actx.currentTime`. Sized for Safari's throttled background tab behaviour. |
| **ambience** | The non-musical background layer for a mood: rain, traffic noise, café clinks, etc. Lives in `src/audio/ambience.ts`, bypasses the track gains. |
