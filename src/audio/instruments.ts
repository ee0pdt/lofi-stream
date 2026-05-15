/**
 * Voicing/timbre synths, drum hits, and ambient sounds. Each `play*` function
 * builds a one-shot voice for a specific midi/time/duration. Long-lived noise
 * (tape hiss, vinyl scratches) is also managed here — all are
 * "things that schedule audio events".
 *
 * Comp/melody/bass voice dispatchers are in `./voices.ts`.
 */

import { noiseBuffer } from "./graph.ts";
import { randRange } from "./rand.ts";
import type { AppState, AudioRefs } from "../types.ts";
import type { Store } from "../store.ts";

export { beatDur, midiToFreq, swungTime } from "./timing.ts";
export { flashRow } from "../ui/flash.ts";

export { playKick } from "./timbres/kick.ts";
export { playSnare } from "./timbres/snare.ts";
export { playHat } from "./timbres/hat.ts";
export { playRhodes } from "./timbres/rhodes.ts";
export { playVibraphone } from "./timbres/vibraphone.ts";
export { playGuitar } from "./timbres/guitar.ts";
export { playPad } from "./timbres/pad.ts";
export { playCelesta } from "./timbres/celesta.ts";
export { playBell } from "./timbres/bell.ts";
export { playColdsynth } from "./timbres/coldsynth.ts";

export { playBass, playComp, playMelody } from "./voices.ts";

/**
 * Decorrelated tape hiss bed: two EQ bands, each panned hard L/R so the
 * hiss stays stereo rather than collapsing mono. Sources are not tracked
 * for teardown — hiss persists across mood changes.
 */
export function startTapeHiss(audio: AudioRefs): void {
  for (
    const { freq, Q, gain } of [
      { freq: 5500, Q: 0.6, gain: 0.09 },
      { freq: 1800, Q: 0.4, gain: 0.035 },
    ]
  ) {
    for (const panValue of [-0.9, 0.9]) {
      const src = audio.actx.createBufferSource();
      src.buffer = noiseBuffer(audio.actx, 4, true);
      src.loop = true;
      const filt = audio.actx.createBiquadFilter();
      filt.type = "bandpass";
      filt.frequency.value = freq;
      filt.Q.value = Q;
      const g = audio.actx.createGain();
      g.gain.value = gain;
      const p = audio.actx.createStereoPanner();
      p.pan.value = panValue;
      src.connect(filt);
      filt.connect(g);
      g.connect(p);
      p.connect(audio.trackGains.hiss);
      src.start();
    }
  }
}

/**
 * Play one vinyl-scratch burst (2-4 randomised grains) and schedule the
 * next via setTimeout. No-ops if playback has stopped — the next event
 * just won't recurse.
 */
export function playVinylScratch(
  audio: AudioRefs,
  store: Store<AppState>,
): void {
  if (!store.get().isPlaying) return;
  const now = audio.actx.currentTime;
  const numGrains = Math.floor(randRange(2, 5));
  for (let i = 0; i < numGrains; i++) {
    const offset = i * randRange(0.04, 0.09);
    const grainDur = randRange(0.04, 0.1);
    const src = audio.actx.createBufferSource();
    src.buffer = noiseBuffer(audio.actx, 0.15);
    src.playbackRate.setValueAtTime(randRange(0.6, 1.8), now + offset);
    src.playbackRate.linearRampToValueAtTime(
      randRange(0.4, 2.2),
      now + offset + grainDur,
    );
    const filt = audio.actx.createBiquadFilter();
    filt.type = "bandpass";
    filt.frequency.setValueAtTime(randRange(800, 3000), now + offset);
    filt.frequency.exponentialRampToValueAtTime(
      randRange(400, 6000),
      now + offset + grainDur,
    );
    filt.Q.value = randRange(1.5, 4);
    const gainNode = audio.actx.createGain();
    gainNode.gain.setValueAtTime(0, now + offset);
    gainNode.gain.linearRampToValueAtTime(
      randRange(0.06, 0.14),
      now + offset + 0.005,
    );
    gainNode.gain.exponentialRampToValueAtTime(
      0.0001,
      now + offset + grainDur,
    );
    const p = audio.actx.createStereoPanner();
    p.pan.value = randRange(-0.4, 0.4);
    src.connect(filt);
    filt.connect(gainNode);
    gainNode.connect(p);
    p.connect(audio.trackGains.scratches);
    src.start(now + offset);
    src.stop(now + offset + grainDur + 0.02);
  }
  setTimeout(
    () => playVinylScratch(audio, store),
    randRange(8000, 24000),
  );
}

export function startScratches(
  audio: AudioRefs,
  store: Store<AppState>,
): void {
  setTimeout(
    () => playVinylScratch(audio, store),
    randRange(4000, 10000),
  );
}
