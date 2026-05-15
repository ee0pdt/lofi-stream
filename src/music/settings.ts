import type { Mood, Settings } from "../types.ts";

/**
 * Per-mood mixer/parameter defaults. Each `Settings` is deep-cloned into the
 * runtime `moodSettings` map at startup so user adjustments stay isolated
 * per mood.
 *
 * Values must match the inline `DEFAULT_SETTINGS` in `index.html` until the
 * inline script is removed in a later phase.
 */
export const DEFAULT_SETTINGS: Record<Mood, Settings> = {
  rainy: {
    drums: 0.85,
    bass: 0.85,
    comp: 0.8,
    melody: 0.7,
    hiss: 0.5,
    scratches: 0.65,
    hum: 0.35,
    warp: 0.3,
    ambience: 0.7,
    rain: 0.6,
    reverb: 0.3,
    complexity: 0.45,
    vol: 0.65,
  },
  late: {
    drums: 0.8,
    bass: 0.9,
    comp: 0.85,
    melody: 0.7,
    hiss: 0.2,
    scratches: 0.7,
    hum: 0.5,
    warp: 0.5,
    ambience: 0.65,
    rain: 0.05,
    reverb: 0.3,
    complexity: 0.55,
    vol: 0.65,
  },
  cafe: {
    drums: 0.9,
    bass: 0.85,
    comp: 0.85,
    melody: 0.8,
    hiss: 0.45,
    scratches: 0.6,
    hum: 0.3,
    warp: 0.25,
    ambience: 0.45,
    rain: 0,
    reverb: 0.3,
    complexity: 0.65,
    vol: 0.65,
  },
  sleepy: {
    drums: 0.65,
    bass: 0.7,
    comp: 0.85,
    melody: 0.8,
    hiss: 0.2,
    scratches: 0.55,
    hum: 0.4,
    warp: 0.55,
    ambience: 0.35,
    rain: 0,
    reverb: 0.3,
    complexity: 0.2,
    vol: 0.6,
  },
  transit: {
    drums: 0.75,
    bass: 0.8,
    comp: 0.85,
    melody: 0.75,
    hiss: 0.25,
    scratches: 0.6,
    hum: 0.45,
    warp: 0.6,
    ambience: 0.75,
    rain: 0,
    reverb: 0.4,
    complexity: 0.35,
    vol: 0.65,
  },
};
