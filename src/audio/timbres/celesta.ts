import { applyWarp, buildIR, makeHaasSpatial } from "../graph.ts";
import { midiToFreq } from "../timing.ts";
import { flashRow } from "../../ui/flash.ts";
import { roleRouting } from "./routing.ts";
import type { AudioRefs } from "../../types.ts";

let cachedCelestaIR: AudioBuffer | null = null;

export function playCelesta(
  audio: AudioRefs,
  midi: number,
  time: number,
  dur: number,
  vel = 0.1,
  role = "rhodesComp",
  melBus: GainNode = audio.trackGains.melody1,
): void {
  const { rowId } = roleRouting(role);
  flashRow(audio.actx, rowId, time, 90);
  const freq = midiToFreq(midi + 12);
  const osc = audio.actx.createOscillator();
  const gainNode = audio.actx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  applyWarp(audio, osc);
  gainNode.gain.setValueAtTime(0, time);
  gainNode.gain.linearRampToValueAtTime(vel * 0.6, time + 0.004);
  gainNode.gain.exponentialRampToValueAtTime(vel * 0.08, time + 0.2);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, time + Math.min(dur * 0.9, 1.2));
  if (cachedCelestaIR === null) cachedCelestaIR = buildIR(audio, 1.5, 0.6);
  const reverb2 = audio.actx.createConvolver();
  reverb2.buffer = cachedCelestaIR;
  const reverbGain = audio.actx.createGain();
  reverbGain.gain.value = 0.5;
  const sp = makeHaasSpatial(audio, role);
  osc.connect(gainNode);
  gainNode.connect(sp.input);
  sp.output.connect(melBus);
  gainNode.connect(reverbGain);
  reverbGain.connect(reverb2);
  reverb2.connect(melBus);
  osc.start(time);
  osc.stop(time + Math.min(dur, 1.3));
}
