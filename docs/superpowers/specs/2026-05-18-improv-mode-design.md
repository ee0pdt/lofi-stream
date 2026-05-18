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
  dynamicLevel: number;        // 0.0–1.0, clamped to mood's peakDensityCap
  prog: readonly [Chord, Chord, Chord, Chord];
  barsRemaining: number;
}

function initImprovState(): ImprovState
function advanceImprovSection(state: ImprovState, mood: Mood, rng?: () => number): ImprovState
```

`advanceImprovSection` is responsible for clamping `dynamicLevel` to `MOOD_META[mood].improv.peakDensityCap` before returning the new state.

**Section types and behaviour:**

| Type | Dynamic level | Bar length | `prog` source | Description |
|------|--------------|------------|---------------|-------------|
| `normal` | 0.4–0.6 | 8–16 | random `FORMS[mood]` section | Baseline energy |
| `buildup` | 0.6–0.8 | 4–8 | random `FORMS[mood]` section | Rising energy; denser melody, louder drums |
| `peak` | 0.8–1.0 | 4–8 | random `FORMS[mood]` section | Maximum density; fullest phrases |
| `break` | 0.0–0.2 | 2–4 | random `FORMS[mood]` section | Near-silence; 1–2 melody notes, brush hats only |
| `bridge` | 0.3–0.6 | 4–8 | `MOOD_META[mood].improv.bridgeSubstitutions` | Alternate chord substitution; lighter feel |

When `prog` source is "random `FORMS[mood]` section", `advanceImprovSection` picks one section uniformly at random from the mood's form and uses its `prog`. The section's *declared* `bars` count is ignored — bar length comes from the sequencer's per-type range above. The composed-mode form playhead (`currentSectionProg` / `nextFormPosition`) is not consulted in Improv mode.

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
seedNote?: number;   // last MIDI note of the previous phrase, used as the
                     // anchor pitch for the new phrase's first note (bar 0)
```

**`sparse`** (break sections): at most 2 notes per bar, long `dur`, no passing notes, no anticipations.

**`dense`** (buildup/peak sections): fills more beats; adds chromatic approach notes (a semitone below the target chord tone, `dur` ~1/16th note, scheduled just before the landing beat); uses anticipation more aggressively; allows a quick passing note run on beat 3–4.

**`normal`**: existing behaviour, unchanged.

**Call/response with `seedNote`**: if `seedNote` is provided, the new phrase's bar-0 anchor (the call's first note) chooses the chord tone nearest in pitch to `seedNote` rather than always defaulting to the chord-1 tone. Within the phrase, the existing `isCall = barIdx < 2` split continues to shape bars 0–1 as call and 2–3 as response, with the response resolving downward toward the root or 5th by bar 4. The cross-phrase `seedNote` gives a conversational shape *between* phrases; the existing call/response shape lives *within* each phrase.

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
- Calls `advanceImprovSection` at the end of each section (instead of the fixed form loop) and uses the returned `prog` for the next section's bars.
- Derives `phraseStyle` from `dynamicLevel`: `< 0.25` → `sparse`, `> 0.65` → `dense`, else `normal`.
- Computes an **effective complexity** = `store.get().complexity * dynamicLevel` and passes that into `generatePhrase`. This means the user's complexity slider still scales overall busyness, but the section's energy arc shapes it further — so a high-complexity user still gets quiet breaks, and a low-complexity user still gets some lift at peak.
- Passes `dynamicLevel` as an additional velocity/gain scalar to `playComp`, `playBass`, and the drum step scheduler (scales kick/snare velocity, not hat; floor of `0.15` so break sections retain a brush feel rather than full silence).
- Passes the last MIDI note of the previous phrase (the final note emitted by the previous `generatePhrase` call, across all 4 bars) as `seedNote` into the next `generatePhrase` call. `seedNote` resets to `null` at each new section boundary so phrasing starts fresh after a section change.

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

- `src/music/improv-sequencer.ts` is pure (injectable RNG) — unit tests cover transition weights, last-section rejection, `dynamicLevel` clamping per mood cap, and that `prog` for non-bridge sections is sourced from `FORMS[mood]`.
- `generatePhrase` tests extended to cover `phraseStyle` variants and `seedNote` behaviour.
- Manual listening test: verify break sections are noticeably quieter, peak sections are denser, bridge sections use the substitution chords.

## Out of scope

- Cross-mood drift (key/BPM wandering between mood territories).
- Blue notes or mode-specific scale constraints.
- Improv mode persisted across page reloads.
