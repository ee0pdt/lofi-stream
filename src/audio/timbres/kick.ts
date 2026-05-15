import { makeSpatial, noiseBuffer } from "../graph.ts";
import { flashRow } from "../../ui/flash.ts";
import type { AudioRefs, Mood } from "../../types.ts";

export function playKick(audio: AudioRefs, time: number, mood: Mood): void {
  flashRow(audio.actx, "mx-drums", time, 120);
  const vel = mood === "sleepy" ? 0.38 : 0.55;
  const o = audio.actx.createOscillator();
  const g = audio.actx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(180, time);
  o.frequency.exponentialRampToValueAtTime(38, time + 0.18);
  g.gain.setValueAtTime(vel, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.28);
  const sp = makeSpatial(audio, "kick");
  o.connect(g);
  g.connect(sp.input);
  sp.output.connect(audio.trackGains.drums);
  o.start(time);
  o.stop(time + 0.3);
  const b = noiseBuffer(audio.actx, 0.008);
  const src = audio.actx.createBufferSource();
  src.buffer = b;
  const cg = audio.actx.createGain();
  cg.gain.value = 0.1;
  src.connect(cg);
  cg.connect(sp.input);
  src.start(time);
}
