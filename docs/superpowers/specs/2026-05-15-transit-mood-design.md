# Transit Mood — Design Spec

**Date:** 2026-05-15

## Overview

Add a fifth mood, `transit`, to lofi forever. The mood evokes a synthwave train station at night — melancholic, drifting, wide. Its defining character is a layered ambience palette of triggered SFX (sweeps, stabs, swells, pings) that sit alongside the music rather than just behind it.

---

## 1. Type system

**`src/types.ts`**

```ts
export type Mood = "rainy" | "late" | "cafe" | "sleepy" | "transit";
```

No other type changes required. `AmbienceType` is not an explicit union type — `MOOD_META.ambience` is `string`, so no change needed there.

---

## 2. Music config (`src/music/moods.ts`)

New `MOOD_META` entry:

```ts
transit: {
  bpmRange: [60, 70],
  swingRange: [0.08, 0.13],
  names: ["platform 4", "last departure", "signal hold"],
  key_pool: [0, 2, 3, 5, 8],
  reverb: { dur: 4.5, decay: 0.38 },
  snareFreq: 2000,
  snareQ: 0.45,
  bassFilter: 220,
  bassAttack: 0.03,
  compTimbre: "pad",
  melTimbre: "celesta",
  ambience: "transit",
}
```

- Keys match `sleepy` (minor/Dorian territory) — melancholic feel
- Reverb is long and washy — wide platform space
- Pad comp + celesta melody — spacious and dreamy
- Slow BPM, lazy swing — drifting quality

---

## 3. Ambience (`src/audio/ambience.ts`)

### 3a. Noise bed (continuous)

Three looped noise layers in `buildAmbienceForMood` for `mood === "transit"`:

| Layer | Filter type | Freq | Q | Gain | Pan | Purpose |
|---|---|---|---|---|---|---|
| Sub rumble | lowpass | 90 Hz | 1.5 | 0.20 | 0.0 | Constant low-end train presence |
| Mid movement | bandpass | 600 Hz | 0.4 | 0.10 | 0.1 | Station air / movement texture |
| Distant hiss | highpass | 5000 Hz | 0.8 | 0.02 | 0.0 | Station air top-end |

The mid movement layer uses an LFO to slowly modulate its filter frequency. After creating the `BiquadFilterNode`, an `OscillatorNode` (type `"sine"`, frequency 0.03 Hz) is connected to `filter.frequency` via a `GainNode` with gain 200 (±200 Hz sweep around 600 Hz). The LFO oscillator is started and tracked in `currentSources` as an `AudioBufferSourceNode` is — except it's an `OscillatorNode`, so `stopAmbience` must handle both types. See implementation note below.

### 3b. Triggered event palette

Four independent recurring events, all routing through `audio.ambienceGain`, all checking `store.get().currentMood !== "transit"` guard before firing:

**`scheduleTransitSweep`** (interval: 25–55 s)
- Sawtooth oscillator, heavily lowpass-filtered (cutoff ~300 Hz, Q 2.0)
- Gain envelope: fade in over 1 s → hold → fade out, total duration 5–9 s (random)
- Pan: random ±0.5
- Gain peak: 0.08

**`scheduleTransitStab`** (interval: 15–35 s)
- 2–3 detuned sine oscillators (detune ±8 cents)
- Root frequency picked from current key pool (use same semitone offsets as `MOOD_META.key_pool`, base ~220 Hz)
- Fast attack 0.01 s, exponential decay to near-zero by 0.4 s
- Gain peak: 0.05

**`scheduleTransitSwell`** (interval: 40–80 s)
- Two detuned sawtooth oscillators (detune ±6 cents), lowpass filtered at ~400 Hz
- Fade in 4 s → hold 3 s → fade out 4 s
- Gain peak: 0.06

**`scheduleTransitPing`** (interval: 20–45 s)
- Single sine oscillator, frequency 2000–4000 Hz (random)
- Sharp attack 0.005 s, exponential decay to near-zero by 2 s
- Gain peak: 0.04
- Pan: random ±0.3

### 3c. Implementation note — LFO in `currentSources`

`currentSources` is typed `AudioBufferSourceNode[]`. The LFO is an `OscillatorNode`. Two options:
1. Widen `currentSources` to `(AudioBufferSourceNode | OscillatorNode)[]` — cleanest, since `stopAmbience` already calls `.stop()` which both share.
2. Track transit LFOs in a separate module-scope array cleared in `stopAmbience`.

Option 1 is preferred — minimal change, unified cleanup.

### 3d. `startAmbience` wiring

Add to the `startAmbience` dispatch block:

```ts
if (mood === "transit") {
  scheduleTransitSweep(audio, store);
  scheduleTransitStab(audio, store);
  scheduleTransitSwell(audio, store);
  scheduleTransitPing(audio, store);
}
```

---

## 4. Visual (`src/visual/webgpu.ts` + `src/visual/canvas2d.ts`)

Both renderers have a per-mood base colour map. Add `transit`:

- Base colour: `#1a0a2e` (deep indigo)
- Accent / blob colour: `#7b2fff` (electric purple)

This keeps the synthwave palette distinct from the cool blues of `late` and the warm tones of `cafe`/`rainy`.

---

## 5. UI (`src/ui/mood-ui.ts`)

Add `"transit"` to the mood button list after `"sleepy"`. Label: `"transit"`. No other UI changes.

---

## 6. Mixer defaults (`src/music/settings.ts`)

```ts
transit: {
  drums: 0.75,
  bass: 0.8,
  comp: 0.85,
  melody: 0.75,
  hiss: 0.25,
  scratches: 0.6,
  hum: 0.45,
  warp: 0.6,
  ambience: 0.75,   // higher than other moods — SFX palette is the point
  rain: 0,
  reverb: 0.4,      // slightly wetter than others — wide platform space
  complexity: 0.35,
  vol: 0.65,
}
```

---

## 7. Files touched

| File | Change |
|---|---|
| `src/types.ts` | Add `"transit"` to `Mood` union |
| `src/music/moods.ts` | Add `transit` to `MOOD_META` |
| `src/music/settings.ts` | Add `transit` to `DEFAULT_SETTINGS` |
| `src/audio/ambience.ts` | Widen `currentSources`, add noise bed + 4 triggered events |
| `src/visual/webgpu.ts` | Add transit colour |
| `src/visual/canvas2d.ts` | Add transit colour |
| `src/ui/mood-ui.ts` | Add transit button |

---

## 8. Out of scope

- No new audio graph nodes (everything routes through existing `ambienceGain`)
- No new sliders or mixer controls
- No changes to the scheduler, forms, or drum patterns
- No changes to `index.html` (the inline script sync is a separate migration phase concern — but `MOOD_META` and `DEFAULT_SETTINGS` are already migrated to modules, so no inline sync needed)
