# Improv Mode Design

**Date:** 2026-05-18  
**Status:** Draft

## Overview

Add an **Improv mode** toggle alongside the existing mood buttons. When active, the scheduler replaces the fixed `FORMS` loop with a dynamic section sequencer that moves through energy arcs (break → normal → buildup → peak → bridge → …), driving melody density, rhythmic variation, and dynamic level as a function of current energy. The existing composed behaviour is completely unchanged when Improv is off.

## UI

A new **Improv** button sits in the mood button row (alongside Rainy, Late, Cafe, Sleepy, Transit). It is a mode overlay, not a mood — clicking it activates Improv on the currently selected mood, clicking it again (or switching mood) returns to composed mode. The button uses the same visual style as mood buttons but with a distinct accent colour and a label like `improv`.

State: `isImprov: boolean` added to `AppState` in `src/types.ts` and `state-init.ts`.

## Architecture

### `src/music/improv-sequencer.ts` (new)

Owns all Improv-mode structural logic. Exposes:

```ts
interface ImprovState {
  sectionType: "normal" | "buildup" | "peak" | "break" | "bridge";
  dynamicLevel: number;        // 0.0–1.0
  barsRemaining: number;
}

function initImprovState(): ImprovState
function advanceImprovSection(state: ImprovState, mood: Mood, rng?: () => number): ImprovState
```

**Section types and behaviour:**

| Type | Dynamic level | Bar length | Description |
|------|--------------|------------|-------------|
| `normal` | 0.4–0.6 | 8–16 | Current composed behaviour; baseline energy |
| `buildup` | 0.6–0.8 | 4–8 | Rising energy; denser melody, louder drums |
| `peak` | 0.8–1.0 | 4–8 | Maximum density; fullest phrases |
| `break` | 0.0–0.2 | 2–4 | Near-silence; 1–2 melody notes, brush hats only |
| `bridge` | 0.3–0.6 | 4–8 | Alternate chord substitution; lighter feel |

**Macro-arc transitions** (weighted, sampled per section end):

```
normal   → buildup (0.3), break (0.2), bridge (0.2), normal (0.3)
buildup  → peak (0.6), normal (0.4)
peak     → normal (0.7), break (0.3)
break    → normal (0.8), bridge (0.2)
bridge   → normal (0.7), buildup (0.3)
```

Transitions are never identical two cycles in a row (last-section rejection sampling).

### `src/music/phrase.ts` — extended

`GeneratePhraseOptions` gains two new optional fields:

```ts
phraseStyle?: "sparse" | "normal" | "dense";
seedNote?: number;   // last MIDI note of previous phrase's call
```

**`sparse`** (break sections): at most 2 notes per bar, long `dur`, no passing notes, no anticipations.

**`dense`** (buildup/peak sections): fills more beats; adds chromatic approach notes (a semitone below the target chord tone, `dur` ~1/16th note, scheduled just before the landing beat); uses anticipation more aggressively; allows a quick passing note run on beat 3–4.

**`normal`**: existing behaviour, unchanged.

**Call/response with `seedNote`**: if `seedNote` is provided, the response bars (2–3) begin from or near that pitch rather than always anchoring to the chord root. The response resolves downward to the root or 5th by bar 4. This gives phrases a conversational shape across the 4-bar unit.

Chromatic approach notes are the only "jazz inflection" added — one semitone below (or above) a chord tone, very short duration, lands just before the beat. No blue-note or scale-theory constraints.

### `src/music/moods.ts` — extended

`MoodMeta` gains:

```ts
improv: {
  peakDensityCap: number;   // max dynamicLevel for this mood (0.6–1.0)
  bridgeSubstitutions: readonly [rootOffset: number, voicingName: string][];
}
```

`sleepy` and `rainy` get lower `peakDensityCap` (~0.7); `cafe` and `late` get higher (~1.0). `bridgeSubstitutions` is exactly 4 chords as `[rootOffsetSemitones, voicingName]` pairs — the same constraint as `FORMS` progs, and voicing names must exist in `VOICINGS`. Used in place of the normal `prog` during `bridge` sections.

### `src/audio/scheduler.ts` — changes

`scheduleBar` reads `store.get().isImprov`. When true:
- Calls `advanceImprovSection` at the end of each section (instead of the fixed form loop).
- Derives `phraseStyle` from `dynamicLevel`: `< 0.25` → `sparse`, `> 0.65` → `dense`, else `normal`.
- Passes `dynamicLevel` as an additional velocity/gain scalar to `playComp`, `playBass`, and the drum step scheduler (scales kick/snare velocity, not hat; floor of `0.15` so break sections retain a brush feel rather than full silence).
- Passes the last note of the previous phrase's call bars as `seedNote` into the next `generatePhrase` call. `seedNote` resets to `null` at each new section boundary so phrasing starts fresh after a section change.

When Improv is off, `scheduleBar` is unchanged.

### `src/ui/mood-ui.ts` — changes

Adds the Improv button to the mood row. Clicking it dispatches `store.set({ isImprov: !isImprov })`. Mood switches reset `isImprov` to `false` — the scheduler's `newProgression` call (triggered by mood change) also calls `initImprovState()` to reset arc state so a subsequent Improv activation always starts fresh.

## Data flow

```
store.isImprov
    ↓
scheduler.scheduleBar()
    ↓ reads
improv-sequencer.ImprovState  →  phraseStyle, dynamicLevel, prog (bridge or normal)
    ↓
generatePhrase(prog, { phraseStyle, seedNote, complexity, … })
    ↓
playComp / playMelody / playBass / drums  ← velocity scaled by dynamicLevel
```

## What does NOT change

- `FORMS` — untouched; used as-is in composed mode and as the `normal` section pool in Improv mode.
- All timbre modules — no changes.
- Audio graph — no new nodes; `dynamicLevel` only scales existing `AudioParam` values.
- Per-mood mixer settings — Improv mode does not touch the user's saved mixer state.

## Testing

- `src/music/improv-sequencer.ts` is pure (injectable RNG) — unit tests cover transition weights, last-section rejection, and `dynamicLevel` clamping per mood cap.
- `generatePhrase` tests extended to cover `phraseStyle` variants and `seedNote` behaviour.
- Manual listening test: verify break sections are noticeably quieter, peak sections are denser, bridge sections use the substitution chords.

## Out of scope

- Cross-mood drift (key/BPM wandering between mood territories).
- Blue notes or mode-specific scale constraints.
- Improv mode persisted across page reloads.
