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

const KN_CX = 26;
const KN_CY = 26;
const KN_R = 18;
const KN_DOT_R = 15;
const KN_START = 135; // degrees
const KN_SWEEP = 270; // degrees

function knPolar(angleDeg: number): [number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  return [KN_CX + KN_R * Math.cos(rad), KN_CY + KN_R * Math.sin(rad)];
}

function knDotPolar(angleDeg: number): [number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  return [KN_CX + KN_DOT_R * Math.cos(rad), KN_CY + KN_DOT_R * Math.sin(rad)];
}

function knArcPath(startDeg: number, endDeg: number): string {
  const [sx, sy] = knPolar(startDeg);
  const [ex, ey] = knPolar(endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${KN_R} ${KN_R} 0 ${large} 1 ${ex.toFixed(2)} ${
    ey.toFixed(2)
  }`;
}

/**
 * Repaints the SVG fill arc and indicator dot for `input` based on its
 * current value. Also updates aria-valuetext for screen readers.
 * Safe to call on a non-knob input (no-ops if SVG siblings not found).
 */
export function updateKnobSvg(input: HTMLInputElement): void {
  const wrap = input.closest(".kn-wrap");
  if (!wrap) return;
  const min = parseFloat(input.min) || 0;
  const max = parseFloat(input.max) || 1;
  const val = parseFloat(input.value);
  const norm = Math.max(0, Math.min(1, (val - min) / (max - min)));

  const endAngle = KN_START + norm * KN_SWEEP;
  const fill = wrap.querySelector(".kn-fill");
  if (fill) fill.setAttribute("d", norm > 0 ? knArcPath(KN_START, endAngle) : "");

  const [dx, dy] = knDotPolar(endAngle);
  const dot = wrap.querySelector(".kn-dot");
  if (dot) {
    dot.setAttribute("cx", dx.toFixed(2));
    dot.setAttribute("cy", dy.toFixed(2));
  }

  const pct = Math.round(norm * 100);
  if (min === 0 && max === 1) {
    input.setAttribute("aria-valuetext", `${pct}%`);
  } else {
    input.setAttribute("aria-valuetext", `${Math.round(val)} BPM`);
  }
}

const DRAG_PX = 200; // px of upward drag = full range sweep

/**
 * Wires vertical pointer-drag on `input`'s parent `.kn-wrap` so that
 * dragging up increases the value and dragging down decreases it.
 * Dispatches a synthetic `input` event after each update so existing
 * audio-graph listeners fire unchanged.
 */
export function initKnobDrag(input: HTMLInputElement): void {
  let startY = 0;
  let startVal = 0;

  input.addEventListener("pointerdown", (e: PointerEvent) => {
    e.preventDefault();
    input.setPointerCapture(e.pointerId);
    startY = e.clientY;
    startVal = parseFloat(input.value);
  });

  input.addEventListener("pointermove", (e: PointerEvent) => {
    if (!input.hasPointerCapture(e.pointerId)) return;
    const min = parseFloat(input.min) || 0;
    const max = parseFloat(input.max) || 1;
    const range = max - min;
    const delta = (startY - e.clientY) / DRAG_PX * range;
    const newVal = Math.max(min, Math.min(max, startVal + delta));
    const stepped = Math.round(newVal / parseFloat(input.step || "1")) *
      parseFloat(input.step || "1");
    input.value = String(stepped);
    updateKnobSvg(input);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  input.addEventListener("pointerup", (e: PointerEvent) => {
    input.releasePointerCapture(e.pointerId);
  });

  input.addEventListener("pointercancel", (e: PointerEvent) => {
    input.releasePointerCapture(e.pointerId);
  });
}

const TRACK_SLIDERS: Readonly<Record<keyof MoodSettings, string>> = {
  drums: 'input[data-track="drums"]',
  bass: 'input[data-track="bass"]',
  comp: 'input[data-track="comp"]',
  melody1: 'input[data-track="melody1"]',
  melody2: 'input[data-track="melody2"]',
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
    if (slider) {
      slider.value = String(val);
      updateKnobSvg(slider);
    }
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
    initKnobDrag(slider);
    slider.addEventListener("input", () => {
      const val = parseFloat(slider.value);
      const label = document.getElementById(valLabelFor(track));
      if (label) label.textContent = String(Math.round(val * 100));
      updateKnobSvg(slider);
      dispatchSetting(ctx, moodSettings, track, val);
    });
  });

  for (const key of ["rain", "reverb", "warp", "complexity", "vol"] as const) {
    const slider = document.querySelector(TRACK_SLIDERS[key]) as
      | HTMLInputElement
      | null;
    if (!slider) continue;
    if (key !== "vol") initKnobDrag(slider);
    slider.addEventListener("input", () => {
      const val = parseFloat(slider.value);
      if (key !== "vol") {
        const label = document.getElementById(valLabelFor(key));
        if (label) label.textContent = String(Math.round(val * 100));
        updateKnobSvg(slider);
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

  document.querySelectorAll(".kn-input").forEach((node) => {
    updateKnobSvg(node as HTMLInputElement);
  });

  return {
    moodSettings,
    applyMoodSettings: (mood) => applyMoodSettings(ctx, moodSettings, mood),
  };
}
