/**
 * The four moods the app supports today.
 */
export type Mood = "rainy" | "late" | "cafe" | "sleepy";

/**
 * Comp/melody timbre choice — one of five pre-built instrument voices.
 */
export type Timbre = "rhodes" | "vibraphone" | "guitar" | "pad" | "celesta";

/**
 * Ambience layer choice per mood.
 */
export type Ambience = "rain" | "traffic" | "room" | "wind";

/**
 * Jazz chord-quality recipes used by FORMS. Each maps to an array of semitone
 * offsets from the chord root.
 */
export type VoicingName =
  | "min7"
  | "maj7"
  | "dom7"
  | "min7b5"
  | "maj6"
  | "min9"
  | "dom9"
  | "maj9";

/**
 * A single chord in a FORM: [rootOffsetSemitones, voicingName]. The root
 * offset is relative to the key chosen at newProgression() time.
 */
export type Chord = readonly [rootOffset: number, voicing: VoicingName];

/**
 * One section of a compositional form. Plays its 4-chord `prog` cycle for
 * `bars` bars, then advances to the next section.
 */
export interface FormSection {
  readonly bars: number;
  readonly prog: readonly [Chord, Chord, Chord, Chord];
}

/**
 * A full compositional form: ordered list of sections that loops once
 * exhausted.
 */
export type Form = readonly FormSection[];

/**
 * Per-mood timbral + harmonic configuration.
 */
export interface MoodMeta {
  readonly bpmRange: readonly [number, number];
  readonly swingRange: readonly [number, number];
  readonly names: readonly string[];
  readonly key_pool: readonly number[];
  readonly reverb: { readonly dur: number; readonly decay: number };
  readonly snareFreq: number;
  readonly snareQ: number;
  readonly bassFilter: number;
  readonly bassAttack: number;
  readonly compTimbre: Timbre;
  readonly melTimbre: Timbre;
  readonly ambience: Ambience;
}

/**
 * Per-mood mixer / parameter defaults. Each `Settings` corresponds to one
 * mood and is deep-cloned into the runtime `moodSettings` map at startup so
 * user adjustments are isolated per mood.
 */
export interface Settings {
  readonly drums: number;
  readonly bass: number;
  readonly comp: number;
  readonly melody: number;
  readonly hiss: number;
  readonly scratches: number;
  readonly hum: number;
  readonly warp: number;
  readonly ambience: number;
  readonly rain: number;
  readonly reverb: number;
  readonly complexity: number;
  readonly vol: number;
}
