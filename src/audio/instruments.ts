/**
 * Voicing/timbre synths, drum hits, and ambient sounds. Each `play*` function
 * builds a one-shot voice for a specific midi/time/duration. Long-lived noise
 * (tape hiss, vinyl scratches) is also managed here — all are
 * "things that schedule audio events".
 *
 * Comp/melody timbre choice is per-mood (see `MOOD_META.compTimbre`),
 * so `playComp`/`playMelody` accept the current mood and dispatch
 * internally.
 */

import { MOOD_META } from "../music/moods.ts";
import { applyWarp, makeSpatial, noiseBuffer } from "./graph.ts";
import { randRange } from "./rand.ts";
import type { AppState, AudioRefs, Mood } from "../types.ts";
import type { Store } from "../store.ts";
import { midiToFreq } from "./timing.ts";
import { flashRow } from "../ui/flash.ts";

// Harmonic timbres used by playComp/playMelody
import { playRhodes } from "./timbres/rhodes.ts";
import { playVibraphone } from "./timbres/vibraphone.ts";
import { playGuitar } from "./timbres/guitar.ts";
import { playPad } from "./timbres/pad.ts";
import { playCelesta } from "./timbres/celesta.ts";
import { playBell } from "./timbres/bell.ts";
import { playColdsynth } from "./timbres/coldsynth.ts";

export { beatDur, midiToFreq, swungTime } from "./timing.ts";
export { flashRow };

export { playKick } from "./timbres/kick.ts";
export { playSnare } from "./timbres/snare.ts";
export { playHat } from "./timbres/hat.ts";
export { playBell, playCelesta, playColdsynth, playGuitar, playPad, playRhodes, playVibraphone };

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
  else if (t === "coldsynth") playColdsynth(audio, midi, time, dur, vel, role, bpm);
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
  else if (t === "bell") playBell(audio, midi, time, dur, vel, role);
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
