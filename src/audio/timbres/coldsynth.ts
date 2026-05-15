import { applyWarp, makeHaasSpatial } from "../graph.ts";
import { beatDur, midiToFreq } from "../timing.ts";
import { flashRow } from "../../ui/flash.ts";
import { roleRouting } from "./routing.ts";
import type { AudioRefs } from "../../types.ts";

export function playColdsynth(
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
  const freq = midiToFreq(midi);
  const bd = beatDur(bpm);
  [
    [freq, 1.0],
    [freq * 1.003, 0.8],
    [freq * 0.997, 0.8],
  ].forEach(([partialFreq, amp], idx) => {
    if (idx === 0) flashRow(audio.actx, rowId, time, 300);
    const osc = audio.actx.createOscillator();
    const gainNode = audio.actx.createGain();
    const filt = audio.actx.createBiquadFilter();
    osc.type = "sawtooth";
    osc.frequency.value = partialFreq;
    applyWarp(audio, osc);
    gainNode.gain.setValueAtTime(0, time);
    gainNode.gain.linearRampToValueAtTime(vel * amp, time + 0.05);
    gainNode.gain.setValueAtTime(vel * amp, time + dur);
    gainNode.gain.linearRampToValueAtTime(0, time + dur + bd * 0.8);
    filt.type = "lowpass";
    filt.frequency.value = 1600;
    filt.Q.value = 0.6;
    osc.connect(filt);
    filt.connect(gainNode);
    gainNode.connect(sp.input);
    osc.start(time);
    osc.stop(time + dur + bd * 0.9);
  });
}
