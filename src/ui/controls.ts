/**
 * All slider wiring + the per-mood mixer-state map. Each slider:
 * - reads its `<input type="range">` value
 * - updates the % readout label
 * - writes through to the per-mood settings map
 * - dispatches to the audio graph (via applySettingToAudio) when audio is ready
 *
 * Vol is special-cased to fade smoothly; complexity writes to the store
 * (the scheduler reads it from there); the rest are direct gain writes
 * on track/rain/reverb/warp nodes via the module applySettingToAudio.
 */

import { DEFAULT_SETTINGS } from "../music/settings.ts";
import { applySettingToAudio as applyAudio } from "../audio/graph.ts";
import type { AppState, AudioRefs, Mood, MoodSettings } from "../types.ts";
import type { Store } from "../store.ts";

const TRACK_SLIDERS: Readonly<Record<keyof MoodSettings, string>> = {
  drums: 'input[data-track="drums"]',
  bass: 'input[data-track="bass"]',
  comp: 'input[data-track="comp"]',
  melody: 'input[data-track="melody"]',
  hiss: 'input[data-track="hiss"]',
  scratches: 'input[data-track="scratches"]',
  hum: 'input[data-track="hum"]',
  ambience: 'input[data-track="ambience"]',
  warp: "#warpSlider",
  rain: "#rainSlider",
  reverb: "#reverbSlider",
  complexity: "#complexitySlider",
  vol: "#volSlider",
};

function valLabelFor(key: keyof MoodSettings): string {
  return `val-${key}`;
}

/** Build the runtime moodSettings map by deep-cloning DEFAULT_SETTINGS. */
function initialMoodSettings(): Record<Mood, MoodSettings> {
  const m = {} as Record<Mood, MoodSettings>;
  for (const mood of Object.keys(DEFAULT_SETTINGS) as Mood[]) {
    m[mood] = { ...DEFAULT_SETTINGS[mood] };
  }
  return m;
}

interface ControlsContext {
  readonly store: Store<AppState>;
  readonly getAudio: () => AudioRefs | null;
  readonly isMoodChanging: () => boolean;
}

/**
 * Write a slider key/val to the runtime per-mood map AND dispatch to
 * audio (when ready). Complexity writes through to the store.
 * Vol is suppressed during a mood-change crossfade so it doesn't
 * fight the master-gain envelope.
 */
function dispatchSetting(
  ctx: ControlsContext,
  moodSettings: Record<Mood, MoodSettings>,
  key: keyof MoodSettings,
  val: number,
): void {
  const mood = ctx.store.get().currentMood;
  moodSettings[mood][key] = val;
  if (key === "complexity") {
    ctx.store.set({ complexity: val });
    return;
  }
  if (key === "vol" && ctx.isMoodChanging()) return;
  const audio = ctx.getAudio();
  if (audio) applyAudio(audio, key, val);
}

/**
 * Apply every saved setting for `mood` to the DOM + audio. Used on mood
 * swap, on init, and (later) by a mixer-cascade subscription.
 */
export function applyMoodSettings(
  ctx: ControlsContext,
  moodSettings: Record<Mood, MoodSettings>,
  mood: Mood,
): void {
  const s = moodSettings[mood] ?? DEFAULT_SETTINGS[mood];
  for (const key of Object.keys(s) as Array<keyof MoodSettings>) {
    const val = s[key];
    const slider = document.querySelector(TRACK_SLIDERS[key]) as
      | HTMLInputElement
      | null;
    if (slider) slider.value = String(val);
    const labelEl = document.getElementById(valLabelFor(key));
    if (labelEl) labelEl.textContent = String(Math.round(val * 100));
    dispatchSetting(ctx, moodSettings, key, val);
  }
}

export interface ControlsHandle {
  readonly moodSettings: Record<Mood, MoodSettings>;
  readonly applyMoodSettings: (mood: Mood) => void;
}

/**
 * Mount every slider's input handler. Returns a handle that lets the
 * orchestrator read the runtime mood settings and re-apply on demand.
 */
export function mountControls(ctx: ControlsContext): ControlsHandle {
  const moodSettings = initialMoodSettings();

  document.querySelectorAll("input[data-track]").forEach((node) => {
    const slider = node as HTMLInputElement;
    const track = slider.dataset.track as keyof MoodSettings | undefined;
    if (!track) return;
    slider.addEventListener("input", () => {
      const val = parseFloat(slider.value);
      const label = document.getElementById(valLabelFor(track));
      if (label) label.textContent = String(Math.round(val * 100));
      dispatchSetting(ctx, moodSettings, track, val);
    });
  });

  for (const key of ["rain", "reverb", "warp", "complexity", "vol"] as const) {
    const slider = document.querySelector(TRACK_SLIDERS[key]) as
      | HTMLInputElement
      | null;
    if (!slider) continue;
    slider.addEventListener("input", () => {
      const val = parseFloat(slider.value);
      if (key !== "vol") {
        const label = document.getElementById(valLabelFor(key));
        if (label) label.textContent = String(Math.round(val * 100));
      }
      dispatchSetting(ctx, moodSettings, key, val);
    });
  }

  const mixerToggle = document.getElementById("mixerToggle");
  const mixerPanel = document.getElementById("mixerPanel");
  if (mixerToggle && mixerPanel) {
    mixerToggle.addEventListener("click", () => {
      mixerToggle.classList.toggle("open");
      mixerPanel.classList.toggle("open");
    });
  }

  return {
    moodSettings,
    applyMoodSettings: (mood) => applyMoodSettings(ctx, moodSettings, mood),
  };
}
