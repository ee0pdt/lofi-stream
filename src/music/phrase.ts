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

/** A complete phrase: one bar per chord in the source progression (length 4). */
export type Phrase = readonly Bar[];

export type PhraseStyle = "sparse" | "normal" | "dense";

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
  readonly phraseStyle?: PhraseStyle;
  readonly seedNote?: number;
}

/**
 * Pick the chord tone closest in pitch to `seedNote`. Falls back to the
 * default anchor when seedNote is undefined.
 */
function pickAnchor(
  chordTones: readonly number[],
  defaultIdx: number,
  seedNote: number | undefined,
): number {
  if (seedNote === undefined) return chordTones[defaultIdx];
  let best = chordTones[0];
  let bestDist = Math.abs(best - seedNote);
  for (const t of chordTones) {
    const d = Math.abs(t - seedNote);
    if (d < bestDist) {
      best = t;
      bestDist = d;
    }
  }
  return best;
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
  const style: PhraseStyle = opts.phraseStyle ?? "normal";
  const bars: Bar[] = [];
  let lastNote: number | null = null;

  prog.forEach(([rootOffset, voicingName], barIdx) => {
    const voicing = VOICINGS[voicingName];
    const rootMidi = 48 + ((currentKey + rootOffset) % 12);
    // Dense style lifts the melody up an octave so peak/buildup sections
    // sit audibly above normal sections in register.
    const octaveLift = style === "dense" ? 12 : 0;
    const chordTones = voicing.map((iv) => melodyOct(rootMidi + iv) + octaveLift);
    const barMelody: PhraseNote[] = [];
    const isCall = barIdx < 2;

    // Beat 1: anchor. For bar 0, use seedNote (if provided) to pick the
    // nearest chord tone — gives cross-phrase conversational continuity.
    const defaultAnchorIdx = isCall ? 1 : 0;
    const anchor = barIdx === 0
      ? pickAnchor(chordTones, defaultAnchorIdx, opts.seedNote)
      : chordTones[defaultAnchorIdx];

    if (style === "sparse") {
      // sparse: at most 2 notes per bar, no passing notes, no anticipation
      if (isCall || complexity > 0.3) {
        barMelody.push({ beat: 0, midi: anchor, dur: beatDur * 2.5 });
      }
      // Maybe one tail note on beat 3.
      // 2.5 = anchor duration in beats (covers beats 1-3, leaving a rest
      // before the optional tail). 0.3 = ~30% probability — gives sparse
      // bars a small breath of motion without filling them in.
      if (rng() < 0.3) {
        const tail = chordTones[2] ?? chordTones[0];
        barMelody.push({ beat: beatDur * 3, midi: tail, dur: beatDur * 1.0 });
      }
    } else if (style === "dense") {
      // Dense bars are a running 8th-note line: 8 slots, each filled with
      // ~80% probability. Notes are chord tones with the occasional
      // chromatic neighbor as a passing note. This generates a true
      // "solo line" feel rather than just sprinkling extra notes onto a
      // sparse anchor pattern.
      const ANCHOR_SLOT = 0; // beat 1 always plays the anchor
      const slots = 8; // 8th-note grid
      for (let slot = 0; slot < slots; slot++) {
        const fillChance = slot === ANCHOR_SLOT ? 1.0 : 0.8;
        if (rng() >= fillChance) continue;
        let midi: number;
        if (slot === ANCHOR_SLOT) {
          midi = anchor;
        } else if (rng() < 0.2) {
          // Chromatic neighbor (semitone above or below a random chord tone)
          const t = chordTones[Math.floor(rng() * chordTones.length)];
          midi = t + (rng() < 0.5 ? 1 : -1);
        } else {
          midi = chordTones[Math.floor(rng() * chordTones.length)];
        }
        barMelody.push({
          beat: (beatDur * slot) / 2,
          midi,
          dur: beatDur * 0.42,
        });
      }
      // Chromatic approach into the anchor — pre-bar grace note.
      // Tagged anticipation:true so the scheduler's previous-bar
      // lookahead actually plays it.
      barMelody.unshift({
        beat: -beatDur * 0.2,
        midi: anchor - 1,
        dur: beatDur * 0.18,
        anticipation: true,
      });
    } else {
      // normal + dense share the existing core; dense layers extra notes.
      if (complexity > 0.15 || isCall) {
        barMelody.push({ beat: 0, midi: anchor, dur: beatDur * 0.85 });
      }

      if (rng() < 0.1 + complexity * 0.7) {
        const inner = chordTones[2] ?? chordTones[1];
        const time = beatDur * (isCall ? 1.5 : 1);
        barMelody.push({ beat: time, midi: inner, dur: beatDur * 0.7 });
      }

      if (complexity > 0.25) {
        const colorNote = chordTones[3] ?? chordTones[2];
        barMelody.push({
          beat: beatDur * (isCall ? 2.5 : 3),
          midi: colorNote,
          dur: beatDur * 1.1,
        });
      }

      if (rng() < (complexity - 0.5) * 1.2) {
        const passing = chordTones[Math.floor(rng() * chordTones.length)];
        barMelody.push({
          beat: beatDur * (isCall ? 3.5 : 3.75),
          midi: passing,
          dur: beatDur * 0.5,
        });
      }

      // Anticipation pushback
      if (rng() < complexity * 0.6 && lastNote !== null && barMelody.length > 0) {
        const first = barMelody[0];
        if (first.beat >= 0) {
          barMelody[0] = { ...first, beat: -beatDur * 0.25, anticipation: true };
        }
      }
    }

    lastNote = barMelody.length > 0 ? barMelody[barMelody.length - 1].midi : null;
    bars.push(barMelody);
  });

  return bars;
}
