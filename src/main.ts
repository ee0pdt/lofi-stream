/**
 * Entry point. Runs on module load: builds the reactive store, mounts
 * all subsystems (background, visualiser, UI controls, sheet, mood
 * buttons, play button), and orchestrates audio boot + scheduler
 * lifecycle. After this commit, `index.html` has no inline JS — just
 * one `<script type="module" src="./dist/main.js">` tag.
 */

import { createStore } from "./store.ts";
import { initialAppState } from "./state-init.ts";
import { initAudio, sliderToGain } from "./audio/graph.ts";
import {
  cycleCurrentKey,
  flushScheduler,
  newProgression,
  resetSchedulerTime,
  setCurrentBPM,
  startScheduler,
  stopScheduler,
} from "./audio/scheduler.ts";
import { buildRainLayers, startAmbience, stopAmbience } from "./audio/ambience.ts";
import { startScratches, startTapeHiss } from "./audio/instruments.ts";
import { createAmplitudeReader, mountBackground } from "./visual/background.ts";
import { mountAnalyserVisualiser, readAccentRgb } from "./visual/analyser.ts";
import { mountControls } from "./ui/controls.ts";
import { mountSheet } from "./ui/sheet.ts";
import { applyMoodUI, mountMoodUI, setActiveMoodButton } from "./ui/mood-ui.ts";
import { mountPlayButton, setPlayIcon, setStatusPlaying } from "./ui/play-button.ts";
import type { AudioRefs, Mood } from "./types.ts";

const store = createStore(initialAppState());
let audio: AudioRefs | null = null;
let moodChangeInProgress = false;

const bgCanvas = document.getElementById("bg") as HTMLCanvasElement;
const visCanvas = document.getElementById("vis") as HTMLCanvasElement;
mountBackground(
  bgCanvas,
  () => store.get().currentMood,
  createAmplitudeReader(() => audio?.analyser ?? null),
);
mountAnalyserVisualiser(
  visCanvas,
  () => audio?.analyser ?? null,
  () => readAccentRgb(),
);

const controls = mountControls({
  store,
  getAudio: () => audio,
  isMoodChanging: () => moodChangeInProgress,
});

mountSheet();

function changeMood(newMood: Mood): void {
  setActiveMoodButton(newMood);
  applyMoodUI(newMood);

  if (!store.get().isPlaying) {
    store.set({ currentMood: newMood });
    controls.applyMoodSettings(newMood);
    return;
  }

  if (moodChangeInProgress || !audio) return;
  moodChangeInProgress = true;

  const a = audio;
  const fadeOut = 0.7;
  const fadeIn = 1.2;
  const now = a.actx.currentTime;
  a.masterGain.gain.cancelScheduledValues(now);
  a.masterGain.gain.setValueAtTime(a.masterGain.gain.value, now);
  a.masterGain.gain.linearRampToValueAtTime(0.0001, now + fadeOut);

  setTimeout(() => {
    // Sever the in-flight lookahead: oscillators already scheduled for the
    // old mood are wired to these trackGains. Disconnecting them from
    // master orphans their downstream nodes (they keep ticking into the
    // void until their own stop() fires, then GC). Fresh GainNodes take
    // their place in `audio.trackGains` so the next scheduled bar wires up
    // to them. Hiss / scratches / ambience / hum / rain are left alone —
    // they cross-fade with master.
    for (const key of ["drums", "bass", "comp", "melody"] as const) {
      a.trackGains[key].disconnect();
      const g = a.actx.createGain();
      g.gain.value = 1;
      g.connect(a.masterGain);
      a.trackGains[key] = g;
    }
    resetSchedulerTime(a);

    store.set({ currentMood: newMood });
    controls.applyMoodSettings(newMood);
    newProgression(a, newMood, true);
    startAmbience(a, newMood, store);

    const volSlider = document.getElementById("volSlider") as
      | HTMLInputElement
      | null;
    const userVol = sliderToGain(
      parseFloat(volSlider?.value ?? "0.65"),
    );
    const t = a.actx.currentTime;
    a.masterGain.gain.cancelScheduledValues(t);
    a.masterGain.gain.setValueAtTime(0.0001, t);
    a.masterGain.gain.linearRampToValueAtTime(userVol, t + fadeIn);
    moodChangeInProgress = false;
  }, fadeOut * 1000 + 30);
}

mountMoodUI(changeMood);

mountPlayButton(async () => {
  if (!audio) {
    audio = initAudio(store);
    buildRainLayers(audio);
    startTapeHiss(audio);
    controls.applyMoodSettings(store.get().currentMood);
  }
  if (audio.actx.state === "suspended") await audio.actx.resume();

  const volSlider = document.getElementById("volSlider") as
    | HTMLInputElement
    | null;
  const userVol = sliderToGain(parseFloat(volSlider?.value ?? "0.65"));

  if (store.get().isPlaying) {
    const t = audio.actx.currentTime;
    audio.masterGain.gain.cancelScheduledValues(t);
    audio.masterGain.gain.setValueAtTime(audio.masterGain.gain.value, t);
    audio.masterGain.gain.linearRampToValueAtTime(0.0001, t + 0.5);
    setTimeout(() => {
      stopScheduler();
      stopAmbience();
    }, 520);
    store.set({ isPlaying: false });
    setPlayIcon(false);
    setStatusPlaying(false);
  } else {
    const t0 = audio.actx.currentTime;
    audio.masterGain.gain.cancelScheduledValues(t0);
    audio.masterGain.gain.setValueAtTime(0.0001, t0);
    store.set({ isPlaying: true });
    startScheduler(audio, store);
    startAmbience(audio, store.get().currentMood, store);
    startScratches(audio, store);
    audio.masterGain.gain.linearRampToValueAtTime(userVol, t0 + 1.2);
    setPlayIcon(true);
    setStatusPlaying(true);
  }
});

const skipBtn = document.getElementById("skipBtn");
if (skipBtn) {
  skipBtn.addEventListener("click", () => {
    if (store.get().isPlaying && audio) newProgression(audio, store.get().currentMood, true);
  });
}

const bpmSlider = document.getElementById("bpmSlider");
if (bpmSlider instanceof HTMLInputElement) {
  bpmSlider.addEventListener("input", () => setCurrentBPM(parseInt(bpmSlider.value)));
}

const keyChip = document.getElementById("keyChip");
if (keyChip) keyChip.addEventListener("click", () => cycleCurrentKey());

// Tab restore: resume the AudioContext (Safari suspends it when hidden)
// and flush the scheduler so the 3-second buffer refills immediately.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !store.get().isPlaying || !audio) return;
  if (audio.actx.state === "suspended") {
    audio.actx.resume().then(() => {
      if (audio) flushScheduler(audio, store);
    });
  } else {
    flushScheduler(audio, store);
  }
});

// Initial UI paint.
const initialMood = store.get().currentMood;
applyMoodUI(initialMood);
setActiveMoodButton(initialMood);
controls.applyMoodSettings(initialMood);
