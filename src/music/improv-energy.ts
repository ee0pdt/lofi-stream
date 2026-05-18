/**
 * Continuous per-voice energy drift for improv mode.
 * Replaces the discrete section-type state machine with a random walk.
 * Each voice drifts independently; a soft trading pressure means high
 * melody energy nudges comp/bass/drums down (and vice versa).
 */

import { FORMS } from "./forms.ts";
import { MOOD_META } from "./moods.ts";
import type { Chord, Mood } from "../types.ts";

export interface VoiceEnergies {
  readonly melody: number; // 0-1
  readonly comp: number; // 0-1
  readonly bass: number; // 0-1
  readonly drums: number; // 0-1
}

export interface EnergyState {
  readonly energies: VoiceEnergies;
  readonly prog: readonly [Chord, Chord, Chord, Chord];
  readonly progBarAge: number; // bars since last prog change
}

const ENERGY_FLOOR = 0.1;
const DRIFT_STEP = 0.18;
const TRADE_LEAD_NUDGE = 0.04;
const TRADE_OTHER_NUDGE = -0.02;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function pickProg(
  mood: Mood,
  rng: () => number,
): readonly [Chord, Chord, Chord, Chord] {
  const form = FORMS[mood];
  const idx = Math.floor(rng() * form.length) % form.length;
  return form[idx].prog;
}

export function initEnergyState(mood: Mood, rng: () => number = Math.random): EnergyState {
  const cap = MOOD_META[mood].improv.peakDensityCap;
  const rand = () => clamp(0.3 + rng() * 0.5, ENERGY_FLOOR, cap);
  return {
    energies: { melody: rand(), comp: rand(), bass: rand(), drums: rand() },
    prog: FORMS[mood][0].prog,
    progBarAge: 0,
  };
}

/**
 * Advance energy state by one bar.
 *
 * - Each voice drifts by a small random nudge.
 * - Trading pressure: the lead voice gets +0.04, others get -0.02.
 * - All energies are capped to MOOD_META[mood].improv.peakDensityCap and
 *   floored at ENERGY_FLOOR (0.1) so music never goes fully silent.
 * - Prog changes every 8-16 bars (determined by rng).
 */
export function stepEnergyState(
  state: EnergyState,
  mood: Mood,
  rng: () => number,
): EnergyState {
  const cap = MOOD_META[mood].improv.peakDensityCap;

  // Random drift
  const drifted: VoiceEnergies = {
    melody: state.energies.melody + (rng() - 0.5) * DRIFT_STEP,
    comp: state.energies.comp + (rng() - 0.5) * DRIFT_STEP,
    bass: state.energies.bass + (rng() - 0.5) * DRIFT_STEP,
    drums: state.energies.drums + (rng() - 0.5) * DRIFT_STEP,
  };

  // Trading pressure: find lead voice
  const voices = ["melody", "comp", "bass", "drums"] as const;
  let leadVoice: (typeof voices)[number] = "melody";
  let leadVal = drifted.melody;
  for (const v of voices) {
    if (drifted[v] > leadVal) {
      leadVal = drifted[v];
      leadVoice = v;
    }
  }

  const traded = { ...drifted } as Record<string, number>;
  for (const v of voices) {
    traded[v] = drifted[v] + (v === leadVoice ? TRADE_LEAD_NUDGE : TRADE_OTHER_NUDGE);
  }

  // Clamp to [ENERGY_FLOOR, cap]
  const energies: VoiceEnergies = {
    melody: clamp(traded["melody"], ENERGY_FLOOR, cap),
    comp: clamp(traded["comp"], ENERGY_FLOOR, cap),
    bass: clamp(traded["bass"], ENERGY_FLOOR, cap),
    drums: clamp(traded["drums"], ENERGY_FLOOR, cap),
  };

  // Prog age + possible change
  const newAge = state.progBarAge + 1;
  const threshold = 8 + Math.floor(rng() * 8);
  if (newAge >= threshold) {
    return { energies, prog: pickProg(mood, rng), progBarAge: 0 };
  }

  return { energies, prog: state.prog, progBarAge: newAge };
}
