/**
 * Lookahead bar scheduler. 50ms setTimeout cadence, schedules any bar
 * whose start is within LOOKAHEAD_S of actx.currentTime.
 *
 * The 3-second lookahead is load-bearing: Safari throttles setTimeout
 * to ~1 Hz when the tab is hidden, but the Web Audio clock keeps
 * running. main.ts' visibility-change handler calls flushScheduler on
 * restore to refill the buffer.
 */

import { FORMS } from "../music/forms.ts";
import { MOOD_META } from "../music/moods.ts";
import { VOICINGS } from "../music/voicings.ts";
import { walkingBassNotes } from "../music/bass.ts";
import { compOct } from "../music/octaves.ts";
import { currentSectionProg, nextFormPosition } from "../music/playhead.ts";
import { generatePhrase, type Phrase, type PhraseStyle } from "../music/phrase.ts";
import {
  advanceImprovSection,
  type ImprovState,
  initImprovState,
} from "../music/improv-sequencer.ts";
import {
  GHOST_PAT,
  HAT_PAT,
  KICK_PAT_NORMAL,
  KICK_PAT_SOFT,
  OPEN_PAT,
  SNARE_PAT,
} from "../music/drum-patterns.ts";
import { beatDur, swungTime } from "./timing.ts";
import { playKick } from "./timbres/kick.ts";
import { playSnare } from "./timbres/snare.ts";
import { playHat } from "./timbres/hat.ts";
import { playBass, playComp, playMelody } from "./voices.ts";
import { applyMoodReverb } from "./graph.ts";
import { pickFrom, randInt, randRange } from "./rand.ts";
import type { AppState, AudioRefs, Chord, Form, Mood } from "../types.ts";
import type { Store } from "../store.ts";

const LOOKAHEAD_S = 3.0;
const TICK_MS = 50;

let currentForm: Form = [];
let formSectionIdx = 0;
let formBarInSection = 0;
let currentProgIdx = 0;
let currentPhrase: Phrase | null = null;
let phraseBarIdx = 0;
let currentKey = 0;
let currentBPM = 75;
let swingAmount = 0.08;
let nextBarTime = 0;
let timerHandle: number | null = null;
let improvState: ImprovState = initImprovState();
let improvBarInSection = 0;
let lastEmittedMidi: number | null = null;

const NOTES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

export function newProgression(
  audio: AudioRefs,
  mood: Mood,
  fresh = true,
): void {
  const meta = MOOD_META[mood];
  if (fresh) {
    currentKey = pickFrom(meta.key_pool);
    currentBPM = randInt(meta.bpmRange[0], meta.bpmRange[1]);
    swingAmount = randRange(meta.swingRange[0], meta.swingRange[1]);
    applyMoodReverb(audio, mood);
  }
  currentForm = FORMS[mood];
  formSectionIdx = 0;
  formBarInSection = 0;
  currentProgIdx = 0;
  currentPhrase = null;
  phraseBarIdx = 0;
  improvState = initImprovState();
  improvBarInSection = 0;
  lastEmittedMidi = null;

  const bpmSlider = document.getElementById("bpmSlider");
  if (bpmSlider instanceof HTMLInputElement) bpmSlider.value = String(currentBPM);

  const name = pickFrom(meta.names);
  const keyName = NOTES[currentKey];
  const el = document.getElementById("trackName");
  if (el) {
    el.classList.add("fade");
    setTimeout(() => {
      el.textContent = name;
      const sub = document.getElementById("trackSub");
      if (sub) sub.textContent = `${keyName} · ${currentBPM} bpm`;
      const bpmVal = document.getElementById("bpmVal");
      if (bpmVal) bpmVal.textContent = String(currentBPM);
      const keyVal = document.getElementById("keyVal");
      if (keyVal) keyVal.textContent = keyName;
      el.classList.remove("fade");
    }, 400);
  }
}

function advancePlayhead(): void {
  const { position, sectionChanged } = nextFormPosition(currentForm, {
    sectionIdx: formSectionIdx,
    barInSection: formBarInSection,
  });
  formSectionIdx = position.sectionIdx;
  formBarInSection = position.barInSection;
  if (sectionChanged) {
    currentPhrase = null;
    phraseBarIdx = 0;
  }
}

/**
 * Map a dynamicLevel into a PhraseStyle. Thresholds align with the
 * section PROFILES in improv-sequencer.ts: break sections (≤0.2) get
 * sparse phrases, buildup/peak (≥0.6) get dense, everything else
 * (normal/bridge) stays normal. Keep these thresholds in sync if
 * PROFILES change.
 */
function phraseStyleFromDyn(dyn: number): PhraseStyle {
  if (dyn < 0.25) return "sparse";
  if (dyn > 0.65) return "dense";
  return "normal";
}

export function resetImprovState(): void {
  improvState = initImprovState();
  improvBarInSection = 0;
  lastEmittedMidi = null;
  currentPhrase = null;
  phraseBarIdx = 0;
}

function scheduleBar(
  audio: AudioRefs,
  store: Store<AppState>,
  barStart: number,
): void {
  const state = store.get();
  const { currentMood: mood, complexity, isImprov } = state;
  const bd = beatDur(currentBPM);

  // In Improv mode `dynamicLevel` scales velocity (loudness) and
  // `effectiveComplexity` (= complexity * dynamicLevel) gates density
  // and probability — quieter sections get both quieter AND sparser.
  let prog: readonly [Chord, Chord, Chord, Chord];
  let nextProg: readonly [Chord, Chord, Chord, Chord];
  let effectiveComplexity = complexity;
  let dynamicLevel = 1.0;
  let phraseStyle: PhraseStyle = "normal";

  if (isImprov) {
    prog = improvState.prog;
    nextProg = improvState.prog; // bridge/normal both use same prog for the section
    dynamicLevel = improvState.dynamicLevel;
    effectiveComplexity = complexity * dynamicLevel;
    phraseStyle = phraseStyleFromDyn(dynamicLevel);
  } else {
    prog = currentSectionProg(currentForm, {
      sectionIdx: formSectionIdx,
      barInSection: formBarInSection,
    });
    nextProg = prog;
  }

  const progLen = prog.length;
  const barIdx = currentProgIdx % progLen;
  const [rootOffset, voicingName] = prog[barIdx];
  const nextBarIdx = (barIdx + 1) % progLen;
  const [nextRootOffset] = nextProg[nextBarIdx];

  const voicing = VOICINGS[voicingName];
  const rootMidi = 48 + ((currentKey + rootOffset) % 12);
  const nextRoot = 48 + ((currentKey + nextRootOffset) % 12);

  const isPad = MOOD_META[mood].compTimbre === "pad";
  const chordDur = bd * (isPad ? 3.8 : 1.75);

  voicing.forEach((interval, i) => {
    const midiNote = compOct(rootMidi + interval);
    const vel = (0.11 - i * 0.015) * dynamicLevel;
    const strum = i * 0.02;
    playComp(audio, midiNote, barStart + strum, chordDur, vel, "rhodesComp", mood, currentBPM);

    if (
      !isPad &&
      effectiveComplexity > 0.3 &&
      (i < voicing.length - 1 || Math.random() < effectiveComplexity * 0.7)
    ) {
      playComp(
        audio,
        midiNote,
        barStart + bd * 2 + strum * 0.5,
        chordDur * 0.85,
        vel * 0.6,
        "rhodesComp",
        mood,
        currentBPM,
      );
    }

    if (
      !isPad &&
      effectiveComplexity > 0.7 &&
      i >= voicing.length - 2 &&
      Math.random() < (effectiveComplexity - 0.5) * 1.2
    ) {
      playComp(
        audio,
        midiNote,
        barStart + bd * 1.5 + strum * 0.3,
        bd * 0.4,
        vel * 0.5,
        "rhodesComp",
        mood,
        currentBPM,
      );
    }
  });

  if (phraseBarIdx === 0 || currentPhrase === null) {
    currentPhrase = generatePhrase(prog, {
      currentKey,
      complexity: effectiveComplexity,
      beatDur: bd,
      phraseStyle: isImprov ? phraseStyle : undefined,
      seedNote: isImprov ? lastEmittedMidi ?? undefined : undefined,
    });
  }
  const barMelody = currentPhrase[phraseBarIdx % currentPhrase.length];
  for (const note of barMelody) {
    const noteTime = barStart + note.beat;
    if (noteTime >= barStart - 0.01) {
      playMelody(audio, note.midi, noteTime, note.dur, 0.17 * dynamicLevel, "rhodesMel", mood);
    }
  }
  if (barMelody.length > 0) {
    lastEmittedMidi = barMelody[barMelody.length - 1].midi;
  }
  const nextBarMelody = currentPhrase[(phraseBarIdx + 1) % currentPhrase.length];
  if (nextBarMelody && nextBarMelody[0] && nextBarMelody[0].anticipation) {
    playMelody(
      audio,
      nextBarMelody[0].midi,
      barStart + bd * 4 - bd * 0.25,
      nextBarMelody[0].dur,
      0.14 * dynamicLevel,
      "rhodesMel",
      mood,
    );
  }
  phraseBarIdx++;

  const bassNotes = walkingBassNotes(rootMidi, voicing, nextRoot);
  bassNotes.forEach((midiNote, i) => {
    const vel = (i === 0 ? 0.3 : 0.22) * dynamicLevel;
    if (mood === "sleepy" && i !== 0 && i !== 2) return;
    if (effectiveComplexity < 0.3 && i !== 0 && i !== 2) return;
    if (effectiveComplexity < 0.55 && i === 3) return;
    playBass(audio, midiNote, barStart + bd * i, bd * 0.88, vel, mood);
  });

  if (effectiveComplexity > 0.7 && Math.random() < (effectiveComplexity - 0.5) * 1.2) {
    const ghostMidi = bassNotes[0];
    playBass(audio, ghostMidi, barStart + bd * 3.5, bd * 0.3, 0.12 * dynamicLevel, mood);
  }

  const kickPat = mood === "sleepy" || mood === "late" ? KICK_PAT_SOFT : KICK_PAT_NORMAL;

  // Floor at 0.15 so kick/snare stay audible (as brushes) during
  // break sections where dynamicLevel can drop near zero.
  const drumScale = Math.max(0.15, dynamicLevel);

  for (let i = 0; i < 16; i++) {
    const stepTime = swungTime(i, barStart, currentBPM, swingAmount);

    if (kickPat[i]) playKick(audio, stepTime, mood, drumScale);

    if (SNARE_PAT[i]) playSnare(audio, stepTime, mood, false, drumScale);

    if (GHOST_PAT[i] && Math.random() < effectiveComplexity * 0.7) {
      playSnare(audio, stepTime, mood, true, drumScale);
    }

    if (HAT_PAT[i]) {
      const isQuarter = i % 4 === 0;
      if (isQuarter || effectiveComplexity > 0.35) {
        const vol = 0.05 + Math.random() * 0.025;
        playHat(
          audio,
          stepTime,
          mood,
          false,
          vol * (isQuarter ? 1.0 : 0.6 + effectiveComplexity * 0.4),
        );
      }
    }

    if (
      !HAT_PAT[i] &&
      effectiveComplexity > 0.75 &&
      Math.random() < (effectiveComplexity - 0.65) * 2
    ) {
      playHat(audio, stepTime, mood, false, 0.025 + Math.random() * 0.02);
    }

    if (OPEN_PAT[i] && mood !== "sleepy" && effectiveComplexity > 0.4) {
      playHat(audio, stepTime, mood, true, 0.06);
    }
  }
}

function tick(audio: AudioRefs, store: Store<AppState>): void {
  const barDur = beatDur(currentBPM) * 4;
  while (nextBarTime < audio.actx.currentTime + LOOKAHEAD_S) {
    scheduleBar(audio, store, nextBarTime);
    currentProgIdx++;
    if (store.get().isImprov) {
      improvBarInSection++;
      if (improvBarInSection >= improvState.barsRemaining) {
        improvState = advanceImprovSection(improvState, store.get().currentMood);
        improvBarInSection = 0;
        currentPhrase = null;
        phraseBarIdx = 0;
        lastEmittedMidi = null;
      }
    } else {
      advancePlayhead();
    }
    nextBarTime += barDur;
  }
  timerHandle = setTimeout(() => tick(audio, store), TICK_MS);
}

export function isSchedulerRunning(): boolean {
  return timerHandle != null;
}

export function startScheduler(audio: AudioRefs, store: Store<AppState>): void {
  if (timerHandle != null) return;
  newProgression(audio, store.get().currentMood, true);
  nextBarTime = audio.actx.currentTime + 0.1;
  tick(audio, store);
}

export function stopScheduler(): void {
  if (timerHandle != null) {
    clearTimeout(timerHandle);
    timerHandle = null;
  }
}

/**
 * After a hidden tab is restored, the scheduler may have missed ticks.
 * Clear the pending timer and immediately flush the lookahead. AudioContext
 * resume is the caller's responsibility.
 */
export function flushScheduler(audio: AudioRefs, store: Store<AppState>): void {
  if (timerHandle != null) {
    clearTimeout(timerHandle);
    timerHandle = null;
  }
  tick(audio, store);
}

/**
 * Re-anchor the lookahead cursor to "now". Called by mood-change after the
 * old in-flight audio has been severed from the master bus: the previous
 * `nextBarTime` is still parked at the tail of the old buffer (~3 s out),
 * so without this the first new-mood bar wouldn't play until after the
 * fade-in has finished.
 */
export function resetSchedulerTime(audio: AudioRefs): void {
  nextBarTime = audio.actx.currentTime + 0.1;
}

/** Update tempo; the next scheduled bar uses the new value. */
export function setCurrentBPM(bpm: number): void {
  currentBPM = bpm;
  const bpmVal = document.getElementById("bpmVal");
  if (bpmVal) bpmVal.textContent = String(currentBPM);
  const trackSub = document.getElementById("trackSub");
  if (trackSub) trackSub.textContent = `${NOTES[currentKey]} · ${currentBPM} bpm`;
}

/** Cycle through the 12 chromatic keys. Clears the phrase cache. */
export function cycleCurrentKey(): void {
  currentKey = (currentKey + 1) % 12;
  currentPhrase = null;
  phraseBarIdx = 0;
  const keyName = NOTES[currentKey];
  const keyVal = document.getElementById("keyVal");
  if (keyVal) keyVal.textContent = keyName;
  const trackSub = document.getElementById("trackSub");
  if (trackSub) trackSub.textContent = `${keyName} · ${currentBPM} bpm`;
}
