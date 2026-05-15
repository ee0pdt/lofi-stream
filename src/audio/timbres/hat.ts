import { makeSpatial, noiseBuffer } from "../graph.ts";
import { flashRow } from "../../ui/flash.ts";
import type { AudioRefs, Mood } from "../../types.ts";

export function playHat(
  audio: AudioRefs,
  time: number,
  mood: Mood,
  open = false,
  vol = 0.06,
): void {
  flashRow(audio.actx, "mx-drums", time, 40);
  const moodVol = { rainy: 1, late: 0.9, cafe: 0.7, sleepy: 0.5, transit: 0.6 }[mood] ?? 1;
  const len = open ? 0.22 : 0.04;
  const b = noiseBuffer(audio.actx, len);
  const src = audio.actx.createBufferSource();
  src.buffer = b;
  const filt = audio.actx.createBiquadFilter();
  filt.type = "highpass";
  filt.frequency.value = mood === "cafe" ? 11000 : 9000;
  const g = audio.actx.createGain();
  g.gain.setValueAtTime(vol * moodVol, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + len * 0.85);
  const sp = makeSpatial(audio, "hat");
  src.connect(filt);
  filt.connect(g);
  g.connect(sp.input);
  sp.output.connect(audio.trackGains.drums);
  src.start(time);
}
