/**
 * Voicing/timbre synths plus drum hits. Each `play*` function builds a
 * one-shot voice for a specific midi/time/duration. Long-lived noise
 * (tape hiss, vinyl scratches) and short-lived percussion (kick/snare/hat)
 * also live here — they're all "things that schedule audio events".
 *
 * Comp/melody timbre choice is per-mood (see `MOOD_META.compTimbre`),
 * so `playComp`/`playMelody` accept the current mood and dispatch
 * internally.
 */

import { MOOD_META } from "../music/moods.ts";
import { applyWarp, buildIR, makeHaasSpatial, makeSpatial, noiseBuffer } from "./graph.ts";
import type { AppState, AudioRefs, Mood } from "../types.ts";
import type { Store } from "../store.ts";

export function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export function beatDur(bpm: number): number {
  return 60 / bpm;
}

export function swungTime(
  i: number,
  barStart: number,
  bpm: number,
  swingAmount: number,
): number {
  const sd = beatDur(bpm) / 4;
  return barStart + i * sd + (i % 2 === 1 ? swingAmount * sd : 0);
}

const FLASH_DUR = 80;

/**
 * Fire a brief CSS flash on the given mixer-row's range input at the
 * wall-clock moment when the audio event plays. No-ops if the event is
 * already more than 50ms in the past.
 */
export function flashRow(
  actx: AudioContext,
  rowId: string,
  scheduledAudioTime: number,
  duration = FLASH_DUR,
): void {
  const delayMs = (scheduledAudioTime - actx.currentTime) * 1000;
  if (delayMs < -50) return;
  setTimeout(() => {
    const row = document.getElementById(rowId);
    if (!row) return;
    const input = row.querySelector("input[type=range]");
    if (!input) return;
    input.classList.add("flash");
    setTimeout(() => input.classList.remove("flash"), duration);
  }, Math.max(0, delayMs));
}

function randRange(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

export function playRhodes(
  audio: AudioRefs,
  midi: number,
  time: number,
  dur: number,
  vel = 0.16,
  role = "rhodesComp",
): void {
  const trackKey = role === "rhodesMel" ? "melody" : "comp";
  const rowId = role === "rhodesMel" ? "mx-melody" : "mx-comp";
  [
    [midiToFreq(midi), "sine"],
    [midiToFreq(midi) * 1.004, "sine"],
    [midiToFreq(midi) * 0.997, "triangle"],
  ].forEach(([f, type], i) => {
    if (i === 0) flashRow(audio.actx, rowId, time, 120);
    const o = audio.actx.createOscillator();
    const g = audio.actx.createGain();
    const filt = audio.actx.createBiquadFilter();
    o.type = type as OscillatorType;
    o.frequency.value = f as number;
    applyWarp(audio, o);
    const v = vel * (i === 2 ? 0.3 : 1);
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(v, time + 0.008);
    g.gain.exponentialRampToValueAtTime(v * 0.55, time + 0.06);
    g.gain.setValueAtTime(v * 0.55, time + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur * 0.95);
    filt.type = "lowpass";
    filt.frequency.setValueAtTime(1800, time);
    filt.frequency.exponentialRampToValueAtTime(700, time + dur * 0.7);
    filt.Q.value = 0.8;
    const sp = makeHaasSpatial(audio, role);
    o.connect(filt);
    filt.connect(g);
    g.connect(sp.input);
    sp.output.connect(audio.trackGains[trackKey]);
    o.start(time);
    o.stop(time + dur + 0.05);
  });
}

export function playVibraphone(
  audio: AudioRefs,
  midi: number,
  time: number,
  dur: number,
  vel = 0.14,
  role = "rhodesComp",
): void {
  const trackKey = role === "rhodesMel" ? "melody" : "comp";
  const rowId = role === "rhodesMel" ? "mx-melody" : "mx-comp";
  const f = midiToFreq(midi);
  [
    [f, 0.9],
    [f * 2, 0.12],
  ].forEach(([freq, relVel], idx) => {
    if (idx === 0) flashRow(audio.actx, rowId, time, 120);
    const o = audio.actx.createOscillator();
    const g = audio.actx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    applyWarp(audio, o);
    const v = vel * relVel;
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(v, time + 0.005);
    g.gain.exponentialRampToValueAtTime(v * 0.3, time + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur * 1.4);
    const sp = makeHaasSpatial(audio, role);
    o.connect(g);
    g.connect(sp.input);
    sp.output.connect(audio.trackGains[trackKey]);
    o.start(time);
    o.stop(time + dur * 1.5);
  });
}

export function playGuitar(
  audio: AudioRefs,
  midi: number,
  time: number,
  dur: number,
  vel = 0.18,
  role = "rhodesComp",
): void {
  const trackKey = role === "rhodesMel" ? "melody" : "comp";
  const rowId = role === "rhodesMel" ? "mx-melody" : "mx-comp";
  const f = midiToFreq(midi);
  [
    [f, 1],
    [f * 2, 0.4],
    [f * 3, 0.18],
    [f * 4, 0.08],
  ].forEach(([freq, relVel], idx) => {
    if (idx === 0) flashRow(audio.actx, rowId, time, 80);
    const o = audio.actx.createOscillator();
    const g = audio.actx.createGain();
    const filt = audio.actx.createBiquadFilter();
    o.type = idx < 2 ? "sawtooth" : "sine";
    o.frequency.value = freq;
    applyWarp(audio, o);
    const v = vel * relVel;
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(v, time + 0.003);
    g.gain.exponentialRampToValueAtTime(v * 0.08, time + 0.09);
    g.gain.exponentialRampToValueAtTime(0.0001, time + Math.min(dur, 0.6));
    filt.type = "lowpass";
    filt.frequency.setValueAtTime(5000, time);
    filt.frequency.exponentialRampToValueAtTime(800, time + 0.08);
    filt.Q.value = 0.5;
    const sp = makeHaasSpatial(audio, role);
    o.connect(filt);
    filt.connect(g);
    g.connect(sp.input);
    sp.output.connect(audio.trackGains[trackKey]);
    o.start(time);
    o.stop(time + Math.min(dur, 0.65));
  });
}

export function playPad(
  audio: AudioRefs,
  midi: number,
  time: number,
  dur: number,
  vel = 0.1,
  role = "rhodesComp",
  bpm = 80,
): void {
  const trackKey = role === "rhodesMel" ? "melody" : "comp";
  const rowId = role === "rhodesMel" ? "mx-melody" : "mx-comp";
  const f = midiToFreq(midi);
  const bd = beatDur(bpm);
  [
    [f, 1],
    [f * 1.002, 0.7],
    [f * 0.998, 0.7],
  ].forEach(([freq], idx) => {
    if (idx === 0) flashRow(audio.actx, rowId, time, 300);
    const o = audio.actx.createOscillator();
    const g = audio.actx.createGain();
    const filt = audio.actx.createBiquadFilter();
    o.type = "sine";
    o.frequency.value = freq;
    applyWarp(audio, o);
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(vel, time + bd * 0.8);
    g.gain.setValueAtTime(vel, time + dur * 0.6);
    g.gain.linearRampToValueAtTime(0, time + dur + bd * 0.5);
    filt.type = "lowpass";
    filt.frequency.value = 900;
    filt.Q.value = 0.4;
    const sp = makeHaasSpatial(audio, role);
    o.connect(filt);
    filt.connect(g);
    g.connect(sp.input);
    sp.output.connect(audio.trackGains[trackKey]);
    o.start(time);
    o.stop(time + dur + bd * 0.6);
  });
}

export function playCelesta(
  audio: AudioRefs,
  midi: number,
  time: number,
  dur: number,
  vel = 0.1,
  role = "rhodesComp",
): void {
  const trackKey = role === "rhodesMel" ? "melody" : "comp";
  const rowId = role === "rhodesMel" ? "mx-melody" : "mx-comp";
  flashRow(audio.actx, rowId, time, 90);
  const f = midiToFreq(midi + 12);
  const o = audio.actx.createOscillator();
  const g = audio.actx.createGain();
  o.type = "sine";
  o.frequency.value = f;
  applyWarp(audio, o);
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(vel * 0.6, time + 0.004);
  g.gain.exponentialRampToValueAtTime(vel * 0.08, time + 0.2);
  g.gain.exponentialRampToValueAtTime(0.0001, time + Math.min(dur * 0.9, 1.2));
  const reverb2 = audio.actx.createConvolver();
  reverb2.buffer = buildIR(audio, 1.5, 0.6);
  const rv = audio.actx.createGain();
  rv.gain.value = 0.5;
  const sp = makeHaasSpatial(audio, role);
  o.connect(g);
  g.connect(sp.input);
  sp.output.connect(audio.trackGains[trackKey]);
  g.connect(rv);
  rv.connect(reverb2);
  reverb2.connect(audio.trackGains[trackKey]);
  o.start(time);
  o.stop(time + Math.min(dur, 1.3));
}

export function playComp(
  audio: AudioRefs,
  midi: number,
  time: number,
  dur: number,
  vel: number,
  role: string,
  mood: Mood,
  bpm: number,
): void {
  const t = MOOD_META[mood].compTimbre;
  if (t === "vibraphone") playVibraphone(audio, midi, time, dur, vel, role);
  else if (t === "guitar") playGuitar(audio, midi, time, dur, vel, role);
  else if (t === "pad") playPad(audio, midi, time, dur, vel, role, bpm);
  else playRhodes(audio, midi, time, dur, vel, role);
}

export function playMelody(
  audio: AudioRefs,
  midi: number,
  time: number,
  dur: number,
  vel: number,
  role: string,
  mood: Mood,
): void {
  const t = MOOD_META[mood].melTimbre;
  if (t === "vibraphone") playVibraphone(audio, midi, time, dur, vel, role);
  else if (t === "celesta") playCelesta(audio, midi, time, dur, vel, role);
  else playRhodes(audio, midi, time, dur, vel, role);
}

export function playBass(
  audio: AudioRefs,
  midi: number,
  time: number,
  dur: number,
  vel = 0.28,
  mood: Mood = "rainy",
): void {
  if (vel >= 0.28) flashRow(audio.actx, "mx-bass", time, 100);
  const m = MOOD_META[mood];
  const o = audio.actx.createOscillator();
  const o2 = audio.actx.createOscillator();
  const g = audio.actx.createGain();
  const filt = audio.actx.createBiquadFilter();
  o.type = "triangle";
  o2.type = "sine";
  o.frequency.value = midiToFreq(midi);
  o2.frequency.value = midiToFreq(midi - 12);
  applyWarp(audio, o);
  applyWarp(audio, o2);
  filt.type = "lowpass";
  filt.frequency.value = m.bassFilter;
  filt.Q.value = 1.1;
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(vel, time + m.bassAttack);
  g.gain.setValueAtTime(vel * 0.75, time + 0.1);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur * 0.88);
  const sp = makeSpatial(audio, "bass");
  o.connect(filt);
  o2.connect(filt);
  filt.connect(g);
  g.connect(sp.input);
  sp.output.connect(audio.trackGains.bass);
  o.start(time);
  o2.start(time);
  o.stop(time + dur + 0.05);
  o2.stop(time + dur + 0.05);
}

export function playKick(audio: AudioRefs, time: number, mood: Mood): void {
  flashRow(audio.actx, "mx-drums", time, 120);
  const vel = mood === "sleepy" ? 0.38 : 0.55;
  const o = audio.actx.createOscillator();
  const g = audio.actx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(180, time);
  o.frequency.exponentialRampToValueAtTime(38, time + 0.18);
  g.gain.setValueAtTime(vel, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.28);
  const sp = makeSpatial(audio, "kick");
  o.connect(g);
  g.connect(sp.input);
  sp.output.connect(audio.trackGains.drums);
  o.start(time);
  o.stop(time + 0.3);
  const b = noiseBuffer(audio.actx, 0.008);
  const src = audio.actx.createBufferSource();
  src.buffer = b;
  const cg = audio.actx.createGain();
  cg.gain.value = 0.1;
  src.connect(cg);
  cg.connect(sp.input);
  src.start(time);
}

export function playSnare(
  audio: AudioRefs,
  time: number,
  mood: Mood,
  ghost = false,
): void {
  if (!ghost) flashRow(audio.actx, "mx-drums", time, 80);
  const m = MOOD_META[mood];
  const vol = ghost ? 0.04 : mood === "sleepy" ? 0.09 : 0.15;
  const b = noiseBuffer(audio.actx, 0.18);
  const src = audio.actx.createBufferSource();
  src.buffer = b;
  const filt = audio.actx.createBiquadFilter();
  filt.type = "bandpass";
  filt.frequency.value = m.snareFreq;
  filt.Q.value = m.snareQ;
  const g = audio.actx.createGain();
  g.gain.setValueAtTime(vol, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.15);
  const sp = makeSpatial(audio, "snare");
  src.connect(filt);
  filt.connect(g);
  g.connect(sp.input);
  sp.output.connect(audio.trackGains.drums);
  src.start(time);
}

export function playHat(
  audio: AudioRefs,
  time: number,
  mood: Mood,
  open = false,
  vol = 0.06,
): void {
  flashRow(audio.actx, "mx-drums", time, 40);
  const moodVol = { rainy: 1, late: 0.9, cafe: 0.7, sleepy: 0.5 }[mood] ?? 1;
  const len = open ? 0.22 : 0.04;
  const b = noiseBuffer(audio.actx, len);
  const src = audio.actx.createBufferSource();
  src.buffer = b;
  const filt = audio.actx.createBiquadFilter();
  filt.type = "highpass";
  filt.frequency.value = mood === "cafe" ? 11000 : 9000;
  const g = audio.actx.createGain();
  g.gain.setValueAtTime(vol * moodVol, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + len * 0.85);
  const sp = makeSpatial(audio, "hat");
  src.connect(filt);
  filt.connect(g);
  g.connect(sp.input);
  sp.output.connect(audio.trackGains.drums);
  src.start(time);
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
