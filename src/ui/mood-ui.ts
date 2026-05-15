/**
 * Mood UI: per-mood accent palette + button activation. The mood-change
 * cross-fade is owned by `main.ts` (it needs the audio + scheduler
 * controls); this module just wires the buttons and exposes a setter
 * for the palette.
 */

import type { Mood } from "../types.ts";

interface MoodPalette {
  readonly warm: string;
  readonly warm2: string;
}

const MOOD_UI: Record<Mood, MoodPalette> = {
  rainy: { warm: "#7aa6d8", warm2: "#a8c4e8" },
  late: { warm: "#a886d8", warm2: "#c4a8e8" },
  cafe: { warm: "#c97d40", warm2: "#e8b07a" },
  sleepy: { warm: "#6db5a8", warm2: "#9dd1c5" },
  transit: { warm: "#7b2fff", warm2: "#a06fff" },
};

export function applyMoodUI(mood: Mood): void {
  const palette = MOOD_UI[mood] ?? MOOD_UI.cafe;
  document.documentElement.style.setProperty("--warm", palette.warm);
  document.documentElement.style.setProperty("--warm2", palette.warm2);
}

/**
 * Wire each `.mood-btn` to call `onMoodSelect(mood)`. The button's
 * `data-mood` attribute is read as the mood identifier; the handler
 * does the audio crossfade (or just the UI swap if not playing).
 */
export function mountMoodUI(
  onMoodSelect: (mood: Mood) => void,
): void {
  document.querySelectorAll(".mood-btn").forEach((btn) => {
    const el = btn as HTMLElement;
    el.addEventListener("click", () => {
      const mood = el.dataset.mood as Mood | undefined;
      if (mood) onMoodSelect(mood);
    });
  });
}

/** Toggle the "active" class on the mood button matching `mood`. */
export function setActiveMoodButton(mood: Mood): void {
  document.querySelectorAll(".mood-btn").forEach((b) => {
    const el = b as HTMLElement;
    el.classList.toggle("active", el.dataset.mood === mood);
  });
}
