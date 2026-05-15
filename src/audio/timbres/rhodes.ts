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
): void {
  const { trackKey, rowId } = roleRouting(role);
  const sp = makeHaasSpatial(audio, role);
  sp.output.connect(audio.trackGains[trackKey]);
  const partials: ReadonlyArray<readonly [number, OscillatorType]> = [
    [midiToFreq(midi), "sine"],
    [midiToFreq(midi) * 1.004, "sine"],
    [midiToFreq(midi) * 0.997, "triangle"],
  ];
  partials.forEach(([f, type], i) => {
    if (i === 0) flashRow(audio.actx, rowId, time, 120);
    const o = audio.actx.createOscillator();
    const g = audio.actx.createGain();
    const filt = audio.actx.createBiquadFilter();
    o.type = type;
    o.frequency.value = f;
    applyWarp(audio, o);
    const v = vel * (i === 2 ? 0.3 : 1);
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(v, time + 0.008);
    g.gain.exponentialRampToValueAtTime(v * 0.55, time + 0.06);
    g.gain.setValueAtTime(v * 0.55, time + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur * 0.95);
    filt.type = "lowpass";
    filt.frequency.setValueAtTime(1800, time);
    filt.frequency.exponentialRampToValueAtTime(700, time + dur * 0.7);
    filt.Q.value = 0.8;
    o.connect(filt);
    filt.connect(g);
    g.connect(sp.input);
    o.start(time);
    o.stop(time + dur + 0.05);
  });
}
