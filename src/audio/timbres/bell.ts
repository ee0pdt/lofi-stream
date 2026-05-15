import { applyWarp, makeHaasSpatial } from "../graph.ts";
import { midiToFreq } from "../timing.ts";
import { flashRow } from "../../ui/flash.ts";
import type { AudioRefs } from "../../types.ts";

function roleRouting(role: string): { trackKey: string; rowId: string } {
  return role === "rhodesMel"
    ? { trackKey: "melody", rowId: "mx-melody" }
    : { trackKey: "comp", rowId: "mx-comp" };
}

export function playBell(
  audio: AudioRefs,
  midi: number,
  time: number,
  dur: number,
  vel = 0.1,
  role = "rhodesComp",
): void {
  const { trackKey, rowId } = roleRouting(role);
  const sp = makeHaasSpatial(audio, role);
  sp.output.connect(audio.trackGains[trackKey]);
  const f = midiToFreq(midi + 12);
  const harmonics: [number, number][] = [
    [f, 1.0],
    [f * 2, 0.35],
    [f * 3, 0.12],
  ];
  harmonics.forEach(([freq, amp], idx) => {
    if (idx === 0) flashRow(audio.actx, rowId, time, 120);
    const o = audio.actx.createOscillator();
    const g = audio.actx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    applyWarp(audio, o);
    const decayTime = Math.max(0.4, Math.min(dur * 0.85, 2.5)) * (1 - idx * 0.2);
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(vel * amp, time + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, time + decayTime);
    o.connect(g);
    g.connect(sp.input);
    o.start(time);
    o.stop(time + decayTime + 0.05);
  });
}
