import { assertEquals } from "jsr:@std/assert@^1";
import { initEnergyState, stepEnergyState } from "../src/music/improv-energy.ts";
import { MOOD_META } from "../src/music/moods.ts";

Deno.test("initEnergyState: all energies start in [0.1, cap] and progBarAge is 0", () => {
  const cap = MOOD_META.rainy.improv.peakDensityCap;
  const s = initEnergyState("rainy");
  for (const e of [s.energies.melody, s.energies.comp, s.energies.bass, s.energies.drums]) {
    assertEquals(e >= 0.1 && e <= cap, true, `init energy ${e} out of range`);
  }
  assertEquals(s.progBarAge, 0);
});

Deno.test("stepEnergyState: energies stay in [0.1, cap]", () => {
  let s = initEnergyState("sleepy"); // peakDensityCap 0.65
  const cap = MOOD_META.sleepy.improv.peakDensityCap;
  for (let i = 0; i < 200; i++) {
    s = stepEnergyState(s, "sleepy", Math.random);
    const { melody, comp, bass, drums } = s.energies;
    for (const e of [melody, comp, bass, drums]) {
      assertEquals(
        e >= 0.1 && e <= cap,
        true,
        `energy ${e} out of range [0.1, ${cap}]`,
      );
    }
  }
});

Deno.test("stepEnergyState: progBarAge increments each bar", () => {
  const rng = () => 0.5; // deterministic — no prog change (threshold >= 8, age only 1 then 2)
  let s = initEnergyState("rainy");
  s = stepEnergyState(s, "rainy", rng);
  assertEquals(s.progBarAge, 1);
  s = stepEnergyState(s, "rainy", rng);
  assertEquals(s.progBarAge, 2);
});

Deno.test("stepEnergyState: prog changes after 8–16 bars", () => {
  // rng always 0 → threshold = 8 + floor(0*8) = 8; at bar 8 age resets to 0
  const rng = () => 0;
  let s = initEnergyState("cafe");
  let ageReset = false;
  for (let i = 0; i < 10; i++) {
    const prevAge = s.progBarAge;
    s = stepEnergyState(s, "cafe", rng);
    // A reset is detected when age goes back to 0 from a non-zero value
    if (prevAge > 0 && s.progBarAge === 0) ageReset = true;
  }
  assertEquals(ageReset, true);
});

Deno.test("stepEnergyState: trading — highest energy voice gets nudge up, others nudge down", () => {
  const rng = () => 0.5; // no random drift (0.5 - 0.5 = 0)
  let s = initEnergyState("late");
  // Manually construct state with melody high, others low
  s = { ...s, energies: { melody: 0.8, comp: 0.3, bass: 0.3, drums: 0.3 } };
  const after = stepEnergyState(s, "late", rng);
  assertEquals(after.energies.melody >= after.energies.comp, true);
  assertEquals(after.energies.melody >= after.energies.bass, true);
});

import {
  advanceLaneBar,
  initLaneState,
  startNextPhrase,
  updateLaneMidi,
} from "../src/music/voice-lane.ts";
import { FORMS } from "../src/music/forms.ts";

const testProg = FORMS["late"][0].prog;

Deno.test("voice-lane: initLaneState defaults", () => {
  const s = initLaneState({ timbre: "vibraphone", breakoutThreshold: 0.65 }, false);
  assertEquals(s.phrase, null);
  assertEquals(s.phraseBarIdx, 0);
  assertEquals(s.mode, "structured");
  assertEquals(s.isSecondary, false);
});

Deno.test("voice-lane: startNextPhrase generates a phrase", () => {
  const s = initLaneState({ timbre: "vibraphone", breakoutThreshold: 0.65 }, false);
  const next = startNextPhrase(s, {
    prog: testProg,
    currentKey: 0,
    complexity: 0.5,
    beatDur: 60 / 70,
    melodyEnergy: 0.5,
    isImprov: true,
    primaryMode: "structured",
    rng: Math.random,
  });
  assertEquals(next.phrase !== null, true);
  assertEquals(next.phraseBarIdx, 0);
});

Deno.test("voice-lane: secondary stays structured when primary is improv", () => {
  const s = initLaneState({ timbre: "bell", breakoutThreshold: 0.82 }, true);
  const next = startNextPhrase(s, {
    prog: testProg,
    currentKey: 0,
    complexity: 0.8,
    beatDur: 60 / 70,
    melodyEnergy: 0.9,
    isImprov: true,
    primaryMode: "improv",
    rng: Math.random,
  });
  assertEquals(next.mode, "structured");
});

Deno.test("voice-lane: advanceLaneBar increments phraseBarIdx", () => {
  let s = initLaneState({ timbre: "rhodes", breakoutThreshold: 0.72 }, false);
  s = advanceLaneBar(s);
  assertEquals(s.phraseBarIdx, 1);
  s = advanceLaneBar(s);
  assertEquals(s.phraseBarIdx, 2);
});

Deno.test("voice-lane: updateLaneMidi stores last midi", () => {
  const s = initLaneState({ timbre: "rhodes", breakoutThreshold: 0.72 }, false);
  const next = updateLaneMidi(s, 64);
  assertEquals(next.lastMidi, 64);
});
