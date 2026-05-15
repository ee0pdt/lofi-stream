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
import {
  buildRainLayers,
  startAmbience,
  startScratches,
  startTapeHiss,
  stopAmbience,
} from "./audio/ambience.ts";
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

  const refs = audio;
  const fadeOut = 0.7;
  const fadeIn = 1.2;
  const now = refs.actx.currentTime;
  refs.masterGain.gain.cancelScheduledValues(now);
  refs.masterGain.gain.setValueAtTime(refs.masterGain.gain.value, now);
  refs.masterGain.gain.linearRampToValueAtTime(0.0001, now + fadeOut);

  setTimeout(() => {
    // Sever the in-flight lookahead: oscillators already scheduled for the
    // old mood are wired to these trackGains. Disconnecting them from
    // master orphans their downstream nodes (they keep ticking into the
    // void until their own stop() fires, then GC). Fresh GainNodes take
    // their place in `audio.trackGains` so the next scheduled bar wires up
    // to them. Hiss / scratches / ambience / hum / rain are left alone —
    // they cross-fade with master.
    for (const key of ["drums", "bass", "comp", "melody"] as const) {
      refs.trackGains[key].disconnect();
      const gainNode = refs.actx.createGain();
      gainNode.gain.value = 1;
      gainNode.connect(refs.masterGain);
      refs.trackGains[key] = gainNode;
    }
    resetSchedulerTime(refs);

    store.set({ currentMood: newMood });
    controls.applyMoodSettings(newMood);
    newProgression(refs, newMood, true);
    startAmbience(refs, newMood, store);

    const volSlider = document.getElementById("volSlider") as
      | HTMLInputElement
      | null;
    const userVol = sliderToGain(
      parseFloat(volSlider?.value ?? "0.65"),
    );
    const fadeInStart = refs.actx.currentTime;
    refs.masterGain.gain.cancelScheduledValues(fadeInStart);
    refs.masterGain.gain.setValueAtTime(0.0001, fadeInStart);
    refs.masterGain.gain.linearRampToValueAtTime(userVol, fadeInStart + fadeIn);
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
    const now = audio.actx.currentTime;
    audio.masterGain.gain.cancelScheduledValues(now);
    audio.masterGain.gain.setValueAtTime(audio.masterGain.gain.value, now);
    audio.masterGain.gain.linearRampToValueAtTime(0.0001, now + 0.5);
    setTimeout(() => {
      stopScheduler();
      stopAmbience();
    }, 520);
    store.set({ isPlaying: false });
    setPlayIcon(false);
    setStatusPlaying(false);
  } else {
    const now = audio.actx.currentTime;
    audio.masterGain.gain.cancelScheduledValues(now);
    audio.masterGain.gain.setValueAtTime(0.0001, now);
    store.set({ isPlaying: true });
    startScheduler(audio, store);
    startAmbience(audio, store.get().currentMood, store);
    startScratches(audio, store);
    audio.masterGain.gain.linearRampToValueAtTime(userVol, now + 1.2);
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

// Debug surface used by e2e tests. Present in all builds; read-only and safe to ship.
(window as Window & { __lofi?: { actxState: () => string } }).__lofi = {
  actxState: () => audio?.actx.state ?? "not-created",
};
