import type { VoicingName } from "../types.ts";

/**
 * Jazz chord-quality recipes — each maps to an array of semitone offsets
 * from the chord root. Values must match the inline `VOICINGS` definition
 * in `index.html` until the inline script is removed in a later phase.
 */
export const VOICINGS: Record<VoicingName, readonly number[]> = {
  min7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  dom7: [0, 4, 7, 10],
  min7b5: [0, 3, 6, 10],
  maj6: [0, 4, 7, 9],
  min9: [0, 3, 7, 10, 14],
  dom9: [0, 4, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
} as const;
