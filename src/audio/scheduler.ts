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
import type { PhraseStyle } from "../music/phrase.ts";
import { type EnergyState, initEnergyState, stepEnergyState } from "../music/improv-energy.ts";
import {
  advanceVoiceBar,
  initVoice,
  startNextPhrase,
  swapRoles,
  updateVoiceMidi,
  type VoiceState,
} from "../music/voice.ts";
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
import { playBass, playComp, playMelodyTimbre } from "./voices.ts";
import { recordNote } from "../visual/piano-roll.ts";
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
let currentKey = 0;
let currentBPM = 75;
let swingAmount = 0.08;
let nextBarTime = 0;
let timerHandle: number | null = null;
let energyState: EnergyState = initEnergyState("rainy");
let voice1: VoiceState = initVoice(1, "rhodes", "lead");
let voice2: VoiceState = initVoice(2, "vibraphone", "support");

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
  energyState = initEnergyState(mood);
  const [t1, t2] = MOOD_META[mood].improv.voices;
  voice1 = initVoice(1, t1, "lead");
  voice2 = initVoice(2, t2, "support");

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
    voice1 = initVoice(voice1.id, voice1.timbre, voice1.role);
    voice2 = initVoice(voice2.id, voice2.timbre, voice2.role);
  }
}

export function resetImprovState(mood: Mood = "rainy"): void {
  energyState = initEnergyState(mood);
  const [t1, t2] = MOOD_META[mood].improv.voices;
  voice1 = initVoice(1, t1, "lead");
  voice2 = initVoice(2, t2, "support");
}

function swapProbability(melodyEnergy: number): number {
  if (melodyEnergy > 0.65) return 0.35; // peak / buildup
  if (melodyEnergy < 0.35) return 0.15; // break / bridge
  return 0.10; // normal
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
  // `effectiveComplexity` gates density/probability. The formula is an
  // additive offset around 0.5 so peak sections push complexity ABOVE
  // the user's baseline (more notes) and break sections pull it below
  // (sparser) — rather than always reducing it as a pure product would.
  // Per-voice energy: in improv mode, comp/bass/drums each have an
  // independent energy level that drifts semi-independently.
  let prog: readonly [Chord, Chord, Chord, Chord];
  let nextProg: readonly [Chord, Chord, Chord, Chord];
  let effectiveComplexity = complexity;
  let compVelScale = 1.0;
  let bassVelScale = 1.0;
  let drumVelScale = 1.0;
  let phraseStyle: PhraseStyle = "normal";

  // Melody always follows the form. Comp/bass may use energyState.prog in
  // improv mode so harmony can wander, but the melody stays anchored to the
  // form so improv fills are always in key over the base track.
  const formProg = currentSectionProg(currentForm, {
    sectionIdx: formSectionIdx,
    barInSection: formBarInSection,
  });

  if (isImprov) {
    const { melody: melEnergy, comp: compEnergy, bass: bassEnergy, drums: drumEnergy } =
      energyState.energies;
    prog = energyState.prog;
    nextProg = energyState.prog;
    compVelScale = compEnergy;
    bassVelScale = bassEnergy;
    drumVelScale = drumEnergy;
    effectiveComplexity = Math.max(0, Math.min(1, complexity + (melEnergy - 0.5)));
    phraseStyle = melEnergy > 0.65 ? "dense" : melEnergy < 0.35 ? "sparse" : "normal";
  } else {
    prog = formProg;
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
    const vel = (0.11 - i * 0.015) * compVelScale;
    const strum = i * 0.02;
    playComp(audio, midiNote, barStart + strum, chordDur, vel, "rhodesComp", mood, currentBPM);
    recordNote({ time: barStart + strum, midi: midiNote, dur: chordDur, voice: "chords" });

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
      recordNote({
        time: barStart + bd * 2 + strum * 0.5,
        midi: midiNote,
        dur: chordDur * 0.85,
        voice: "chords",
      });
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
      recordNote({
        time: barStart + bd * 1.5 + strum * 0.3,
        midi: midiNote,
        dur: bd * 0.4,
        voice: "chords",
      });
    }
  });

  // --- Two-voice melody ---
  // In non-improv mode: voice1 (lead) plays the form on melTimbre, voice2 silent.
  // In improv mode: both voices play their improv-config timbres with trading roles.
  // `leadTimbre` is recomputed after any role swap below so it always tracks
  // whichever voice is currently leading.

  if (isImprov) {
    // Possibly swap roles at phrase boundary (only when both voices are at the
    // start of a phrase — phraseBarIdx === 0 for both — which is always the
    // case here because lanes reset together on prog change).
    if (voice1.phraseBarIdx === 0 && voice2.phraseBarIdx === 0) {
      if (Math.random() < swapProbability(energyState.energies.melody)) {
        [voice1, voice2] = swapRoles(voice1, voice2);
      }
    }
  }

  // Identify lead and support for this bar (after any swap above).
  const lead: VoiceState = voice1.role === "lead" ? voice1 : voice2;
  const support: VoiceState = voice1.role === "support" ? voice1 : voice2;
  const leadTimbre = isImprov ? lead.timbre : MOOD_META[mood].melTimbre;

  // ---- LEAD ----
  let leadVoice = lead;
  if (leadVoice.phraseBarIdx === 0 || leadVoice.phrase === null) {
    leadVoice = startNextPhrase(leadVoice, {
      formProg,
      currentKey,
      complexity: effectiveComplexity,
      beatDur: bd,
      melodyEnergy: energyState.energies.melody,
      breakoutThreshold: MOOD_META[mood].improv.breakoutThreshold,
      leadLastMidi: leadVoice.lastMidi,
      rng: Math.random,
    });
  }
  const leadBar = leadVoice.phrase![leadVoice.phraseBarIdx % leadVoice.phrase!.length];
  const leadVelBase = 0.17;
  for (const note of leadBar) {
    const noteTime = barStart + note.beat;
    if (noteTime >= barStart - 0.01) {
      playMelodyTimbre(audio, note.midi, noteTime, note.dur, leadVelBase, "mel", leadTimbre);
      recordNote({
        time: noteTime,
        midi: note.midi,
        dur: note.dur,
        voice: leadVoice.id === 1 ? "mel1" : "mel2",
      });
    }
  }
  if (leadBar.length > 0) {
    leadVoice = updateVoiceMidi(leadVoice, leadBar[leadBar.length - 1].midi);
  }
  const leadNext = leadVoice.phrase![(leadVoice.phraseBarIdx + 1) % leadVoice.phrase!.length];
  if (leadNext?.[0]?.anticipation) {
    const at = barStart + bd * 4 - bd * 0.25;
    playMelodyTimbre(audio, leadNext[0].midi, at, leadNext[0].dur, leadVelBase * 0.82, "mel", leadTimbre);
    recordNote({
      time: at,
      midi: leadNext[0].midi,
      dur: leadNext[0].dur,
      voice: leadVoice.id === 1 ? "mel1" : "mel2",
    });
  }
  leadVoice = advanceVoiceBar(leadVoice);

  // ---- SUPPORT ----
  let supportVoice = support;
  const supportSilent = !isImprov || leadVoice.mode === "improv"; // breathing rule
  if (!supportSilent) {
    if (supportVoice.phraseBarIdx === 0 || supportVoice.phrase === null) {
      supportVoice = startNextPhrase(supportVoice, {
        formProg,
        currentKey,
        complexity: effectiveComplexity,
        beatDur: bd,
        melodyEnergy: energyState.energies.melody,
        breakoutThreshold: MOOD_META[mood].improv.breakoutThreshold,
        leadLastMidi: lead.lastMidi, // seed with the LEAD's last note (pre-bar-update state)
        rng: Math.random,
      });
    }
    const supBar = supportVoice.phrase![supportVoice.phraseBarIdx % supportVoice.phrase!.length];
    const supVelBase = 0.10;
    for (const note of supBar) {
      const noteTime = barStart + note.beat;
      if (noteTime >= barStart - 0.01) {
        playMelodyTimbre(audio, note.midi, noteTime, note.dur, supVelBase, "mel", supportVoice.timbre);
        recordNote({
          time: noteTime,
          midi: note.midi,
          dur: note.dur,
          voice: supportVoice.id === 1 ? "mel1" : "mel2",
        });
      }
    }
    if (supBar.length > 0) {
      supportVoice = updateVoiceMidi(supportVoice, supBar[supBar.length - 1].midi);
    }
    const supNext = supportVoice.phrase![(supportVoice.phraseBarIdx + 1) % supportVoice.phrase!.length];
    if (supNext?.[0]?.anticipation) {
      const at = barStart + bd * 4 - bd * 0.25;
      playMelodyTimbre(audio, supNext[0].midi, at, supNext[0].dur, supVelBase * 0.82, "mel", supportVoice.timbre);
      recordNote({
        time: at,
        midi: supNext[0].midi,
        dur: supNext[0].dur,
        voice: supportVoice.id === 1 ? "mel1" : "mel2",
      });
    }
  }
  // Always advance the bar counter (so silent phrases age out).
  supportVoice = advanceVoiceBar(supportVoice);

  // Write the local mutations back to the module-level voices, preserving id.
  if (leadVoice.id === 1) voice1 = leadVoice;
  else voice2 = leadVoice;
  if (supportVoice.id === 1) voice1 = supportVoice;
  else voice2 = supportVoice;

  const bassNotes = walkingBassNotes(rootMidi, voicing, nextRoot);
  bassNotes.forEach((midiNote, i) => {
    const vel = (i === 0 ? 0.3 : 0.22) * bassVelScale;
    if (mood === "sleepy" && i !== 0 && i !== 2) return;
    if (effectiveComplexity < 0.3 && i !== 0 && i !== 2) return;
    if (effectiveComplexity < 0.55 && i === 3) return;
    playBass(audio, midiNote, barStart + bd * i, bd * 0.88, vel, mood);
    recordNote({ time: barStart + bd * i, midi: midiNote, dur: bd * 0.88, voice: "bass" });
  });

  if (effectiveComplexity > 0.7 && Math.random() < (effectiveComplexity - 0.5) * 1.2) {
    const ghostMidi = bassNotes[0];
    playBass(audio, ghostMidi, barStart + bd * 3.5, bd * 0.3, 0.12 * bassVelScale, mood);
    recordNote({ time: barStart + bd * 3.5, midi: ghostMidi, dur: bd * 0.3, voice: "bass" });
  }

  const kickPat = mood === "sleepy" || mood === "late" ? KICK_PAT_SOFT : KICK_PAT_NORMAL;

  // Floor at 0.15 so kick/snare stay audible (as brushes) during sparse sections.
  const drumScale = Math.max(0.15, drumVelScale);

  for (let i = 0; i < 16; i++) {
    const stepTime = swungTime(i, barStart, currentBPM, swingAmount);

    // Kick and snare: sparse style strips down to quarter-note kick/snare only
    if (isImprov && phraseStyle === "sparse") {
      if (i === 0 || i === 8) playKick(audio, stepTime, mood, drumScale * 0.8);
      if (i === 4 || i === 12) playSnare(audio, stepTime, mood, false, drumScale * 0.7);
    } else {
      if (kickPat[i]) playKick(audio, stepTime, mood, drumScale);
      if (SNARE_PAT[i]) playSnare(audio, stepTime, mood, false, drumScale);
      if (GHOST_PAT[i] && Math.random() < effectiveComplexity * 0.7) {
        playSnare(audio, stepTime, mood, true, drumScale);
      }
    }

    // Hats: energy-aware variation
    if (isImprov && phraseStyle === "dense") {
      // Dense: 16th-note hi-hats for double-time drive
      const isOnBeat = i % 4 === 0;
      const vol = isOnBeat ? 0.07 : (0.022 + Math.random() * 0.018);
      playHat(audio, stepTime, mood, false, vol * drumScale);
      if (OPEN_PAT[i] && mood !== "sleepy") {
        playHat(audio, stepTime, mood, true, 0.07 * drumScale);
      }
    } else if (isImprov && phraseStyle === "sparse") {
      // Sparse: just quiet quarter-note hats
      if (i % 4 === 0) {
        playHat(audio, stepTime, mood, false, 0.025 * drumScale);
      }
    } else {
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
}

function tick(audio: AudioRefs, store: Store<AppState>): void {
  const barDur = beatDur(currentBPM) * 4;
  while (nextBarTime < audio.actx.currentTime + LOOKAHEAD_S) {
    scheduleBar(audio, store, nextBarTime);
    currentProgIdx++;
    if (store.get().isImprov) {
      const prevAge = energyState.progBarAge;
      energyState = stepEnergyState(energyState, store.get().currentMood, Math.random);
      // When progBarAge resets to 0, the prog just changed — reset lane phrases.
      if (energyState.progBarAge === 0 && prevAge > 0) {
        voice1 = initVoice(voice1.id, voice1.timbre, voice1.role);
        voice2 = initVoice(voice2.id, voice2.timbre, voice2.role);
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

/** Read the live beat duration in seconds. Used by the piano-roll viz. */
export function getCurrentBeatDur(): number {
  return beatDur(currentBPM);
}

/** Cycle through the 12 chromatic keys. Resets all phrase caches. */
export function cycleCurrentKey(): void {
  currentKey = (currentKey + 1) % 12;
  voice1 = initVoice(voice1.id, voice1.timbre, voice1.role);
  voice2 = initVoice(voice2.id, voice2.timbre, voice2.role);
  const keyName = NOTES[currentKey];
  const keyVal = document.getElementById("keyVal");
  if (keyVal) keyVal.textContent = keyName;
  const trackSub = document.getElementById("trackSub");
  if (trackSub) trackSub.textContent = `${keyName} · ${currentBPM} bpm`;
}
