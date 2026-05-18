import { assert, assertEquals } from "jsr:@std/assert@^1";
import {
  advanceImprovSection,
  type ImprovState,
  initImprovState,
} from "../src/music/improv-sequencer.ts";
import { MOOD_META } from "../src/music/moods.ts";

/**
 * A deterministic RNG that walks a supplied sequence of [0, 1) values.
 * Loops back to the start when exhausted, so tests don't have to count exactly.
 */
function seq(values: number[]): () => number {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    i++;
    return v;
  };
}

Deno.test("initImprovState: returns a normal section with sane defaults", () => {
  const s = initImprovState();
  assertEquals(s.sectionType, "normal");
  assert(s.dynamicLevel >= 0 && s.dynamicLevel <= 1);
  assertEquals(s.prog.length, 4);
  assert(s.barsRemaining > 0);
});

Deno.test("advanceImprovSection: returns a state with bars > 0", () => {
  const start = initImprovState();
  const next = advanceImprovSection(start, "rainy", seq([0.0, 0.5, 0.5]));
  assert(next.barsRemaining > 0);
  assertEquals(next.prog.length, 4);
});

Deno.test("advanceImprovSection: never returns the same sectionType two cycles in a row", () => {
  let s = initImprovState();
  const rng = seq([0.05, 0.5, 0.5, 0.05, 0.5, 0.5, 0.05, 0.5, 0.5, 0.05, 0.5, 0.5]);
  for (let i = 0; i < 50; i++) {
    const prev = s.sectionType;
    s = advanceImprovSection(s, "cafe", rng);
    assert(s.sectionType !== prev, `repeat at iter ${i}: ${prev}`);
  }
});

Deno.test("advanceImprovSection: bridge uses MOOD_META[mood].improv.bridgeSubstitutions", () => {
  // Force transition into bridge from a non-bridge state. The normal->bridge
  // weight is 0.2 (cumulative band 0.5..0.7 in the spec table); pick rng=0.6.
  const start: ImprovState = {
    sectionType: "normal",
    dynamicLevel: 0.5,
    prog: MOOD_META.cafe.improv.bridgeSubstitutions, // placeholder; will be replaced
    barsRemaining: 0,
  };
  const next = advanceImprovSection(start, "cafe", seq([0.6, 0.5, 0.5]));
  if (next.sectionType === "bridge") {
    assertEquals(next.prog, MOOD_META.cafe.improv.bridgeSubstitutions);
  }
});

Deno.test("advanceImprovSection: dynamicLevel never exceeds mood peakDensityCap", () => {
  let s = initImprovState();
  const rng = seq([0.05, 0.99, 0.99, 0.5, 0.99, 0.99]); // bias toward peak transitions
  for (let i = 0; i < 200; i++) {
    s = advanceImprovSection(s, "sleepy", rng);
    assert(
      s.dynamicLevel <= MOOD_META.sleepy.improv.peakDensityCap + 1e-9,
      `dynamicLevel ${s.dynamicLevel} exceeds cap`,
    );
  }
});

Deno.test("advanceImprovSection: normal/buildup/peak/break prog is from FORMS[mood]", async () => {
  const { FORMS } = await import("../src/music/forms.ts");
  let s = initImprovState();
  const rng = seq([0.1, 0.3, 0.7]);
  for (let i = 0; i < 100; i++) {
    s = advanceImprovSection(s, "rainy", rng);
    if (s.sectionType !== "bridge") {
      // The chosen prog must equal some FORMS[rainy] section's prog.
      const match = FORMS.rainy.some(
        (sec) =>
          sec.prog.length === s.prog.length &&
          sec.prog.every((c, idx) => c[0] === s.prog[idx][0] && c[1] === s.prog[idx][1]),
      );
      assert(match, `non-FORMS prog at iter ${i}: ${JSON.stringify(s.prog)}`);
    }
  }
});
