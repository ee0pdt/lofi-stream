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
  melBus: GainNode = audio.trackGains.melody1,
  melRowId?: string,
): void {
  const { rowId: defaultRow } = roleRouting(role);
  const rowId = melRowId ?? defaultRow;
  const sp = makeHaasSpatial(audio, role);
  sp.output.connect(melBus);
  const freq = midiToFreq(midi);
  [
    [freq, 0.9],
    [freq * 2, 0.12],
  ].forEach(([partialFreq, relVel], idx) => {
    if (idx === 0) flashRow(audio.actx, rowId, time, 120);
    const osc = audio.actx.createOscillator();
    const gainNode = audio.actx.createGain();
    osc.type = "sine";
    osc.frequency.value = partialFreq;
    applyWarp(audio, osc);
    const partialVel = vel * relVel;
    gainNode.gain.setValueAtTime(0, time);
    gainNode.gain.linearRampToValueAtTime(partialVel, time + 0.005);
    gainNode.gain.exponentialRampToValueAtTime(partialVel * 0.3, time + 0.12);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, time + dur * 1.4);
    osc.connect(gainNode);
    gainNode.connect(sp.input);
    osc.start(time);
    osc.stop(time + dur * 1.5);
  });
}
