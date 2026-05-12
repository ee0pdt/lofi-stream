import { DEFAULT_SETTINGS } from "./music/settings.ts";
import type { AppState, Mood, MoodSettings, Settings } from "./types.ts";

const MOODS: readonly Mood[] = ["rainy", "late", "cafe", "sleepy"];

/**
 * Deep-clone the readonly per-mood Settings into mutable MoodSettings.
 */
function cloneSettings(s: Settings): MoodSettings {
  return {
    drums: s.drums,
    bass: s.bass,
    comp: s.comp,
    melody: s.melody,
    hiss: s.hiss,
    scratches: s.scratches,
    hum: s.hum,
    warp: s.warp,
    ambience: s.ambience,
    rain: s.rain,
    reverb: s.reverb,
    complexity: s.complexity,
    vol: s.vol,
  };
}

/**
 * Build the initial AppState. Per-mood mixer values are cloned from
 * DEFAULT_SETTINGS so sliders mutating them don't pollute the source-of-truth
 * defaults.
 */
export function initialAppState(): AppState {
  const moodSettings = {} as Record<Mood, MoodSettings>;
  for (const m of MOODS) {
    moodSettings[m] = cloneSettings(DEFAULT_SETTINGS[m]);
  }
  return {
    currentMood: "rainy",
    isPlaying: false,
    complexity: moodSettings.rainy.complexity,
    moodSettings,
    currentSettings: moodSettings.rainy,
  };
}
