import { MOOD_META } from "../music/moods.ts";
import { applyWarp, makeSpatial } from "./graph.ts";
import { midiToFreq } from "./timing.ts";
import { flashRow } from "../ui/flash.ts";
import { playRhodes } from "./timbres/rhodes.ts";
import { playVibraphone } from "./timbres/vibraphone.ts";
import { playGuitar } from "./timbres/guitar.ts";
import { playPad } from "./timbres/pad.ts";
import { playCelesta } from "./timbres/celesta.ts";
import { playBell } from "./timbres/bell.ts";
import { playColdsynth } from "./timbres/coldsynth.ts";
import type { AudioRefs, Mood } from "../types.ts";

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
