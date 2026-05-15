import { applyWarp, makeHaasSpatial } from "../graph.ts";
import { beatDur, midiToFreq } from "../timing.ts";
import { flashRow } from "../../ui/flash.ts";
import { roleRouting } from "./routing.ts";
import type { AudioRefs } from "../../types.ts";

export function playPad(
  audio: AudioRefs,
  midi: number,
  time: number,
  dur: number,
  vel = 0.1,
  role = "rhodesComp",
  bpm = 80,
): void {
  const { trackKey, rowId } = roleRouting(role);
  const sp = makeHaasSpatial(audio, role);
  sp.output.connect(audio.trackGains[trackKey]);
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
    o.connect(filt);
    filt.connect(g);
    g.connect(sp.input);
    o.start(time);
    o.stop(time + dur + bd * 0.6);
  });
}
