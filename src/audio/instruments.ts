/**
 * Voicing/timbre synths, drum hits, and ambient sounds. Each `play*` function
 * builds a one-shot voice for a specific midi/time/duration. Long-lived noise
 * (tape hiss, vinyl scratches) is also managed here — all are
 * "things that schedule audio events".
 *
 * Comp/melody/bass voice dispatchers are in `./voices.ts`.
 */

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

export { playVinylScratch, startScratches, startTapeHiss } from "./ambience.ts";
