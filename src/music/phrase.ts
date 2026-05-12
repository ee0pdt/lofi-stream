import { melodyOct } from "./octaves.ts";
import { VOICINGS } from "./voicings.ts";
import type { Chord } from "../types.ts";

/**
 * A single note in a generated phrase bar. `beat` is the offset from the
 * start of the bar in seconds; may be slightly negative when the first note
 * has been pulled back as an anticipation. `dur` is in seconds.
 */
export interface PhraseNote {
  readonly beat: number;
  readonly midi: number;
  readonly dur: number;
  readonly anticipation?: boolean;
}

/** One bar of a phrase: an ordered list of notes (may be empty). */
export type Bar = readonly PhraseNote[];

/** A complete 4-bar phrase, one bar per chord in the source progression. */
export type Phrase = readonly [Bar, Bar, Bar, Bar];

/**
 * Options for `generatePhrase`. `rng` is injectable for tests; when omitted
 * `Math.random` is used so runtime behaviour stays byte-identical to the
 * inline original. `beatDur` is seconds per beat (i.e. `60 / bpm`).
 */
export interface GeneratePhraseOptions {
  readonly currentKey: number;
  readonly complexity: number;
  readonly beatDur: number;
  readonly rng?: () => number;
}

/**
 * Generate a 4-bar melodic phrase over a 4-chord progression.
 *
 * Pure: returns the phrase, does not mutate caller state. RNG is
 * injectable for tests; defaults to Math.random for byte-identical
 * runtime behaviour. rng() must be called in the same order as the
 * original inline code so the default-RNG distribution is preserved.
 */
export function generatePhrase(
  prog: readonly [Chord, Chord, Chord, Chord],
  opts: GeneratePhraseOptions,
): Phrase {
  const rng = opts.rng ?? Math.random;
  const { currentKey, complexity, beatDur } = opts;
  const bars: Bar[] = [];
  let lastNote: number | null = null;

  prog.forEach(([rootOffset, voicingName], barIdx) => {
    const voicing = VOICINGS[voicingName];
    const rootMidi = 48 + ((currentKey + rootOffset) % 12);
    const chordTones = voicing.map((iv) => melodyOct(rootMidi + iv));
    const barMelody: PhraseNote[] = [];
    const isCall = barIdx < 2;

    // Beat 1: anchor note — ALWAYS plays (this is the melodic skeleton)
    // But at very low complexity, skip on response bars
    const anchor = chordTones[isCall ? 1 : 0];
    if (complexity > 0.15 || isCall) {
      barMelody.push({ beat: 0, midi: anchor, dur: beatDur * 0.85 });
    }

    // Beat 1.5 or 2: inner voice — only adds at mid+ complexity
    if (rng() < 0.1 + complexity * 0.7) {
      const inner = chordTones[2] ?? chordTones[1];
      const time = beatDur * (isCall ? 1.5 : 1);
      barMelody.push({ beat: time, midi: inner, dur: beatDur * 0.7 });
    }

    // Beat 2.5 or 3: colour note (7th) — adds at mid complexity, dropped low
    if (complexity > 0.25) {
      const colorNote = chordTones[3] ?? chordTones[2];
      barMelody.push({
        beat: beatDur * (isCall ? 2.5 : 3),
        midi: colorNote,
        dur: beatDur * 1.1,
      });
    }

    // Beat 3.5 or 4 — extra passing note (only at high complexity)
    if (rng() < (complexity - 0.5) * 1.2) {
      const passing = chordTones[Math.floor(rng() * chordTones.length)];
      barMelody.push({
        beat: beatDur * (isCall ? 3.5 : 3.75),
        midi: passing,
        dur: beatDur * 0.5,
      });
    }

    // Anticipation pushback — more likely at higher complexity
    if (rng() < complexity * 0.6 && lastNote !== null && barMelody.length > 0) {
      const first = barMelody[0];
      barMelody[0] = { ...first, beat: -beatDur * 0.25, anticipation: true };
    }

    lastNote = barMelody.length > 0 ? barMelody[barMelody.length - 1].midi : null;
    bars.push(barMelody);
  });

  return bars as unknown as Phrase;
}
