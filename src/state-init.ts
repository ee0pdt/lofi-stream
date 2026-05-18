import { DEFAULT_SETTINGS } from "./music/settings.ts";
import type { AppState } from "./types.ts";

export function initialAppState(): AppState {
  return {
    currentMood: "rainy",
    isPlaying: false,
    complexity: DEFAULT_SETTINGS.rainy.complexity,
    isImprov: false,
  };
}
