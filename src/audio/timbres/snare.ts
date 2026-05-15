import { MOOD_META } from "../../music/moods.ts";
import { makeSpatial, noiseBuffer } from "../graph.ts";
import { flashRow } from "../../ui/flash.ts";
import type { AudioRefs, Mood } from "../../types.ts";

export function playSnare(
  audio: AudioRefs,
  time: number,
  mood: Mood,
  ghost = false,
): void {
  if (!ghost) flashRow(audio.actx, "mx-drums", time, 80);
  const m = MOOD_META[mood];
  const vol = ghost ? 0.04 : mood === "sleepy" ? 0.09 : 0.15;
  const b = noiseBuffer(audio.actx, 0.18);
  const src = audio.actx.createBufferSource();
  src.buffer = b;
  const filt = audio.actx.createBiquadFilter();
  filt.type = "bandpass";
  filt.frequency.value = m.snareFreq;
  filt.Q.value = m.snareQ;
  const g = audio.actx.createGain();
  g.gain.setValueAtTime(vol, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.15);
  const sp = makeSpatial(audio, "snare");
  src.connect(filt);
  filt.connect(g);
  g.connect(sp.input);
  sp.output.connect(audio.trackGains.drums);
  src.start(time);
}
