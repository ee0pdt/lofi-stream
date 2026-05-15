# Instruments Split — Design Spec

**Date:** 2026-05-15  **Status:** Approved  **Project:** lofi-stream (`lofi forever`)

## Context

`src/audio/instruments.ts` is 588 lines and mixes unrelated concerns: pure math
utilities, percussion one-shots, five harmonic timbres, voice dispatchers, tape
noise, vinyl scratch, and a DOM flash side-effect. Adding a new timbre or
debugging a single instrument requires navigating the whole file.

## Goal

Split `instruments.ts` into focused modules so that each file answers one
question, and adding a new timbre in future requires only creating one new file
plus a single case in `voices.ts`.

## Non-goals

- No behaviour changes. Every function is moved verbatim.
- No new tests beyond what the existing suite already covers (audio testing is
  a separate workstream).
- No changes to `scheduler.ts`, `graph.ts`, or any UI module beyond updating
  import paths.

## Module layout after refactor

```
src/audio/
├── timing.ts          ← midiToFreq, beatDur, swungTime  (pure math, no Web Audio)
├── timbres/
│   ├── kick.ts        ← playKick
│   ├── snare.ts       ← playSnare
│   ├── hat.ts         ← playHat
│   ├── rhodes.ts      ← playRhodes
│   ├── vibraphone.ts  ← playVibraphone
│   ├── guitar.ts      ← playGuitar
│   ├── pad.ts         ← playPad
│   ├── celesta.ts     ← playCelesta
│   ├── bell.ts        ← playBell
│   └── coldsynth.ts   ← playColdsynth
├── voices.ts          ← playComp, playMelody, playBass
├── ambience.ts        ← gains startTapeHiss, startScratches, playVinylScratch
│                         (startTapeHiss/startScratches/playVinylScratch move here
│                          from instruments.ts; existing ambience code unchanged)
└── instruments.ts     ← DELETED
src/ui/
└── flash.ts           ← flashRow  (moved from instruments.ts)
```

## Design decisions

### One file per timbre under `timbres/`

Each timbre file exports a single `play*` function and imports only from
`../timing.ts`, `../graph.ts`, and `../rand.ts`. No cross-timbre imports.
Percussion (`kick`, `snare`, `hat`) follow the same pattern — they are timbres,
just unpitched.

### `voices.ts` owns dispatchers

`playComp` and `playMelody` read `MOOD_META[mood].compTimbre` /
`melodyTimbre` and dispatch to the correct timbre file. `playBass` is a
standalone pitched voice that lives here alongside them.

`scheduler.ts` imports `playKick`, `playSnare`, `playHat` directly from their
`timbres/` files — drums are not dispatched through a timbre choice so a
`playDrums` dispatcher would add indirection without value.

### Tape noise and vinyl scratch stay in `ambience.ts`

`startTapeHiss`, `startScratches`, and `playVinylScratch` are atmospheric
texture, not musical pitches. `startScratches` schedules `playVinylScratch`
internally — keeping them co-located avoids a circular dependency. They slot
naturally alongside the existing noise-bed code in `ambience.ts`.

### `flashRow` moves to `src/ui/flash.ts`

`flashRow` is a DOM side-effect (CSS flash on a mixer row). It has no audio
logic. Moving it to the UI layer removes the only DOM dependency from the audio
module tree.

## Import rule summary

| File | May import from |
|---|---|
| `timbres/*.ts` | `../timing.ts`, `../graph.ts`, `../rand.ts`, `../../music/*`, `../../types.ts`, `../../ui/flash.ts`* |
| `voices.ts` | `./timbres/*`, `./timing.ts`, `../../music/moods.ts`, `../../types.ts`, `../../store.ts` |
| `ambience.ts` | `./graph.ts`, `./timing.ts`, `./rand.ts`, `../music/*`, `../types.ts` |
| `ui/flash.ts` | nothing audio-related |

\* `flashRow` is a DOM side-effect called from within instrument voices (pre-existing coupling). Moving it to `ui/flash.ts` makes the dependency explicit rather than hidden inside `instruments.ts`.

## Migration approach

Single feature branch `feat/split-instruments`, single PR. Each step ends with
`deno task check && deno task test && deno task build` passing.

| Step | Action |
|---|---|
| 1 | Create `src/audio/timing.ts`. Update all import sites. |
| 2 | Create `src/ui/flash.ts`. Update import in `instruments.ts`. |
| 3 | Create `src/audio/timbres/` files one by one. Each replaces its function in `instruments.ts` with a re-export until all are moved. |
| 4 | Create `src/audio/voices.ts`. Remove dispatchers from `instruments.ts`. |
| 5 | Move tape/scratch noise into `ambience.ts`. Remove from `instruments.ts`. |
| 6 | Delete `instruments.ts`. Fix all remaining import sites. |

## Risks

- **Import cycle:** `ambience.ts` already imports from `graph.ts`. Adding
  tape-noise functions that also use `graph.ts` helpers is safe — no new cycle.
- **`cachedCelestaIR`:** This module-scope cache in `instruments.ts` moves
  wholesale into `timbres/celesta.ts`. No other timbre reads it.
- **`scheduler.ts` import list grows slightly:** Three new imports
  (`./timbres/kick`, `./timbres/snare`, `./timbres/hat`) replace one
  (`./instruments`). Acceptable.
