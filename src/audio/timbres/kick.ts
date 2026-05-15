import { makeSpatial, noiseBuffer } from "../graph.ts";
import { flashRow } from "../../ui/flash.ts";
import type { AudioRefs, Mood } from "../../types.ts";

export function playKick(audio: AudioRefs, time: number, mood: Mood): void {
  flashRow(audio.actx, "mx-drums", time, 120);
  const vel = mood === "sleepy" ? 0.38 : 0.55;
  const osc = audio.actx.createOscillator();
  const gainNode = audio.actx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(180, time);
  osc.frequency.exponentialRampToValueAtTime(38, time + 0.18);
  gainNode.gain.setValueAtTime(vel, time);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, time + 0.28);
  const sp = makeSpatial(audio, "kick");
  osc.connect(gainNode);
  gainNode.connect(sp.input);
  sp.output.connect(audio.trackGains.drums);
  osc.start(time);
  osc.stop(time + 0.3);
  const noiseBuf = noiseBuffer(audio.actx, 0.008);
  const src = audio.actx.createBufferSource();
  src.buffer = noiseBuf;
  const clickGain = audio.actx.createGain();
  clickGain.gain.value = 0.1;
  src.connect(clickGain);
  clickGain.connect(sp.input);
  src.start(time);
}
