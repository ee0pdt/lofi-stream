import { assertEquals } from "jsr:@std/assert@^1";
import { VOICINGS } from "../src/music/voicings.ts";

Deno.test("VOICINGS: contains all 8 expected chord qualities", () => {
  const expected = ["min7", "maj7", "dom7", "min7b5", "maj6", "min9", "dom9", "maj9"];
  for (const name of expected) {
    assertEquals(name in VOICINGS, true, `missing voicing: ${name}`);
  }
  assertEquals(Object.keys(VOICINGS).length, expected.length);
});

Deno.test("VOICINGS.min7 is [0, 3, 7, 10]", () => {
  assertEquals(VOICINGS.min7, [0, 3, 7, 10]);
});

Deno.test("VOICINGS.maj7 is [0, 4, 7, 11]", () => {
  assertEquals(VOICINGS.maj7, [0, 4, 7, 11]);
});

Deno.test("VOICINGS.dom7 is [0, 4, 7, 10]", () => {
  assertEquals(VOICINGS.dom7, [0, 4, 7, 10]);
});

Deno.test("VOICINGS.min7b5 is [0, 3, 6, 10]", () => {
  assertEquals(VOICINGS.min7b5, [0, 3, 6, 10]);
});

Deno.test("VOICINGS.maj6 is [0, 4, 7, 9]", () => {
  assertEquals(VOICINGS.maj6, [0, 4, 7, 9]);
});

Deno.test("VOICINGS.min9 is [0, 3, 7, 10, 14]", () => {
  assertEquals(VOICINGS.min9, [0, 3, 7, 10, 14]);
});

Deno.test("VOICINGS.dom9 is [0, 4, 7, 10, 14]", () => {
  assertEquals(VOICINGS.dom9, [0, 4, 7, 10, 14]);
});

Deno.test("VOICINGS.maj9 is [0, 4, 7, 11, 14]", () => {
  assertEquals(VOICINGS.maj9, [0, 4, 7, 11, 14]);
});

Deno.test("VOICINGS: every voicing starts on root (0)", () => {
  for (const [name, intervals] of Object.entries(VOICINGS)) {
    assertEquals(intervals[0], 0, `${name} should start on root`);
  }
});

Deno.test("VOICINGS: every voicing is sorted ascending", () => {
  for (const [name, intervals] of Object.entries(VOICINGS)) {
    for (let i = 1; i < intervals.length; i++) {
      assertEquals(
        intervals[i] > intervals[i - 1],
        true,
        `${name} not strictly ascending at index ${i}`,
      );
    }
  }
});
