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
    const chordTones = voicing.map((iv) => melodyOct(rootMidi + iv));
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
      // Dense bars: 48-slot grid (1 slot = 1/12 of a beat).
      // Enables both 16th-notes (every 3 slots, s % 3 === 0) and
      // 8th-note triplets (every 8 slots, s % 8 === 0).
      // Slot 0 always plays the anchor. Direction (ascending/descending)
      // is chosen per bar to create the feel of a deliberate run rather
      // than random splatter.
      const SLOTS = 48;
      const ascending = rng() < 0.5;
      const sortedTones = [...chordTones].sort((a, b) => ascending ? a - b : b - a);
      let arpIdx = 0;

      for (let slot = 0; slot < SLOTS; slot++) {
        const isAnchorSlot = slot === 0;

        if (!isAnchorSlot) {
          // Jazz-position-aware fill probability
          let fillProb: number;
          if (slot % 3 === 0) {
            fillProb = 0.55; // 16th-note positions
          } else if (slot % 8 === 0) {
            fillProb = 0.45; // 8th-note triplet positions
          } else {
            fillProb = 0.20; // off-grid slots
          }
          if (rng() > fillProb) continue;
        }

        let midi: number;
        if (isAnchorSlot) {
          midi = anchor;
        } else if (rng() < 0.15) {
          // Chromatic passing note — clamped to melody register
          const t = chordTones[Math.floor(rng() * chordTones.length)];
          midi = Math.max(60, Math.min(91, t + (rng() < 0.5 ? 1 : -1)));
        } else if (rng() < 0.55) {
          // Directed arpeggio — step through sorted chord tones
          midi = sortedTones[arpIdx % sortedTones.length];
          arpIdx++;
        } else {
          midi = chordTones[Math.floor(rng() * chordTones.length)];
        }

        barMelody.push({
          beat: (beatDur * slot) / 12, // 12 slots = 1 beat
          midi,
          dur: beatDur * 0.25,
        });
      }

      // Chromatic approach into the anchor — pre-bar grace note.
      // Tagged anticipation:true so the scheduler's previous-bar
      // lookahead actually plays it.
      barMelody.unshift({
        beat: -beatDur * 0.2,
        midi: Math.max(60, anchor - 1),
        dur: beatDur * 0.18,
        anticipation: true,
      });
    } else {
      // normal style: anchor + color notes. Occasionally inserts a short
      // 8th-note triplet run (3 notes at triplet spacing) for jazz feel.
      if (complexity > 0.15 || isCall) {
        barMelody.push({ beat: 0, midi: anchor, dur: beatDur * 0.85 });
      }

      // 20% chance of a triplet run on beats 1-2 (slots 0, 8, 16 of bar)
      if (rng() < 0.20) {
        const tripletSpacing = (beatDur * 8) / 12; // 8th-note triplet interval
        for (let t = 0; t < 3; t++) {
          const tripletMidi = chordTones[t % chordTones.length];
          barMelody.push({
            beat: tripletSpacing * t,
            midi: tripletMidi,
            dur: beatDur * 0.35,
          });
        }
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
