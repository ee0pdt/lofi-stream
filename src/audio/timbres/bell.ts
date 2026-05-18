import { applyWarp, makeHaasSpatial } from "../graph.ts";
import { midiToFreq } from "../timing.ts";
import { flashRow } from "../../ui/flash.ts";
import { roleRouting } from "./routing.ts";
import type { AudioRefs } from "../../types.ts";

export function playBell(
  audio: AudioRefs,
  midi: number,
  time: number,
  dur: number,
  vel = 0.1,
  role = "rhodesComp",
  melBus: GainNode = audio.trackGains.melody1,
  melRowId?: string,
): void {
  const { rowId: defaultRow } = roleRouting(role);
  const rowId = melRowId ?? defaultRow;
  const sp = makeHaasSpatial(audio, role);
  sp.output.connect(melBus);
  const freq = midiToFreq(midi + 12);
  const harmonics: [number, number][] = [
    [freq, 1.0],
    [freq * 2, 0.35],
    [freq * 3, 0.12],
  ];
  harmonics.forEach(([partialFreq, amp], idx) => {
    if (idx === 0) flashRow(audio.actx, rowId, time, 120);
    const osc = audio.actx.createOscillator();
    const gainNode = audio.actx.createGain();
    osc.type = "sine";
    osc.frequency.value = partialFreq;
    applyWarp(audio, osc);
    const decayTime = Math.max(0.4, Math.min(dur * 0.85, 2.5)) * (1 - idx * 0.2);
    gainNode.gain.setValueAtTime(0, time);
    gainNode.gain.linearRampToValueAtTime(vel * amp, time + 0.001);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, time + decayTime);
    osc.connect(gainNode);
    gainNode.connect(sp.input);
    osc.start(time);
    osc.stop(time + decayTime + 0.05);
  });
}
