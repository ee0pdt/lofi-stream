/**
 * Improv-mode section sequencer. Pure: produces the next section given the
 * current state, mood, and an RNG. The audio scheduler decides when to call
 * advanceImprovSection (once per section boundary).
 */

import { FORMS } from "./forms.ts";
import { MOOD_META } from "./moods.ts";
import { DEFAULT_PROG } from "./playhead.ts";
import type { Chord, Mood } from "../types.ts";

export type SectionType = "normal" | "buildup" | "peak" | "break" | "bridge";

export interface ImprovState {
  readonly sectionType: SectionType;
  readonly dynamicLevel: number;
  readonly prog: readonly [Chord, Chord, Chord, Chord];
  readonly barsRemaining: number;
}

interface SectionProfile {
  readonly minDyn: number;
  readonly maxDyn: number;
  readonly minBars: number;
  readonly maxBars: number;
}

const PROFILES: Record<SectionType, SectionProfile> = {
  normal: { minDyn: 0.4, maxDyn: 0.6, minBars: 8, maxBars: 16 },
  buildup: { minDyn: 0.6, maxDyn: 0.8, minBars: 4, maxBars: 8 },
  peak: { minDyn: 0.8, maxDyn: 1.0, minBars: 4, maxBars: 8 },
  break: { minDyn: 0.0, maxDyn: 0.2, minBars: 2, maxBars: 4 },
  bridge: { minDyn: 0.3, maxDyn: 0.6, minBars: 4, maxBars: 8 },
};

/**
 * Cumulative-weight transition table. Each row is sampled by a uniform rng()
 * in [0, 1). Picking from sorted cumulative weights keeps the implementation
 * simple and deterministic given an RNG.
 */
const TRANSITIONS: Record<SectionType, ReadonlyArray<readonly [SectionType, number]>> = {
  normal: [["buildup", 0.30], ["break", 0.50], ["bridge", 0.70], ["normal", 1.00]],
  buildup: [["peak", 0.60], ["normal", 1.00]],
  peak: [["normal", 0.70], ["break", 1.00]],
  break: [["normal", 0.80], ["bridge", 1.00]],
  bridge: [["normal", 0.70], ["buildup", 1.00]],
};

function pickTransition(
  from: SectionType,
  rng: () => number,
): SectionType {
  const r = rng();
  for (const [type, threshold] of TRANSITIONS[from]) {
    if (r < threshold) return type;
  }
  return TRANSITIONS[from][TRANSITIONS[from].length - 1][0];
}

function pickProg(
  mood: Mood,
  sectionType: SectionType,
  rng: () => number,
): readonly [Chord, Chord, Chord, Chord] {
  if (sectionType === "bridge") return MOOD_META[mood].improv.bridgeSubstitutions;
  const form = FORMS[mood];
  const idx = Math.floor(rng() * form.length) % form.length;
  return form[idx].prog;
}

function randomInRange(min: number, max: number, rng: () => number): number {
  return min + rng() * (max - min);
}

function randomIntInRange(min: number, max: number, rng: () => number): number {
  return Math.floor(randomInRange(min, max + 1, rng));
}

export function initImprovState(): ImprovState {
  return {
    sectionType: "normal",
    dynamicLevel: 0.5,
    prog: DEFAULT_PROG,
    barsRemaining: 8,
  };
}

/**
 * Advance to the next section. Picks a new sectionType (never the same as
 * current), a fresh prog (FORMS or bridgeSubstitutions), and a fresh
 * dynamicLevel + bar length within the section's profile. dynamicLevel is
 * clamped to MOOD_META[mood].improv.peakDensityCap so quiet moods never
 * reach full peak loudness.
 */
export function advanceImprovSection(
  state: ImprovState,
  mood: Mood,
  rng: () => number = Math.random,
): ImprovState {
  let next: SectionType;
  do {
    next = pickTransition(state.sectionType, rng);
  } while (next === state.sectionType);

  const profile = PROFILES[next];
  const cap = MOOD_META[mood].improv.peakDensityCap;
  const dyn = Math.min(randomInRange(profile.minDyn, profile.maxDyn, rng), cap);
  const bars = randomIntInRange(profile.minBars, profile.maxBars, rng);
  const prog = pickProg(mood, next, rng);

  return {
    sectionType: next,
    dynamicLevel: dyn,
    prog,
    barsRemaining: bars,
  };
}
