import { applyWarp, makeHaasSpatial } from "../graph.ts";
import { midiToFreq } from "../timing.ts";
import { flashRow } from "../../ui/flash.ts";
import { roleRouting } from "./routing.ts";
import type { AudioRefs } from "../../types.ts";

export function playVibraphone(
  audio: AudioRefs,
  midi: number,
  time: number,
  dur: number,
  vel = 0.14,
  role = "rhodesComp",
): void {
  const { trackKey, rowId } = roleRouting(role);
  const sp = makeHaasSpatial(audio, role);
  sp.output.connect(audio.trackGains[trackKey]);
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
    o.connect(g);
    g.connect(sp.input);
    o.start(time);
    o.stop(time + dur * 1.5);
  });
}
