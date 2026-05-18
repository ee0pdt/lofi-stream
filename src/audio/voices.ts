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
  const timbre = MOOD_META[mood].compTimbre;
  if (timbre === "vibraphone") {
    playVibraphone(audio, midi, time, dur, vel, role, audio.trackGains.comp);
  } else if (timbre === "guitar") playGuitar(audio, midi, time, dur, vel, role);
  else if (timbre === "pad") playPad(audio, midi, time, dur, vel, role, bpm);
  else if (timbre === "coldsynth") playColdsynth(audio, midi, time, dur, vel, role, bpm);
  else playRhodes(audio, midi, time, dur, vel, role, audio.trackGains.comp);
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
  playMelodyTimbre(audio, midi, time, dur, vel, role, MOOD_META[mood].melTimbre, 1);
}

/** Play a melody note with an explicit timbre rather than deriving it from mood.
 *  `voice` selects which melody bus the note routes to (1 → melody1, 2 → melody2). */
export function playMelodyTimbre(
  audio: AudioRefs,
  midi: number,
  time: number,
  dur: number,
  vel: number,
  role: string,
  timbre: import("../types.ts").Timbre,
  voice: 1 | 2 = 1,
): void {
  const melBus = voice === 1 ? audio.trackGains.melody1 : audio.trackGains.melody2;
  if (timbre === "vibraphone") playVibraphone(audio, midi, time, dur, vel, role, melBus);
  else if (timbre === "celesta") playCelesta(audio, midi, time, dur, vel, role, melBus);
  else if (timbre === "bell") playBell(audio, midi, time, dur, vel, role, melBus);
  else playRhodes(audio, midi, time, dur, vel, role, melBus);
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
  const moodMeta = MOOD_META[mood];
  const osc = audio.actx.createOscillator();
  const oscSub = audio.actx.createOscillator();
  const gainNode = audio.actx.createGain();
  const filt = audio.actx.createBiquadFilter();
  osc.type = "triangle";
  oscSub.type = "sine";
  osc.frequency.value = midiToFreq(midi);
  oscSub.frequency.value = midiToFreq(midi - 12);
  applyWarp(audio, osc);
  applyWarp(audio, oscSub);
  filt.type = "lowpass";
  filt.frequency.value = moodMeta.bassFilter;
  filt.Q.value = 1.1;
  gainNode.gain.setValueAtTime(0, time);
  gainNode.gain.linearRampToValueAtTime(vel, time + moodMeta.bassAttack);
  gainNode.gain.setValueAtTime(vel * 0.75, time + 0.1);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, time + dur * 0.88);
  const sp = makeSpatial(audio, "bass");
  osc.connect(filt);
  oscSub.connect(filt);
  filt.connect(gainNode);
  gainNode.connect(sp.input);
  sp.output.connect(audio.trackGains.bass);
  osc.start(time);
  oscSub.start(time);
  osc.stop(time + dur + 0.05);
  oscSub.stop(time + dur + 0.05);
}
