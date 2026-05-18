/**
 * Voice lane state for improv mode. A lane is a single melodic voice that
 * can play either structured chord-tone phrases (following the base form) or
 * spontaneous improv runs. The primary lane is always active; a secondary
 * lane plays call-and-response fills and goes quiet when the primary is
 * soloing.
 */

import type { Chord, LaneDef } from "../types.ts";
import { generatePhrase, type Phrase, type PhraseStyle } from "./phrase.ts";

export type LaneMode = "structured" | "improv";

export interface LaneState {
  readonly def: LaneDef;
  readonly isSecondary: boolean;
  readonly phrase: Phrase | null;
  readonly phraseBarIdx: number;
  readonly mode: LaneMode;
  readonly barsInMode: number;
  readonly lastMidi: number | null;
}

export function initLaneState(def: LaneDef, isSecondary: boolean): LaneState {
  return {
    def,
    isSecondary,
    phrase: null,
    phraseBarIdx: 0,
    mode: "structured",
    barsInMode: 0,
    lastMidi: null,
  };
}

export interface LaneAdvanceOptions {
  readonly prog: readonly [Chord, Chord, Chord, Chord];
  readonly currentKey: number;
  readonly complexity: number;
  readonly beatDur: number;
  readonly melodyEnergy: number;
  readonly isImprov: boolean;
  readonly primaryMode: LaneMode; // for secondary: go quiet when primary solos
  readonly rng: () => number;
}

/**
 * Decide the mode for the next phrase and generate it. Called once per
 * phrase cycle (phraseBarIdx === 0). Returns updated lane state with a fresh
 * phrase and mode set.
 */
export function startNextPhrase(state: LaneState, opts: LaneAdvanceOptions): LaneState {
  let mode: LaneMode = "structured";

  if (opts.isImprov) {
    if (state.isSecondary) {
      // Secondary: only plays when primary is structured (call-and-response)
      mode = opts.primaryMode === "improv" ? "structured" : "structured";
      // Secondary never breaks out into improv itself — it just answers
    } else {
      // Primary: break out if energy exceeds threshold and RNG agrees
      const energyAboveThreshold = opts.melodyEnergy > state.def.breakoutThreshold;
      const rollBreakout = opts.rng() < 0.45;
      // Also allow settling back to structured after 2+ bars of improv
      const rollSettle = state.mode === "improv" && state.barsInMode >= 8 && opts.rng() < 0.5;
      if (rollSettle) {
        mode = "structured";
      } else if (state.mode === "improv" || (energyAboveThreshold && rollBreakout)) {
        mode = "improv";
      }
    }
  }

  const phraseStyle: PhraseStyle = mode === "improv" ? "dense" : "normal";
  // Secondary lane plays sparser fills in response position
  const style: PhraseStyle = state.isSecondary
    ? (opts.primaryMode === "structured" ? "normal" : "sparse")
    : phraseStyle;

  const phrase = generatePhrase(opts.prog, {
    currentKey: opts.currentKey,
    complexity: mode === "improv" ? Math.min(1, opts.complexity + 0.3) : opts.complexity,
    beatDur: opts.beatDur,
    phraseStyle: opts.isImprov ? style : undefined,
    seedNote: state.lastMidi ?? undefined,
  });

  return {
    ...state,
    phrase,
    phraseBarIdx: 0,
    mode,
    barsInMode: state.mode === mode ? state.barsInMode + 4 : 0,
  };
}

export function advanceLaneBar(state: LaneState): LaneState {
  return { ...state, phraseBarIdx: state.phraseBarIdx + 1 };
}

export function updateLaneMidi(state: LaneState, midi: number | null): LaneState {
  return { ...state, lastMidi: midi };
}
