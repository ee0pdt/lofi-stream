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
  getCurrentBeatDur,
  isSchedulerRunning,
  newProgression,
  resetImprovState,
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
import { mountPianoRoll } from "./visual/piano-roll.ts";
import { initKnobDrag, mountControls, updateKnobSvg } from "./ui/controls.ts";
import { mountSheet } from "./ui/sheet.ts";
import {
  applyMoodUI,
  mountImprovUI,
  mountMoodUI,
  setActiveMoodButton,
  setImprovButtonState,
} from "./ui/mood-ui.ts";
import { mountPlayButton, setPlayIcon, setStatusPlaying } from "./ui/play-button.ts";
import {
  maybeShowIOSBanner,
  registerServiceWorker,
  setMediaSessionPlaybackState,
  setupMediaSession,
  updateMediaSessionMood,
} from "./pwa.ts";
import { VERSION } from "./version.ts";
import type { AudioRefs, Mood } from "./types.ts";

const store = createStore(initialAppState());
let audio: AudioRefs | null = null;
let moodChangeInProgress = false;
let mediaSessionReady = false;

registerServiceWorker();
maybeShowIOSBanner();
(document.getElementById("versionTxt") as HTMLElement).textContent = VERSION;

const bgCanvas = document.getElementById("bg") as HTMLCanvasElement;
const visCanvas = document.getElementById("vis") as HTMLCanvasElement;
mountBackground(
  bgCanvas,
  () => store.get().currentMood,
  createAmplitudeReader(() => audio?.analyser ?? null),
);
mountPianoRoll(visCanvas, () => audio?.actx ?? null, () => getCurrentBeatDur());

const controls = mountControls({
  store,
  getAudio: () => audio,
  isMoodChanging: () => moodChangeInProgress,
});

mountSheet();

function changeMood(newMood: Mood): void {
  setActiveMoodButton(newMood);
  if (store.get().isImprov) {
    store.set({ isImprov: false });
    setImprovButtonState(false);
    resetImprovState();
  }
  applyMoodUI(newMood);
  updateMediaSessionMood(newMood);

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
    for (const key of ["drums", "bass", "comp", "melody1", "melody2"] as const) {
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

mountImprovUI(() => {
  const next = !store.get().isImprov;
  store.set({ isImprov: next });
  setImprovButtonState(next);
  if (!next) resetImprovState();
});

async function toggle(): Promise<void> {
  if (!audio) {
    audio = initAudio(store);
    buildRainLayers(audio);
    startTapeHiss(audio);
    controls.applyMoodSettings(store.get().currentMood);
  }
  // Capture in a local const so TypeScript retains the non-null type across await.
  const refs: AudioRefs = audio;
  if (refs.actx.state === "suspended") await refs.actx.resume();

  if (!mediaSessionReady) {
    mediaSessionReady = true;
    setupMediaSession(refs, store, {
      onPlay: () => {
        if (!store.get().isPlaying) void toggle();
      },
      onPause: () => {
        if (store.get().isPlaying) void toggle();
      },
      onNext: () => {
        if (audio) newProgression(audio, store.get().currentMood, true);
      },
    });
  }

  const volSlider = document.getElementById("volSlider") as HTMLInputElement | null;
  const userVol = sliderToGain(parseFloat(volSlider?.value ?? "0.65"));

  if (store.get().isPlaying) {
    const now = refs.actx.currentTime;
    refs.masterGain.gain.cancelScheduledValues(now);
    refs.masterGain.gain.setValueAtTime(refs.masterGain.gain.value, now);
    refs.masterGain.gain.linearRampToValueAtTime(0.0001, now + 0.5);
    setTimeout(() => {
      stopScheduler();
      stopAmbience();
    }, 520);
    store.set({ isPlaying: false });
    setPlayIcon(false);
    setStatusPlaying(false);
    setMediaSessionPlaybackState(false);
  } else {
    const now = refs.actx.currentTime;
    refs.masterGain.gain.cancelScheduledValues(now);
    refs.masterGain.gain.setValueAtTime(0.0001, now);
    store.set({ isPlaying: true });
    startScheduler(refs, store);
    startAmbience(refs, store.get().currentMood, store);
    startScratches(refs, store);
    refs.masterGain.gain.linearRampToValueAtTime(userVol, now + 1.2);
    setPlayIcon(true);
    setStatusPlaying(true);
    setMediaSessionPlaybackState(true);
  }
}

mountPlayButton(toggle);

const skipBtn = document.getElementById("skipBtn");
if (skipBtn) {
  skipBtn.addEventListener("click", () => {
    if (store.get().isPlaying && audio) newProgression(audio, store.get().currentMood, true);
  });
}

const bpmSlider = document.getElementById("bpmSlider");
if (bpmSlider instanceof HTMLInputElement) {
  initKnobDrag(bpmSlider);
  updateKnobSvg(bpmSlider);
  bpmSlider.addEventListener("input", () => {
    updateKnobSvg(bpmSlider);
    setCurrentBPM(parseInt(bpmSlider.value));
  });
}

const keyChip = document.getElementById("keyChip");
if (keyChip) keyChip.addEventListener("click", () => cycleCurrentKey());

// Tab restore: resume the AudioContext (Safari suspends it when hidden)
// and flush the scheduler so the 3-second buffer refills immediately.
// iOS AudioContext can enter "interrupted" state (phone call, system audio event,
// backgrounding). When it recovers to "running" the scheduler lookahead is stale,
// so flush immediately to avoid silence until the next scheduler cycle.
let prevActxState = "none";
setInterval(() => {
  if (!audio) return;
  const cur = audio.actx.state;
  if (
    prevActxState !== "running" && cur === "running" && store.get().isPlaying &&
    isSchedulerRunning()
  ) {
    flushScheduler(audio, store);
  }
  prevActxState = cur;
}, 200);

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
