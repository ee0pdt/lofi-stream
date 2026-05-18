/**
 * Two-voice improv model. Each `VoiceState` is one melodic voice with a
 * lead/support role. The scheduler holds two instances; the role bit is
 * the trading mechanism — phrase boundaries roll an RNG and may swap.
 *
 * Lead: generates structured phrases over the form chord. Can enter an
 *   `improv` mode (dense run) when melody energy crosses
 *   `breakoutThreshold` and an RNG roll succeeds.
 * Support: always `structured`, always `sparse`-styled. Phrase is seeded
 *   with the LEAD's last note (not its own) so the support's contour
 *   echoes the lead.
 */

import type { Chord, Timbre } from "../types.ts";
import { generatePhrase, type Phrase, type PhraseStyle } from "./phrase.ts";

export type VoiceRole = "lead" | "support";
export type VoiceMode = "structured" | "improv";

export interface VoiceState {
  readonly id: 1 | 2;
  readonly timbre: Timbre;
  readonly role: VoiceRole;
  readonly phrase: Phrase | null;
  readonly phraseBarIdx: number;
  readonly mode: VoiceMode;
  readonly barsInMode: number;
  readonly lastMidi: number | null;
}

export function initVoice(id: 1 | 2, timbre: Timbre, role: VoiceRole): VoiceState {
  return {
    id,
    timbre,
    role,
    phrase: null,
    phraseBarIdx: 0,
    mode: "structured",
    barsInMode: 0,
    lastMidi: null,
  };
}

export interface VoiceAdvanceOptions {
  readonly formProg: readonly [Chord, Chord, Chord, Chord];
  readonly currentKey: number;
  readonly complexity: number;
  readonly beatDur: number;
  readonly melodyEnergy: number;
  readonly breakoutThreshold: number;
  /** Lead's last MIDI note. Used to seed the support's next phrase. */
  readonly leadLastMidi: number | null;
  readonly rng: () => number;
}

/**
 * Decide the mode for the next phrase and generate it. Called once per
 * phrase cycle (phraseBarIdx === 0). Returns updated voice state with a
 * fresh phrase and mode set.
 */
export function startNextPhrase(state: VoiceState, opts: VoiceAdvanceOptions): VoiceState {
  let mode: VoiceMode = "structured";

  if (state.role === "lead") {
    const energyOver = opts.melodyEnergy > opts.breakoutThreshold;
    const rollBreakout = opts.rng() < 0.45;
    const rollSettle = state.mode === "improv" && state.barsInMode >= 8 && opts.rng() < 0.5;
    if (rollSettle) {
      mode = "structured";
    } else if (state.mode === "improv" || (energyOver && rollBreakout)) {
      mode = "improv";
    }
  }

  const phraseStyle: PhraseStyle = state.role === "support"
    ? "sparse"
    : mode === "improv"
    ? "dense"
    : "normal";

  // Support seeds from the LEAD's last note; lead self-seeds.
  const seedNote = state.role === "support"
    ? (opts.leadLastMidi ?? state.lastMidi ?? undefined)
    : (state.lastMidi ?? undefined);

  const phrase = generatePhrase(opts.formProg, {
    currentKey: opts.currentKey,
    complexity: mode === "improv" ? Math.min(1, opts.complexity + 0.3) : opts.complexity,
    beatDur: opts.beatDur,
    phraseStyle,
    seedNote,
  });

  return {
    ...state,
    phrase,
    phraseBarIdx: 0,
    mode,
    barsInMode: state.mode === mode ? state.barsInMode + 4 : 0,
  };
}

export function advanceVoiceBar(state: VoiceState): VoiceState {
  return { ...state, phraseBarIdx: state.phraseBarIdx + 1 };
}

export function updateVoiceMidi(state: VoiceState, midi: number | null): VoiceState {
  return { ...state, lastMidi: midi };
}

/**
 * Swap the roles of two voices. Resets `mode` to `structured` and
 * `barsInMode` to 0 on both — the new lead starts a fresh structured
 * phrase, the new support drops any in-flight improv.
 */
export function swapRoles(
  a: VoiceState,
  b: VoiceState,
): readonly [VoiceState, VoiceState] {
  const reset = (v: VoiceState, nextRole: VoiceRole): VoiceState => ({
    ...v,
    role: nextRole,
    mode: "structured",
    barsInMode: 0,
  });
  return [reset(a, b.role), reset(b, a.role)];
}
