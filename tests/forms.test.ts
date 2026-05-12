import { assertEquals } from "jsr:@std/assert@^1";
import { FORMS } from "../src/music/forms.ts";
import { VOICINGS } from "../src/music/voicings.ts";
import type { Mood } from "../src/types.ts";

const MOODS: Mood[] = ["rainy", "late", "cafe", "sleepy"];

Deno.test("FORMS: contains exactly the four expected moods", () => {
  assertEquals(Object.keys(FORMS).sort(), [...MOODS].sort());
});

Deno.test("FORMS: every form has at least one section", () => {
  for (const mood of MOODS) {
    assertEquals(FORMS[mood].length >= 1, true, `${mood} has no sections`);
  }
});

Deno.test("FORMS: every section has bars > 0", () => {
  for (const mood of MOODS) {
    for (const [idx, section] of FORMS[mood].entries()) {
      assertEquals(section.bars > 0, true, `${mood}[${idx}] has bars=${section.bars}`);
    }
  }
});

Deno.test("FORMS: every section's prog is exactly 4 chords", () => {
  for (const mood of MOODS) {
    for (const [idx, section] of FORMS[mood].entries()) {
      assertEquals(section.prog.length, 4, `${mood}[${idx}] prog length wrong`);
    }
  }
});

Deno.test("FORMS: every chord references a voicing that exists in VOICINGS", () => {
  for (const mood of MOODS) {
    for (const [idx, section] of FORMS[mood].entries()) {
      for (const [chordIdx, [_root, voicing]] of section.prog.entries()) {
        assertEquals(
          voicing in VOICINGS,
          true,
          `${mood}[${idx}].prog[${chordIdx}] references missing voicing "${voicing}"`,
        );
      }
    }
  }
});

Deno.test("FORMS: every rootOffset is a semitone in [0, 11]", () => {
  for (const mood of MOODS) {
    for (const [idx, section] of FORMS[mood].entries()) {
      for (const [chordIdx, [root, _voicing]] of section.prog.entries()) {
        assertEquals(
          root >= 0 && root <= 11,
          true,
          `${mood}[${idx}].prog[${chordIdx}] rootOffset ${root} out of [0, 11]`,
        );
      }
    }
  }
});

Deno.test("FORMS.rainy: matches the known 24-bar AABBA' structure", () => {
  const bars = FORMS.rainy.map((s) => s.bars);
  assertEquals(bars, [8, 8, 4, 2, 2]);
  assertEquals(bars.reduce((a, b) => a + b, 0), 24);
});

Deno.test("FORMS.cafe: matches the known 16-bar AABB' structure", () => {
  const bars = FORMS.cafe.map((s) => s.bars);
  assertEquals(bars, [4, 4, 4, 4]);
  assertEquals(bars.reduce((a, b) => a + b, 0), 16);
});

Deno.test("FORMS.sleepy: matches the known 32-bar AAAB A structure", () => {
  const bars = FORMS.sleepy.map((s) => s.bars);
  assertEquals(bars, [8, 8, 8, 8]);
  assertEquals(bars.reduce((a, b) => a + b, 0), 32);
});
