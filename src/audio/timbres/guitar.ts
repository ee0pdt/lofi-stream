import { applyWarp, makeHaasSpatial } from "../graph.ts";
import { midiToFreq } from "../timing.ts";
import { flashRow } from "../../ui/flash.ts";
import { roleRouting } from "./routing.ts";
import type { AudioRefs } from "../../types.ts";

export function playGuitar(
  audio: AudioRefs,
  midi: number,
  time: number,
  dur: number,
  vel = 0.18,
  role = "rhodesComp",
): void {
  const { trackKey, rowId } = roleRouting(role);
  const sp = makeHaasSpatial(audio, role);
  sp.output.connect(audio.trackGains[trackKey]);
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
    o.connect(filt);
    filt.connect(g);
    g.connect(sp.input);
    o.start(time);
    o.stop(time + Math.min(dur, 0.65));
  });
}
