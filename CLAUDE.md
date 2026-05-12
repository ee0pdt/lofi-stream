# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`lofi forever` — a single-file, zero-dependency, generative lofi music player. Everything (HTML, CSS, JS) lives in `index.html` (~3.2k lines). No build step, no package manager, no tests, no framework.

## Running

Open `index.html` directly in a browser, or serve it (any static server works, e.g. `python3 -m http.server`). A user gesture is required before audio starts — `AudioContext` is created lazily inside `initAudio()`, triggered by the play button.

WebGPU is used for the background when available (`navigator.gpu`); otherwise the code falls back to a Canvas2D animation (`startCanvas2D()` around line 956). Both render into `#bg`.

## Known file corruption — fix on sight

The HTML file has unicode contamination from a prior paste/edit. Future edits should be careful not to reintroduce these, and ideally convert them when touching nearby code:

- **CSS custom properties use `–` (U+2013 en-dash) instead of `--`**: lines 22–48 define `–warm`, `–glass`, `–border`, etc., and `var(–glass)` is used throughout the stylesheet. These are invalid CSS — the browser silently drops every rule that references them. There are ~47 occurrences.
- **CSS strings use `‘ ’` (U+2018/U+2019 smart quotes) instead of `'`**: font-family declarations (`'DM Mono'`) and `@property` syntax descriptors (`syntax: '<color>'`) on lines 40, 45, 57. Also invalid.
- **Stray markdown code fences inside `<body>`**: lines 472, 527, 660, 688 contain literal ``` ``` ``` that render as visible text in the sheet UI.

Em-dashes (`—`) appearing in JS/CSS comments (`// ── Audio ──`) are intentional decoration and harmless.

## Architecture

Everything is one giant IIFE-style script at the bottom of the file. The file is organised top-down by concern, with banner comments (`// ── Section ──`) marking boundaries. Major sections:

### Background renderer (lines ~693–1107)
`tryWebGPU()` attempts a WebGPU pipeline with a fragment shader rendering 5 drifting Gaussian blobs over a base colour. Falls back to `startCanvas2D()` if WebGPU is unavailable. Both react to `bgAmplitude`, fed by the audio analyser via `updateBgAmplitude()`.

### Music generation
The generator is a deterministic-form / probabilistic-content system — the chord sequence is fixed per mood, but voicings, melodies, and ornaments are sampled fresh each bar.

- **`FORMS`** (lines ~1157–1359): per-mood compositional forms as ordered arrays of `{ bars, prog }` sections, where each `prog` is a 4-chord cycle of `[rootOffsetSemitones, voicingName]`. The form playhead (`formSectionIdx`, `formBarInSection`, `formBarInProg`) advances once per bar in `advanceFormPlayhead()`; sections loop in order.
- **`MOOD_META`** (lines ~1395–1452): per-mood timbral + harmonic config — BPM range, swing range, allowed keys (`key_pool`), reverb impulse parameters, snare/bass filter shaping, comp/melody timbre choice (`rhodes` / `vibraphone` / `guitar` / `pad` / `celesta`), and ambience type (`rain` / `traffic` / `room` / `wind`).
- **`VOICINGS`** (~line 1137): jazz chord-quality recipes (`min7`, `maj9`, etc.) as semitone-offset arrays.
- **`generatePhrase()` / `scheduleBar()`** (~lines 2310, 2374): generate one 4-bar melodic phrase per chord cycle, then schedule comp/melody/bass/drums for the next bar. `complexity` (0–1) gates re-comps, melodic ornaments, and walking-bass density.

### Web Audio scheduler (lines ~2536–2567)
Lookahead scheduler at 50 ms interval with a **3-second lookahead**. The 3 s buffer is deliberate: Safari throttles `setTimeout` to ~1 Hz when the tab is hidden, but the Web Audio clock keeps running, so pre-scheduled events still fire on time. `visibilitychange` resumes the `AudioContext` and immediately flushes the scheduler on tab restore.

### Audio graph (lines ~1483–1634, `initAudio()`)
Per-track gain nodes (`drums`, `bass`, `comp`, `melody`, `hiss`, `scratches`, `ambience`, `hum`) → `masterGain` → `DynamicsCompressor` → low-shelf + high-shelf filters (tape colour) → split into dry + reverb (`ConvolverNode` with a per-mood IR built by `buildIR()`) → `AnalyserNode` → destination. Rain, ambience, hum, and a global wow/flutter LFO bus (`warpModGain`, summed into oscillator `detune` params via `applyWarp()`) are constructed once here.

### Mood switching (lines ~3055–3100, `changeMood()`)
Crossfades master gain down (0.7 s), swaps mood, regenerates a fresh progression, rebuilds reverb IR, restarts ambience, then fades up (1.2 s) to the new mood's saved volume. Each mood has its own slider state in `moodSettings` (cloned from `DEFAULT_SETTINGS`) — switching moods restores that mood's last-used mixer values.

### UI
A draggable bottom sheet (lines ~3114–3163) with a Web Audio frequency-band visualiser (`drawVis()`, ~line 2667). Most controls are plain `<input type="range">` elements wired to `applySettingToAudio(key, val)` which routes each slider to the relevant `AudioParam`.

## Conventions

- All audio scheduling uses `actx.currentTime` and absolute times — never `setTimeout` for note timing.
- New oscillators that should respond to global warp must be wired through `applyWarp(osc)` after creation.
- Per-mood differences belong in `MOOD_META` and `FORMS` — avoid `if (currentMood === ...)` branches deep in the scheduler; add a config field instead.
