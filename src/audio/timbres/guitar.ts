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
  const freq = midiToFreq(midi);
  [
    [freq, 1],
    [freq * 2, 0.4],
    [freq * 3, 0.18],
    [freq * 4, 0.08],
  ].forEach(([partialFreq, relVel], idx) => {
    if (idx === 0) flashRow(audio.actx, rowId, time, 80);
    const osc = audio.actx.createOscillator();
    const gainNode = audio.actx.createGain();
    const filt = audio.actx.createBiquadFilter();
    osc.type = idx < 2 ? "sawtooth" : "sine";
    osc.frequency.value = partialFreq;
    applyWarp(audio, osc);
    const partialVel = vel * relVel;
    gainNode.gain.setValueAtTime(0, time);
    gainNode.gain.linearRampToValueAtTime(partialVel, time + 0.003);
    gainNode.gain.exponentialRampToValueAtTime(partialVel * 0.08, time + 0.09);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, time + Math.min(dur, 0.6));
    filt.type = "lowpass";
    filt.frequency.setValueAtTime(5000, time);
    filt.frequency.exponentialRampToValueAtTime(800, time + 0.08);
    filt.Q.value = 0.5;
    osc.connect(filt);
    filt.connect(gainNode);
    gainNode.connect(sp.input);
    osc.start(time);
    osc.stop(time + Math.min(dur, 0.65));
  });
}
