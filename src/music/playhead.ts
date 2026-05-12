import type { Chord, Form } from "../types.ts";

/**
 * Position within a `Form`: which section we're in, and how many bars into
 * that section we've already played.
 */
export interface FormPosition {
  readonly sectionIdx: number;
  readonly barInSection: number;
}

/**
 * Result of advancing the playhead by one bar.
 *
 * `sectionChanged` is true when the step crossed a section boundary —
 * callers use this to clear cached phrase melodies for variety.
 */
export interface StepResult {
  readonly position: FormPosition;
  readonly sectionChanged: boolean;
}

/**
 * The fallback 4-chord cycle used when the form is empty. Mirrors the
 * fallback inside `currentSectionProg()` in `index.html`.
 */
export const DEFAULT_PROG: readonly [Chord, Chord, Chord, Chord] = [
  [0, "min7"],
  [5, "min7"],
  [8, "maj7"],
  [3, "min7"],
];

/**
 * Pure version of `advanceFormPlayhead` from `index.html`. Given a form and
 * the current playhead position, returns the next position plus a flag
 * indicating whether we crossed into a new section.
 *
 * Empty forms behave as if every section had 1 bar — `sectionIdx` simply
 * cycles through 0 modulo the (non-existent) length. Callers should avoid
 * stepping an empty form; this is a defensive fallback only.
 */
export function nextFormPosition(form: Form, position: FormPosition): StepResult {
  if (form.length === 0) {
    return {
      position: { sectionIdx: 0, barInSection: 0 },
      sectionChanged: false,
    };
  }
  const section = form[position.sectionIdx % form.length];
  const newBarInSection = position.barInSection + 1;
  if (newBarInSection >= section.bars) {
    return {
      position: {
        sectionIdx: (position.sectionIdx + 1) % form.length,
        barInSection: 0,
      },
      sectionChanged: true,
    };
  }
  return {
    position: {
      sectionIdx: position.sectionIdx,
      barInSection: newBarInSection,
    },
    sectionChanged: false,
  };
}

/**
 * Pure version of `currentSectionProg` from `index.html`. Returns the active
 * 4-chord prog given a form and a position. Falls back to `DEFAULT_PROG`
 * when the form is empty.
 */
export function currentSectionProg(
  form: Form,
  position: FormPosition,
): readonly [Chord, Chord, Chord, Chord] {
  if (form.length === 0) return DEFAULT_PROG;
  return form[position.sectionIdx % form.length].prog;
}
