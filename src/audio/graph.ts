/**
 * Audio graph construction. Owns `initAudio` (the user-gesture-triggered
 * builder), the shared spatial helpers, `applySettingToAudio`, and the
 * mood/mixer cascade wirers used by `main.ts`.
 *
 * Init order is load-bearing: warp LFO bus must exist before any
 * oscillator is `applyWarp`'d, and the convolver must have a buffer
 * loaded before anything routes through the wet send. The body of
 * `initAudio` preserves the original inline order line-by-line.
 */

import { MOOD_META } from "../music/moods.ts";
import { DEFAULT_SETTINGS } from "../music/settings.ts";
import type { AppState, AudioRefs, Mood, MoodSettings, TrackKey } from "../types.ts";
import type { Store } from "../store.ts";

export interface SpatialPair {
  readonly input: AudioNode;
  readonly output: AudioNode;
}

export interface SpatialConfig {
  readonly pan: number;
  readonly dist: number;
}

export const SPATIAL: Readonly<Record<string, SpatialConfig>> = {
  kick: { pan: 0.0, dist: 0.0 },
  snare: { pan: 0.15, dist: 0.1 },
  hat: { pan: 0.75, dist: 0.3 },
  bass: { pan: -0.5, dist: 0.2 },
  rhodesComp: { pan: 0.55, dist: 0.4 },
  rhodesMel: { pan: -0.5, dist: 0.6 },
  hiss: { pan: 0.0, dist: 0.8 },
};

function clampPan(v: number): number {
  return Math.max(-1, Math.min(1, v));
}

/**
 * Slider-curve helper: maps a 0-1 linear control to a perceptual gain.
 * Quadratic — must match the curve the volume slider produces, since
 * mood-change fades and per-track gains both feed through it.
 */
export function sliderToGain(v: number): number {
  return v * v;
}

/**
 * Build a raw noise buffer. Shared by ambience, drums, and vinyl scratch.
 */
export function noiseBuffer(
  actx: AudioContext,
  secs: number,
  stereo = false,
): AudioBuffer {
  const len = actx.sampleRate * secs;
  const ch = stereo ? 2 : 1;
  const b = actx.createBuffer(ch, len, actx.sampleRate);
  for (let c = 0; c < ch; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  return b;
}

/**
 * Build a reverb impulse response: pre-delay of ~14 ms, then exponential
 * decay shaped by `decay`. Per-channel offset (c * 0.06 in the exponent)
 * keeps L/R slightly decorrelated.
 */
export function buildIR(
  audio: AudioRefs,
  dur: number,
  decay: number,
): AudioBuffer {
  const sr = audio.actx.sampleRate;
  const len = sr * dur;
  const buf = audio.actx.createBuffer(2, len, sr);
  const pre = Math.floor(sr * 0.014);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      if (i < pre) {
        d[i] = 0;
        continue;
      }
      const t = (i - pre) / (len - pre);
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay * 2.4 + c * 0.06);
    }
  }
  return buf;
}

/**
 * Swap the reverb IR for the current mood's per-mood `reverb` config.
 */
export function applyMoodReverb(audio: AudioRefs, mood: Mood): void {
  const m = MOOD_META[mood];
  audio.convolver.buffer = buildIR(audio, m.reverb.dur, m.reverb.decay);
}

/**
 * Connect the global warp/wow/flutter LFO bus to an oscillator's detune.
 * Safe to call on any OscillatorNode; the LFO bus carries a cents signal.
 */
export function applyWarp(audio: AudioRefs, osc: OscillatorNode): void {
  if (audio.warpModGain && osc.detune) audio.warpModGain.connect(osc.detune);
}

function makeDistanceChain(audio: AudioRefs, s: SpatialConfig): SpatialPair {
  const filt = audio.actx.createBiquadFilter();
  filt.type = "lowpass";
  filt.frequency.value = 18000 - s.dist * 12000;
  filt.Q.value = 0.5;
  const g = audio.actx.createGain();
  g.gain.value = 1 - s.dist * 0.55;
  filt.connect(g);
  return { input: filt, output: g };
}

/**
 * Simple distance + pan stereo position. Used by leaf voices like kick,
 * snare, hat, and bass where Haas widening isn't desired.
 */
export function makeSpatial(audio: AudioRefs, role: string): SpatialPair {
  const s = SPATIAL[role] ?? { pan: 0, dist: 0.3 };
  const dist = makeDistanceChain(audio, s);
  const pan = audio.actx.createStereoPanner();
  pan.pan.value = clampPan(s.pan);
  dist.output.connect(pan);
  return { input: dist.input, output: pan };
}

/**
 * Haas-style stereo widening — one side delayed ~14 ms (under the echo
 * perception threshold) so the source feels wider without audible motion.
 */
export function makeHaasSpatial(
  audio: AudioRefs,
  role: string,
  delayMs = 14,
): SpatialPair {
  const s = SPATIAL[role] ?? { pan: 0, dist: 0.3 };
  const dist = makeDistanceChain(audio, s);
  const width = 0.9;
  const leftPan = audio.actx.createStereoPanner();
  leftPan.pan.value = clampPan(s.pan - width);
  const rightPan = audio.actx.createStereoPanner();
  rightPan.pan.value = clampPan(s.pan + width);
  const leftGain = audio.actx.createGain();
  leftGain.gain.value = Math.SQRT1_2;
  const rightGain = audio.actx.createGain();
  rightGain.gain.value = Math.SQRT1_2;
  const delay = audio.actx.createDelay(0.05);
  delay.delayTime.value = delayMs / 1000;
  dist.output.connect(leftGain);
  leftGain.connect(leftPan);
  dist.output.connect(delay);
  delay.connect(rightGain);
  rightGain.connect(rightPan);
  const out = audio.actx.createGain();
  leftPan.connect(out);
  rightPan.connect(out);
  return { input: dist.input, output: out };
}

/**
 * Dispatch a single mixer slider to its audio target. Per-track gains
 * route through `audio.trackGains[key]`; reverb wet, rain, warp, and
 * master volume have dedicated nodes. `complexity` is purely a scheduler
 * read, so the audio-graph path ignores it — the caller is responsible
 * for writing the new value to the store.
 */
export function applySettingToAudio(
  audio: AudioRefs,
  key: keyof MoodSettings,
  val: number,
): void {
  if (key === "complexity") return;
  if (key === "vol") {
    const target = sliderToGain(val);
    const t = audio.actx.currentTime;
    audio.masterGain.gain.cancelScheduledValues(t);
    audio.masterGain.gain.setValueAtTime(audio.masterGain.gain.value, t);
    audio.masterGain.gain.linearRampToValueAtTime(target, t + 0.05);
    return;
  }
  if (key === "rain") {
    audio.rainGain.gain.value = sliderToGain(val);
    return;
  }
  if (key === "reverb") {
    audio.wetGain.gain.value = val;
    return;
  }
  if (key === "warp") {
    audio.warpModGain.gain.value = val;
    return;
  }
  const g = audio.trackGains[key];
  if (g) g.gain.value = sliderToGain(val);
}

/**
 * Construct the full audio graph. Must be called inside a user gesture
 * handler. Reads `currentMood` from the store; the caller is responsible
 * for everything else (starting the scheduler, mounting cascades).
 */
export function initAudio(store: Store<AppState>): AudioRefs {
  const W = globalThis as unknown as {
    AudioContext: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const actx = new (W.AudioContext ?? W.webkitAudioContext!)();
  const masterGain = actx.createGain();
  masterGain.gain.value = 0.65;

  const defaultGains: Record<TrackKey, number> = {
    drums: 0.9,
    bass: 0.85,
    comp: 0.8,
    melody1: 0.75,
    melody2: 0.65,
    hiss: 0.5,
    scratches: 0.7,
    ambience: 0.6,
    hum: 0.4,
  };
  const trackGains = {} as Record<TrackKey, GainNode>;
  for (const t of Object.keys(defaultGains) as TrackKey[]) {
    const g = actx.createGain();
    g.gain.value = defaultGains[t];
    g.connect(masterGain);
    trackGains[t] = g;
  }

  const compressor = actx.createDynamicsCompressor();
  compressor.threshold.value = -16;
  compressor.knee.value = 10;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.25;

  const lowShelf = actx.createBiquadFilter();
  lowShelf.type = "lowshelf";
  lowShelf.frequency.value = 200;
  lowShelf.gain.value = 3;

  const highShelf = actx.createBiquadFilter();
  highShelf.type = "highshelf";
  highShelf.frequency.value = 6000;
  highShelf.gain.value = -9;

  const convolver = actx.createConvolver();
  const wetGain = actx.createGain();
  wetGain.gain.value = DEFAULT_SETTINGS[store.get().currentMood].reverb;
  const dryGain = actx.createGain();
  dryGain.gain.value = 0.68;
  const analyser = actx.createAnalyser();
  analyser.fftSize = 512;

  masterGain.connect(compressor);
  compressor.connect(lowShelf);
  lowShelf.connect(highShelf);
  highShelf.connect(dryGain);
  dryGain.connect(analyser);
  highShelf.connect(wetGain);
  wetGain.connect(convolver);
  convolver.connect(analyser);
  analyser.connect(actx.destination);

  // Rain bus — bypasses track gains; its own slider is the master.
  const rainGain = actx.createGain();
  rainGain.gain.value = 0.16;
  rainGain.connect(masterGain);

  const ambienceGain = actx.createGain();
  ambienceGain.gain.value = 0;
  ambienceGain.connect(trackGains.ambience);

  // Warp/wow/flutter LFO bus — output is in cents.
  const warpModGain = actx.createGain();
  warpModGain.gain.value = 0;

  const wow = actx.createOscillator();
  wow.type = "sine";
  wow.frequency.value = 0.35;
  const wowDepth = actx.createGain();
  wowDepth.gain.value = 25;
  wow.connect(wowDepth);
  wowDepth.connect(warpModGain);
  wow.start();

  const flut = actx.createOscillator();
  flut.type = "sine";
  flut.frequency.value = 6.2;
  const flutDepth = actx.createGain();
  flutDepth.gain.value = 8;
  flut.connect(flutDepth);
  flutDepth.connect(warpModGain);
  flut.start();

  const flutDrift = actx.createOscillator();
  flutDrift.type = "sine";
  flutDrift.frequency.value = 0.08;
  const flutDriftDepth = actx.createGain();
  flutDriftDepth.gain.value = 1.5;
  flutDrift.connect(flutDriftDepth);
  flutDriftDepth.connect(flut.frequency);
  flutDrift.start();

  // Hum bus — 50 Hz fundamental plus harmonics, amplitude-modulated for life.
  const humGain = actx.createGain();
  humGain.gain.value = 0.5;
  humGain.connect(trackGains.hum);

  for (const [freq, gain] of [[50, 0.08], [100, 0.04], [150, 0.02], [200, 0.01]]) {
    const o = actx.createOscillator();
    o.type = "sine";
    o.frequency.value = freq;
    const g = actx.createGain();
    g.gain.value = gain;
    o.connect(g);
    g.connect(humGain);
    o.start();
  }

  const humLFO = actx.createOscillator();
  humLFO.type = "sine";
  humLFO.frequency.value = 0.7;
  const humLFOdepth = actx.createGain();
  humLFOdepth.gain.value = 0.04;
  humLFO.connect(humLFOdepth);
  humLFOdepth.connect(humGain.gain);
  humLFO.start();

  const audio: AudioRefs = {
    actx,
    masterGain,
    compressor,
    lowShelf,
    highShelf,
    dryGain,
    wetGain,
    convolver,
    analyser,
    trackGains,
    warpModGain,
    humGain,
    ambienceGain,
    rainGain,
  };

  applyMoodReverb(audio, store.get().currentMood);
  return audio;
}
