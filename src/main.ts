/**
 * Entry point for the bundled module artifact. Re-exports the data modules
 * and the pure music-logic helpers extracted across Phases 2 and 3.
 *
 * Phase 4 will wire `index.html` to import these directly so the inline
 * definitions can be removed.
 */
export { VOICINGS } from "./music/voicings.ts";
export { MOOD_META } from "./music/moods.ts";
export { FORMS } from "./music/forms.ts";
export { DEFAULT_SETTINGS } from "./music/settings.ts";

export { bassOct, melodyOct } from "./music/octaves.ts";
export { walkingBassNotes } from "./music/bass.ts";
export { currentSectionProg, DEFAULT_PROG, nextFormPosition } from "./music/playhead.ts";

export type {
  Ambience,
  Chord,
  Form,
  FormSection,
  Mood,
  MoodMeta,
  Settings,
  Timbre,
  VoicingName,
} from "./types.ts";
export type { FormPosition, StepResult } from "./music/playhead.ts";
