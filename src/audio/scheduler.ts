/**
 * Lookahead bar scheduler. Runs on a 50ms setTimeout cadence, schedules
 * any bar whose start is within `LOOKAHEAD_S` seconds of `actx.currentTime`.
 *
 * The 3-second lookahead is deliberate: Safari throttles setTimeout to
 * ~1 Hz when the tab is hidden, but the Web Audio clock keeps running.
 * As long as enough bars are pre-scheduled before the tab is hidden,
 * playback stays glitch-free until restore — at which point a
 * visibility-change handler flushes the scheduler.
 *
 * Form playhead, phrase cache, bpm/swing/key, and the next-bar time
 * all live as module-scope state. Mood changes call
 * `resetSchedulerStateForMoodChange` to roll a fresh progression.
 */

import { FORMS } from "../music/forms.ts";
import { MOOD_META } from "../music/moods.ts";
import { VOICINGS } from "../music/voicings.ts";
import { walkingBassNotes } from "../music/bass.ts";
import { currentSectionProg, nextFormPosition } from "../music/playhead.ts";
import { generatePhrase, type Phrase } from "../music/phrase.ts";
import {
  GHOST_PAT,
  HAT_PAT,
  KICK_PAT_NORMAL,
  KICK_PAT_SOFT,
  OPEN_PAT,
  SNARE_PAT,
} from "../music/drum-patterns.ts";
import {
  beatDur,
  playBass,
  playComp,
  playHat,
  playKick,
  playMelody,
  playSnare,
  swungTime,
} from "./instruments.ts";
import { applyMoodReverb } from "./graph.ts";
import type { AppState, AudioRefs, Form, Mood } from "../types.ts";
import type { Store } from "../store.ts";

const LOOKAHEAD_S = 3.0;
const TICK_MS = 50;

let currentForm: Form = [];
let formSectionIdx = 0;
let formBarInSection = 0;
let formBarInProg = 0;
let currentProgIdx = 0;
let currentPhrase: Phrase | null = null;
let phraseBarIdx = 0;
let currentKey = 0;
let currentBPM = 75;
let swingAmount = 0.08;
let nextBarTime = 0;
let timerHandle: number | null = null;

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

function randInt(a: number, b: number): number {
  return a + Math.floor(Math.random() * (b - a + 1));
}

function pickFrom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Roll a new progression for `mood`. With `fresh = true` picks a new key
 * and BPM from the mood's pools and rebuilds the reverb IR. With
 * `fresh = false` just restarts the form playhead at the start of the
 * existing key/BPM (used when ramping bpm without a mood swap, etc.).
 *
 * Side-effects on the DOM (track name/bpm/key labels) happen here as a
 * tight visual response to the mood swap; commit E will move that to
 * the UI module.
 */
export function newProgression(
  audio: AudioRefs,
  mood: Mood,
  fresh = true,
): void {
  const meta = MOOD_META[mood];
  if (fresh) {
    currentKey = pickFrom(meta.key_pool);
    currentBPM = randInt(meta.bpmRange[0], meta.bpmRange[1]);
    swingAmount = meta.swingRange[0] +
      Math.random() * (meta.swingRange[1] - meta.swingRange[0]);
    applyMoodReverb(audio, mood);
  }
  currentForm = FORMS[mood];
  formSectionIdx = 0;
  formBarInSection = 0;
  formBarInProg = 0;
  currentProgIdx = 0;
  currentPhrase = null;
  phraseBarIdx = 0;

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

/**
 * Called by the mood cascade. Resets scheduler-internal state and rolls
 * a new progression so the next scheduled bar reflects the new mood.
 */
export function resetSchedulerStateForMoodChange(
  audio: AudioRefs,
  mood: Mood,
): void {
  newProgression(audio, mood, true);
}

function advancePlayhead(): void {
  formBarInProg++;
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

function compOct(m: number): number {
  let n = m;
  while (n > 71) n -= 12;
  while (n < 48) n += 12;
  return n;
}

function scheduleBar(
  audio: AudioRefs,
  store: Store<AppState>,
  barStart: number,
): void {
  const mood = store.get().currentMood;
  const complexity = store.get().complexity;
  const bd = beatDur(currentBPM);

  const prog = currentSectionProg(currentForm, {
    sectionIdx: formSectionIdx,
    barInSection: formBarInSection,
  });
  const progLen = prog.length;
  const barIdx = currentProgIdx % progLen;
  const [rootOffset, voicingName] = prog[barIdx];
  const nextBarIdx = (barIdx + 1) % progLen;
  const [nextRootOffset] = prog[nextBarIdx];

  const voicing = VOICINGS[voicingName];
  const rootMidi = 48 + ((currentKey + rootOffset) % 12);
  const nextRoot = 48 + ((currentKey + nextRootOffset) % 12);

  const isPad = MOOD_META[mood].compTimbre === "pad";
  const chordDur = bd * (isPad ? 3.8 : 1.75);

  voicing.forEach((interval, i) => {
    const m = compOct(rootMidi + interval);
    const vel = 0.11 - i * 0.015;
    const strum = i * 0.02;
    playComp(audio, m, barStart + strum, chordDur, vel, "rhodesComp", mood, currentBPM);

    if (
      !isPad &&
      complexity > 0.3 &&
      (i < voicing.length - 1 || Math.random() < complexity * 0.7)
    ) {
      playComp(
        audio,
        m,
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
      complexity > 0.7 &&
      i >= voicing.length - 2 &&
      Math.random() < (complexity - 0.5) * 1.2
    ) {
      playComp(
        audio,
        m,
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
      complexity,
      beatDur: bd,
    });
  }
  const barMelody = currentPhrase[phraseBarIdx % currentPhrase.length];
  for (const note of barMelody) {
    const t = barStart + note.beat;
    if (t >= barStart - 0.01) {
      playMelody(audio, note.midi, t, note.dur, 0.17, "rhodesMel", mood);
    }
  }
  const nextBarMelody = currentPhrase[(phraseBarIdx + 1) % currentPhrase.length];
  if (nextBarMelody && nextBarMelody[0] && nextBarMelody[0].anticipation) {
    playMelody(
      audio,
      nextBarMelody[0].midi,
      barStart + bd * 4 - bd * 0.25,
      nextBarMelody[0].dur,
      0.14,
      "rhodesMel",
      mood,
    );
  }
  phraseBarIdx++;

  const bassNotes = walkingBassNotes(rootMidi, voicing, nextRoot);
  bassNotes.forEach((m, i) => {
    const vel = i === 0 ? 0.3 : 0.22;
    if (mood === "sleepy" && i !== 0 && i !== 2) return;
    if (complexity < 0.3 && i !== 0 && i !== 2) return;
    if (complexity < 0.55 && i === 3) return;
    playBass(audio, m, barStart + bd * i, bd * 0.88, vel, mood);
  });

  if (complexity > 0.7 && Math.random() < (complexity - 0.5) * 1.2) {
    const ghostMidi = bassNotes[0];
    playBass(audio, ghostMidi, barStart + bd * 3.5, bd * 0.3, 0.12, mood);
  }

  const kickPat = mood === "sleepy" || mood === "late" ? KICK_PAT_SOFT : KICK_PAT_NORMAL;

  for (let i = 0; i < 16; i++) {
    const t = swungTime(i, barStart, currentBPM, swingAmount);

    if (kickPat[i]) playKick(audio, t, mood);

    if (SNARE_PAT[i]) playSnare(audio, t, mood, false);

    if (GHOST_PAT[i] && Math.random() < complexity * 0.7) {
      playSnare(audio, t, mood, true);
    }

    if (HAT_PAT[i]) {
      const isQuarter = i % 4 === 0;
      if (isQuarter || complexity > 0.35) {
        const vol = 0.05 + Math.random() * 0.025;
        playHat(audio, t, mood, false, vol * (isQuarter ? 1.0 : 0.6 + complexity * 0.4));
      }
    }

    if (
      !HAT_PAT[i] &&
      complexity > 0.75 &&
      Math.random() < (complexity - 0.65) * 2
    ) {
      playHat(audio, t, mood, false, 0.025 + Math.random() * 0.02);
    }

    if (OPEN_PAT[i] && mood !== "sleepy" && complexity > 0.4) {
      playHat(audio, t, mood, true, 0.06);
    }
  }
}

function tick(audio: AudioRefs, store: Store<AppState>): void {
  const barDur = beatDur(currentBPM) * 4;
  while (nextBarTime < audio.actx.currentTime + LOOKAHEAD_S) {
    scheduleBar(audio, store, nextBarTime);
    currentProgIdx++;
    advancePlayhead();
    nextBarTime += barDur;
  }
  timerHandle = setTimeout(() => tick(audio, store), TICK_MS);
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
 * After a hidden tab is restored, the scheduler may have missed several
 * 50ms ticks. Call this to clear the pending timer and immediately flush
 * the lookahead. Audio context resume is the caller's responsibility.
 */
export function flushScheduler(audio: AudioRefs, store: Store<AppState>): void {
  if (timerHandle != null) {
    clearTimeout(timerHandle);
    timerHandle = null;
  }
  tick(audio, store);
}

/** Read-only access for inline code that still needs current bpm/key. */
export function getCurrentBPM(): number {
  return currentBPM;
}
export function getCurrentKey(): number {
  return currentKey;
}

/**
 * BPM slider write-through. Updates the scheduler's tempo, the bpm
 * readout, and the track sub-text. Does NOT clear the phrase — tempo
 * change keeps the melodic ideas in flight.
 */
export function setCurrentBPM(bpm: number): void {
  currentBPM = bpm;
  const bpmVal = document.getElementById("bpmVal");
  if (bpmVal) bpmVal.textContent = String(currentBPM);
  const trackSub = document.getElementById("trackSub");
  if (trackSub) trackSub.textContent = `${NOTES[currentKey]} · ${currentBPM} bpm`;
}

/**
 * Key-chip click handler. Cycles through the 12 chromatic keys, clears
 * the phrase cache so the next bar uses the new key, and updates the
 * key readout + track sub-text.
 */
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
