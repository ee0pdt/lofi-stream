import { bassOct } from "./octaves.ts";

/**
 * Generate the 4-note walking-bass line for a single bar.
 *
 * Pattern:
 *   - beat 1: root in bass register
 *   - beat 2: third (voicing[1]) clamped to bass register
 *   - beat 3: fifth (voicing[2]) clamped to bass register
 *   - beat 4: chromatic approach (semitone above or below) to the next bar's root
 *
 * Mirrors `walkingBassNotes` in `index.html` (line 2268 at time of writing).
 */
export function walkingBassNotes(
  rootMidi: number,
  voicing: readonly number[],
  nextRootMidi: number,
): readonly number[] {
  const root = bassOct(rootMidi);
  const chordTones = voicing.map((iv) => bassOct(rootMidi + iv));
  const beat2 = chordTones[1] ?? chordTones[0];
  const beat3 = chordTones[2] ?? chordTones[1];
  const nextRoot = bassOct(nextRootMidi);
  const diff = nextRoot - beat3;
  const approach = diff > 0 ? nextRoot - 1 : nextRoot + 1;
  return [root, beat2, beat3, approach];
}
