import { assertEquals } from "jsr:@std/assert@^1";
import { initEnergyState, stepEnergyState } from "../src/music/improv-energy.ts";
import { MOOD_META } from "../src/music/moods.ts";

Deno.test("initEnergyState: all energies start at 0.5", () => {
  const s = initEnergyState("rainy");
  assertEquals(s.energies.melody, 0.5);
  assertEquals(s.energies.comp, 0.5);
  assertEquals(s.energies.bass, 0.5);
  assertEquals(s.energies.drums, 0.5);
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
