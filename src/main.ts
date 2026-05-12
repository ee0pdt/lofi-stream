/**
 * Entry point for the bundled module artifact. Phase 2 just re-exports the
 * data modules so the build pipeline has something to bundle and downstream
 * phases can import a single module surface.
 *
 * Phase 3+ will expose these on `window` so the inline script in index.html
 * can read them, removing the duplicate inline definitions.
 */
export { VOICINGS } from "./music/voicings.ts";
export { MOOD_META } from "./music/moods.ts";
export { FORMS } from "./music/forms.ts";
export { DEFAULT_SETTINGS } from "./music/settings.ts";
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
