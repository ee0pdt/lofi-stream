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

export { generatePhrase } from "./music/phrase.ts";
export type { Bar, GeneratePhraseOptions, Phrase, PhraseNote } from "./music/phrase.ts";

export {
  GHOST_PAT,
  HAT_PAT,
  KICK_PAT_NORMAL,
  KICK_PAT_SOFT,
  OPEN_PAT,
  SNARE_PAT,
} from "./music/drum-patterns.ts";

export { createStore } from "./store.ts";
export type { Store } from "./store.ts";
export { initialAppState } from "./state-init.ts";

export {
  applyMoodReverb,
  applySettingToAudio,
  applyWarp,
  buildIR,
  initAudio,
  makeHaasSpatial,
  makeSpatial,
  noiseBuffer,
  SPATIAL,
  wireMixerCascade,
  wireMoodCascade,
} from "./audio/graph.ts";
export type { SpatialConfig, SpatialPair } from "./audio/graph.ts";

export { buildRainLayers, startAmbience, stopAmbience } from "./audio/ambience.ts";

export {
  beatDur,
  flashRow,
  midiToFreq,
  playBass,
  playCelesta,
  playComp,
  playGuitar,
  playHat,
  playKick,
  playMelody,
  playPad,
  playRhodes,
  playSnare,
  playVibraphone,
  playVinylScratch,
  startScratches,
  startTapeHiss,
  swungTime,
} from "./audio/instruments.ts";

export type {
  Ambience,
  AppState,
  AudioRefs,
  Chord,
  Form,
  FormSection,
  Mood,
  MoodMeta,
  MoodSettings,
  Settings,
  Timbre,
  VoicingName,
} from "./types.ts";
export type { FormPosition, StepResult } from "./music/playhead.ts";
