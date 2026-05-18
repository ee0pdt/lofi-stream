import { applyWarp, makeHaasSpatial } from "../graph.ts";
import { midiToFreq } from "../timing.ts";
import { flashRow } from "../../ui/flash.ts";
import { roleRouting } from "./routing.ts";
import type { AudioRefs } from "../../types.ts";

export function playRhodes(
  audio: AudioRefs,
  midi: number,
  time: number,
  dur: number,
  vel = 0.16,
  role = "rhodesComp",
  melBus: GainNode = audio.trackGains.melody1,
): void {
  const { rowId } = roleRouting(role);
  const sp = makeHaasSpatial(audio, role);
  sp.output.connect(melBus);
  const partials: ReadonlyArray<readonly [number, OscillatorType]> = [
    [midiToFreq(midi), "sine"],
    [midiToFreq(midi) * 1.004, "sine"],
    [midiToFreq(midi) * 0.997, "triangle"],
  ];
  partials.forEach(([partialFreq, type], i) => {
    if (i === 0) flashRow(audio.actx, rowId, time, 120);
    const osc = audio.actx.createOscillator();
    const gainNode = audio.actx.createGain();
    const filt = audio.actx.createBiquadFilter();
    osc.type = type;
    osc.frequency.value = partialFreq;
    applyWarp(audio, osc);
    const partialVel = vel * (i === 2 ? 0.3 : 1);
    gainNode.gain.setValueAtTime(0, time);
    gainNode.gain.linearRampToValueAtTime(partialVel, time + 0.008);
    gainNode.gain.exponentialRampToValueAtTime(partialVel * 0.55, time + 0.06);
    gainNode.gain.setValueAtTime(partialVel * 0.55, time + dur * 0.5);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, time + dur * 0.95);
    filt.type = "lowpass";
    filt.frequency.setValueAtTime(1800, time);
    filt.frequency.exponentialRampToValueAtTime(700, time + dur * 0.7);
    filt.Q.value = 0.8;
    osc.connect(filt);
    filt.connect(gainNode);
    gainNode.connect(sp.input);
    osc.start(time);
    osc.stop(time + dur + 0.05);
  });
}
