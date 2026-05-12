# Architecture

## Overview

`lofi forever` is a single-page, zero-runtime-dependency generative lofi music player. Today everything (HTML, CSS, JS) lives in `index.html`. Migration to ES modules under `src/` is in progress — see `docs/superpowers/specs/2026-05-12-production-ready-oss-design.md`.

## Running locally

- `deno task dev` (once Phase 2 lands) — local dev server on port 8000
- Until Phase 2: open `index.html` directly in a browser

A user gesture is required before audio starts: `AudioContext` is created lazily inside `initAudio()`, triggered by the play button.

WebGPU is used for the background when available (`navigator.gpu`); otherwise Canvas2D (`startCanvas2D()`). Both render into `#bg`.

## Known file corruption (temporary — fixed in Phase 1)

The HTML file has unicode contamination from a prior paste/edit. Phase 1 of the migration fixes this and the `scripts/check-unicode.ts` scanner prevents reintroduction:

- **CSS custom properties use `–` (U+2013 en-dash) instead of `--`** — these are invalid CSS, browser silently drops every rule referencing them
- **CSS strings use `'` `'` (U+2018/U+2019 smart quotes) instead of `'`** — font-family declarations and `@property` syntax descriptors
- **Stray markdown code fences inside `<body>`** — render as visible text in the sheet UI

Em-dashes (`—`) in comments are intentional decoration and harmless.

## Background renderer

`tryWebGPU()` attempts a WebGPU pipeline with a fragment shader rendering 5 drifting Gaussian blobs over a base colour. Falls back to `startCanvas2D()` if WebGPU is unavailable. Both react to `bgAmplitude`, fed by the audio analyser via `updateBgAmplitude()`.

## Music generation

Deterministic-form / probabilistic-content system — the chord sequence is fixed per mood, but voicings, melodies, and ornaments are sampled fresh each bar.

- **`FORMS`**: per-mood compositional forms as ordered arrays of `{ bars, prog }` sections, where each `prog` is a 4-chord cycle of `[rootOffsetSemitones, voicingName]`. The form playhead (`formSectionIdx`, `formBarInSection`, `formBarInProg`) advances once per bar in `advanceFormPlayhead()`; sections loop in order.
- **`MOOD_META`**: per-mood timbral + harmonic config — BPM range, swing range, allowed keys (`key_pool`), reverb impulse parameters, snare/bass filter shaping, comp/melody timbre choice (`rhodes` / `vibraphone` / `guitar` / `pad` / `celesta`), and ambience type (`rain` / `traffic` / `room` / `wind`).
- **`VOICINGS`**: jazz chord-quality recipes (`min7`, `maj9`, etc.) as semitone-offset arrays.
- **`generatePhrase()` / `scheduleBar()`**: generate one 4-bar melodic phrase per chord cycle, then schedule comp/melody/bass/drums for the next bar. `complexity` (0–1) gates re-comps, melodic ornaments, and walking-bass density.

## Web Audio scheduler

Lookahead scheduler at 50 ms interval with a **3-second lookahead**. The 3 s buffer is deliberate: Safari throttles `setTimeout` to ~1 Hz when the tab is hidden, but the Web Audio clock keeps running, so pre-scheduled events still fire on time. `visibilitychange` resumes the `AudioContext` and immediately flushes the scheduler on tab restore.

## Audio graph

`initAudio()`. Per-track gain nodes (`drums`, `bass`, `comp`, `melody`, `hiss`, `scratches`, `ambience`, `hum`) → `masterGain` → `DynamicsCompressor` → low-shelf + high-shelf filters (tape colour) → split into dry + reverb (`ConvolverNode` with a per-mood IR built by `buildIR()`) → `AnalyserNode` → destination. Rain, ambience, hum, and a global wow/flutter LFO bus (`warpModGain`, summed into oscillator `detune` params via `applyWarp()`) are constructed once here.

## Mood switching

`changeMood()`: crossfades master gain down (0.7 s), swaps mood, regenerates a fresh progression, rebuilds reverb IR, restarts ambience, then fades up (1.2 s) to the new mood's saved volume. Each mood has its own slider state in `moodSettings` (cloned from `DEFAULT_SETTINGS`) — switching moods restores that mood's last-used mixer values.

## UI

A draggable bottom sheet with a Web Audio frequency-band visualiser (`drawVis()`). Most controls are plain `<input type="range">` elements wired to `applySettingToAudio(key, val)` which routes each slider to the relevant `AudioParam`.

## Conventions

- All audio scheduling uses `actx.currentTime` and absolute times — never `setTimeout` for note timing.
- New oscillators that should respond to global warp must be wired through `applyWarp(osc)` after creation.
- Per-mood differences belong in `MOOD_META` and `FORMS` — avoid `if (currentMood === ...)` branches deep in the scheduler; add a config field instead.
