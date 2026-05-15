/**
 * Per-mood ambience: looped noise beds, plus the sparse triggered events
 * (siren for `late`, ceramic clinks for `cafe`). Rain layers for the
 * rainy mood are also built here — they route through `audio.rainGain`
 * so the rain slider is a true master.
 *
 * Sources for the running bed are tracked in `currentSources` so
 * `stopAmbience` can disconnect them on mood change. Tape hiss is NOT
 * tracked here — it lives in this module and persists across moods.
 */

import { noiseBuffer } from "./graph.ts";
import { pickFrom, randRange } from "./rand.ts";
import type { AppState, AudioRefs, Mood } from "../types.ts";
import type { Store } from "../store.ts";

let currentSources: (AudioBufferSourceNode | OscillatorNode)[] = [];

function makeLoopedNoise(
  audio: AudioRefs,
  freq: number,
  type: BiquadFilterType,
  Q: number,
  gainVal: number,
  panVal: number,
  dest: AudioNode,
): AudioBufferSourceNode {
  const src = audio.actx.createBufferSource();
  src.buffer = noiseBuffer(audio.actx, 4, true);
  src.loop = true;
  const filt = audio.actx.createBiquadFilter();
  filt.type = type;
  filt.frequency.value = freq;
  filt.Q.value = Q;
  const g = audio.actx.createGain();
  g.gain.value = gainVal;
  const p = audio.actx.createStereoPanner();
  p.pan.value = panVal;
  src.connect(filt);
  filt.connect(g);
  g.connect(p);
  p.connect(dest);
  src.start();
  return src;
}

function loopedNoise(
  audio: AudioRefs,
  freq: number,
  type: BiquadFilterType,
  Q: number,
  gainVal: number,
  panVal: number,
  dest: AudioNode,
): void {
  currentSources.push(
    makeLoopedNoise(audio, freq, type, Q, gainVal, panVal, dest),
  );
}

function buildAmbienceForMood(audio: AudioRefs, mood: Mood): void {
  const dest = audio.ambienceGain;
  if (mood === "rainy") {
    loopedNoise(audio, 300, "lowpass", 1.0, 0.35, -0.3, audio.rainGain);
    loopedNoise(audio, 1600, "bandpass", 0.5, 0.18, 0.0, audio.rainGain);
    loopedNoise(audio, 6000, "highpass", 0.8, 0.06, 0.3, audio.rainGain);
  } else if (mood === "late") {
    loopedNoise(audio, 80, "lowpass", 1.5, 0.22, 0.0, dest);
    loopedNoise(audio, 400, "bandpass", 0.3, 0.06, -0.2, dest);
    loopedNoise(audio, 8000, "highpass", 1.0, 0.03, 0.4, dest);
  } else if (mood === "cafe") {
    loopedNoise(audio, 500, "bandpass", 0.4, 0.12, 0.0, dest);
    loopedNoise(audio, 2000, "bandpass", 0.6, 0.07, 0.2, dest);
    loopedNoise(audio, 200, "lowpass", 0.8, 0.18, -0.2, dest);
  } else if (mood === "sleepy") {
    loopedNoise(audio, 120, "lowpass", 1.2, 0.28, 0.0, dest);
    loopedNoise(audio, 3000, "highpass", 0.5, 0.02, 0.0, dest);
  } else if (mood === "transit") {
    // Sub rumble — constant low-end presence
    loopedNoise(audio, 90, "lowpass", 1.5, 0.20, 0.0, dest);

    // Mid movement layer with slow LFO filter sweep
    const moveSrc = audio.actx.createBufferSource();
    moveSrc.buffer = noiseBuffer(audio.actx, 4, true);
    moveSrc.loop = true;
    const moveFilt = audio.actx.createBiquadFilter();
    moveFilt.type = "bandpass";
    moveFilt.frequency.value = 600;
    moveFilt.Q.value = 1.8;
    const moveGain = audio.actx.createGain();
    moveGain.gain.value = 0.07;
    const movePan = audio.actx.createStereoPanner();
    movePan.pan.value = 0.1;
    // LFO: 0.03 Hz sine, ±200 Hz sweep around 600 Hz.
    // Intermediate nodes (moveFilt, moveGain, movePan, lfoGain) are released
    // by the browser once moveSrc and lfo are stopped via stopAmbience().
    const lfo = audio.actx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.03;
    const lfoGain = audio.actx.createGain();
    lfoGain.gain.value = 200;
    lfo.connect(lfoGain);
    lfoGain.connect(moveFilt.frequency);
    lfo.start();
    moveSrc.connect(moveFilt);
    moveFilt.connect(moveGain);
    moveGain.connect(movePan);
    movePan.connect(dest);
    moveSrc.start();
    currentSources.push(moveSrc);
    currentSources.push(lfo);
  }
}

/**
 * Late-mood-only: schedule the next distant siren sweep, then recurse
 * on a randomised delay. No-ops if the current mood is no longer `late`
 * or playback stopped.
 */
function scheduleSiren(audio: AudioRefs, store: Store<AppState>): void {
  if (store.get().currentMood !== "late" || !store.get().isPlaying) return;
  const delay = randRange(18000, 45000);
  setTimeout(() => {
    if (store.get().currentMood !== "late" || !store.get().isPlaying) return;
    const now = audio.actx.currentTime;
    const baseFreq = pickFrom([440, 550, 660]);
    const dur = randRange(1.5, 3.0);
    const o = audio.actx.createOscillator();
    const g = audio.actx.createGain();
    const p = audio.actx.createStereoPanner();
    p.pan.value = randRange(-0.6, 0.6);
    o.type = "sine";
    o.frequency.setValueAtTime(baseFreq, now);
    o.frequency.linearRampToValueAtTime(baseFreq * 1.15, now + dur * 0.3);
    o.frequency.linearRampToValueAtTime(baseFreq, now + dur * 0.6);
    o.frequency.linearRampToValueAtTime(baseFreq * 1.15, now + dur);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.03, now + 0.3);
    g.gain.setValueAtTime(0.03, now + dur - 0.3);
    g.gain.linearRampToValueAtTime(0, now + dur);
    o.connect(g);
    g.connect(p);
    p.connect(audio.ambienceGain);
    o.start(now);
    o.stop(now + dur);
    scheduleSiren(audio, store);
  }, delay);
}

/**
 * Cafe-mood-only: ceramic clink (short triple sine burst). Recurses
 * like `scheduleSiren`.
 */
function scheduleClink(audio: AudioRefs, store: Store<AppState>): void {
  if (store.get().currentMood !== "cafe" || !store.get().isPlaying) return;
  const delay = randRange(8000, 22000);
  setTimeout(() => {
    if (store.get().currentMood !== "cafe" || !store.get().isPlaying) return;
    const now = audio.actx.currentTime;
    [1, 1.52, 2.1].forEach((ratio, idx) => {
      const freq = randRange(2400, 3600) * ratio;
      const o = audio.actx.createOscillator();
      const g = audio.actx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      const t = now + idx * 0.002;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.04, t + 0.001);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g);
      g.connect(audio.ambienceGain);
      o.start(t);
      o.stop(t + 0.2);
    });
    scheduleClink(audio, store);
  }, delay);
}

function scheduleTransitSweep(audio: AudioRefs, store: Store<AppState>): void {
  if (store.get().currentMood !== "transit" || !store.get().isPlaying) return;
  const delay = randRange(25000, 55000);
  setTimeout(() => {
    if (store.get().currentMood !== "transit" || !store.get().isPlaying) return;
    const now = audio.actx.currentTime;
    const dur = randRange(5, 9);
    const o = audio.actx.createOscillator();
    const filt = audio.actx.createBiquadFilter();
    const g = audio.actx.createGain();
    const p = audio.actx.createStereoPanner();
    o.type = "sawtooth";
    o.frequency.value = randRange(60, 120);
    filt.type = "lowpass";
    filt.frequency.value = 300;
    filt.Q.value = 2.0;
    p.pan.value = randRange(-0.5, 0.5);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.08, now + 1);
    g.gain.setValueAtTime(0.08, now + dur - 1.5);
    g.gain.linearRampToValueAtTime(0, now + dur);
    o.connect(filt);
    filt.connect(g);
    g.connect(p);
    p.connect(audio.ambienceGain);
    o.start(now);
    o.stop(now + dur);
    scheduleTransitSweep(audio, store);
  }, delay);
}

function scheduleTransitStab(audio: AudioRefs, store: Store<AppState>): void {
  if (store.get().currentMood !== "transit" || !store.get().isPlaying) return;
  const delay = randRange(15000, 35000);
  setTimeout(() => {
    if (store.get().currentMood !== "transit" || !store.get().isPlaying) return;
    const now = audio.actx.currentTime;
    // Root from key_pool: offsets [0, 2, 3, 5, 8] relative to A2 (110 Hz)
    const rootFreq = 110 * Math.pow(2, pickFrom([0, 2, 3, 5, 8]) / 12);
    const detunes = [0, 8, -8];
    detunes.forEach((detuneCents) => {
      const o = audio.actx.createOscillator();
      const g = audio.actx.createGain();
      o.type = "sine";
      o.frequency.value = rootFreq * Math.pow(2, detuneCents / 1200);
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.05, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
      o.connect(g);
      g.connect(audio.ambienceGain);
      o.start(now);
      o.stop(now + 0.45);
    });
    scheduleTransitStab(audio, store);
  }, delay);
}

function scheduleTransitSwell(audio: AudioRefs, store: Store<AppState>): void {
  if (store.get().currentMood !== "transit" || !store.get().isPlaying) return;
  const delay = randRange(40000, 80000);
  setTimeout(() => {
    if (store.get().currentMood !== "transit" || !store.get().isPlaying) return;
    const now = audio.actx.currentTime;
    const fadeIn = 4;
    const hold = 3;
    const fadeOut = 4;
    const totalDur = fadeIn + hold + fadeOut;
    [0, 6].forEach((detuneCents) => {
      const o = audio.actx.createOscillator();
      const filt = audio.actx.createBiquadFilter();
      const g = audio.actx.createGain();
      o.type = "sawtooth";
      o.frequency.value = 110 * Math.pow(2, detuneCents / 1200);
      filt.type = "lowpass";
      filt.frequency.value = 400;
      filt.Q.value = 1.0;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.06, now + fadeIn);
      g.gain.setValueAtTime(0.06, now + fadeIn + hold);
      g.gain.linearRampToValueAtTime(0, now + totalDur);
      o.connect(filt);
      filt.connect(g);
      g.connect(audio.ambienceGain);
      o.start(now);
      o.stop(now + totalDur);
    });
    scheduleTransitSwell(audio, store);
  }, delay);
}

function scheduleTransitPing(audio: AudioRefs, store: Store<AppState>): void {
  if (store.get().currentMood !== "transit" || !store.get().isPlaying) return;
  const delay = randRange(20000, 45000);
  setTimeout(() => {
    if (store.get().currentMood !== "transit" || !store.get().isPlaying) return;
    const now = audio.actx.currentTime;
    const freq = randRange(2000, 4000);
    const o = audio.actx.createOscillator();
    const g = audio.actx.createGain();
    const p = audio.actx.createStereoPanner();
    o.type = "sine";
    o.frequency.value = freq;
    p.pan.value = randRange(-0.3, 0.3);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.04, now + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 2);
    o.connect(g);
    g.connect(p);
    p.connect(audio.ambienceGain);
    o.start(now);
    o.stop(now + 2.1);
    scheduleTransitPing(audio, store);
  }, delay);
}

/**
 * Build the three rain noise layers that route through `audio.rainGain`.
 * Always built — rainy mood pumps them via ambience; other moods leave
 * them at zero via the rain slider's default.
 */
export function buildRainLayers(audio: AudioRefs): void {
  const layers = [
    { type: "lowpass", freq: 320, Q: 1.2, gain: 0.28, pan: -0.3 },
    { type: "bandpass", freq: 1800, Q: 0.5, gain: 0.14, pan: 0.0 },
    { type: "highpass", freq: 6000, Q: 0.8, gain: 0.06, pan: 0.25 },
  ] as const;
  for (const { type, freq, Q, gain, pan } of layers) {
    const src = audio.actx.createBufferSource();
    src.buffer = noiseBuffer(audio.actx, 4, true);
    src.loop = true;
    const filt = audio.actx.createBiquadFilter();
    filt.type = type;
    filt.frequency.value = freq;
    filt.Q.value = Q;
    const g = audio.actx.createGain();
    g.gain.value = gain;
    const p = audio.actx.createStereoPanner();
    p.pan.value = pan;
    src.connect(filt);
    filt.connect(g);
    g.connect(p);
    p.connect(audio.rainGain);
    src.start();
  }
}

export function stopAmbience(): void {
  for (const s of currentSources) {
    try {
      s.stop();
    } catch (_) {
      // already stopped
    }
  }
  currentSources = [];
}

/**
 * Fade ambience down, swap layers for `mood`, fade back up. Also
 * launches the mood's triggered events (siren / clink) if applicable.
 * The 600ms intermediate delay matches the inline timing exactly.
 */
export function startAmbience(
  audio: AudioRefs,
  mood: Mood,
  store: Store<AppState>,
): void {
  stopAmbience();
  audio.ambienceGain.gain.setTargetAtTime(0.0001, audio.actx.currentTime, 0.5);
  setTimeout(() => {
    buildAmbienceForMood(audio, mood);
    if (mood === "late") scheduleSiren(audio, store);
    if (mood === "cafe") scheduleClink(audio, store);
    if (mood === "transit") {
      scheduleTransitSweep(audio, store);
      scheduleTransitStab(audio, store);
      scheduleTransitSwell(audio, store);
      scheduleTransitPing(audio, store);
    }
    audio.ambienceGain.gain.setTargetAtTime(1, audio.actx.currentTime, 1.0);
  }, 600);
}

/**
 * Decorrelated tape hiss bed: two EQ bands, each panned hard L/R so the
 * hiss stays stereo rather than collapsing mono. Sources are not tracked
 * for teardown — hiss persists across mood changes.
 */
export function startTapeHiss(audio: AudioRefs): void {
  for (
    const { freq, Q, gain } of [
      { freq: 5500, Q: 0.6, gain: 0.09 },
      { freq: 1800, Q: 0.4, gain: 0.035 },
    ]
  ) {
    for (const panValue of [-0.9, 0.9]) {
      const src = audio.actx.createBufferSource();
      src.buffer = noiseBuffer(audio.actx, 4, true);
      src.loop = true;
      const filt = audio.actx.createBiquadFilter();
      filt.type = "bandpass";
      filt.frequency.value = freq;
      filt.Q.value = Q;
      const g = audio.actx.createGain();
      g.gain.value = gain;
      const p = audio.actx.createStereoPanner();
      p.pan.value = panValue;
      src.connect(filt);
      filt.connect(g);
      g.connect(p);
      p.connect(audio.trackGains.hiss);
      src.start();
    }
  }
}

/**
 * Play one vinyl-scratch burst (2-4 randomised grains) and schedule the
 * next via setTimeout. No-ops if playback has stopped — the next event
 * just won't recurse.
 */
export function playVinylScratch(
  audio: AudioRefs,
  store: Store<AppState>,
): void {
  if (!store.get().isPlaying) return;
  const now = audio.actx.currentTime;
  const numGrains = Math.floor(randRange(2, 5));
  for (let i = 0; i < numGrains; i++) {
    const offset = i * randRange(0.04, 0.09);
    const grainDur = randRange(0.04, 0.1);
    const src = audio.actx.createBufferSource();
    src.buffer = noiseBuffer(audio.actx, 0.15);
    src.playbackRate.setValueAtTime(randRange(0.6, 1.8), now + offset);
    src.playbackRate.linearRampToValueAtTime(
      randRange(0.4, 2.2),
      now + offset + grainDur,
    );
    const filt = audio.actx.createBiquadFilter();
    filt.type = "bandpass";
    filt.frequency.setValueAtTime(randRange(800, 3000), now + offset);
    filt.frequency.exponentialRampToValueAtTime(
      randRange(400, 6000),
      now + offset + grainDur,
    );
    filt.Q.value = randRange(1.5, 4);
    const gainNode = audio.actx.createGain();
    gainNode.gain.setValueAtTime(0, now + offset);
    gainNode.gain.linearRampToValueAtTime(
      randRange(0.06, 0.14),
      now + offset + 0.005,
    );
    gainNode.gain.exponentialRampToValueAtTime(
      0.0001,
      now + offset + grainDur,
    );
    const p = audio.actx.createStereoPanner();
    p.pan.value = randRange(-0.4, 0.4);
    src.connect(filt);
    filt.connect(gainNode);
    gainNode.connect(p);
    p.connect(audio.trackGains.scratches);
    src.start(now + offset);
    src.stop(now + offset + grainDur + 0.02);
  }
  setTimeout(
    () => playVinylScratch(audio, store),
    randRange(8000, 24000),
  );
}

export function startScratches(
  audio: AudioRefs,
  store: Store<AppState>,
): void {
  setTimeout(
    () => playVinylScratch(audio, store),
    randRange(4000, 10000),
  );
}
