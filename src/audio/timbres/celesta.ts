import { applyWarp, buildIR, makeHaasSpatial } from "../graph.ts";
import { midiToFreq } from "../timing.ts";
import { flashRow } from "../../ui/flash.ts";
import type { AudioRefs } from "../../types.ts";

function roleRouting(role: string): { trackKey: string; rowId: string } {
  return role === "rhodesMel"
    ? { trackKey: "melody", rowId: "mx-melody" }
    : { trackKey: "comp", rowId: "mx-comp" };
}

let cachedCelestaIR: AudioBuffer | null = null;

export function playCelesta(
  audio: AudioRefs,
  midi: number,
  time: number,
  dur: number,
  vel = 0.1,
  role = "rhodesComp",
): void {
  const { trackKey, rowId } = roleRouting(role);
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
  if (cachedCelestaIR === null) cachedCelestaIR = buildIR(audio, 1.5, 0.6);
  const reverb2 = audio.actx.createConvolver();
  reverb2.buffer = cachedCelestaIR;
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
