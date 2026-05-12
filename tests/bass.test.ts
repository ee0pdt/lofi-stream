import { assertEquals } from "jsr:@std/assert@^1";
import { walkingBassNotes } from "../src/music/bass.ts";
import { VOICINGS } from "../src/music/voicings.ts";

Deno.test("walkingBassNotes: returns 4 notes", () => {
  const notes = walkingBassNotes(36, VOICINGS.min7, 41);
  assertEquals(notes.length, 4);
});

Deno.test("walkingBassNotes: all notes are in the bass register [36, 47]", () => {
  const cases: Array<[number, readonly number[], number]> = [
    [36, VOICINGS.min7, 41],
    [60, VOICINGS.maj7, 65],
    [45, VOICINGS.dom9, 38],
    [36, VOICINGS.min9, 39],
  ];
  for (const [root, voicing, next] of cases) {
    const notes = walkingBassNotes(root, voicing, next);
    for (const [i, n] of notes.entries()) {
      assertEquals(
        n >= 36 && n <= 47,
        true,
        `walkingBassNotes(${root}, ..., ${next})[${i}] = ${n} out of [36, 47]`,
      );
    }
  }
});

Deno.test("walkingBassNotes: beat 1 is the root in the bass register", () => {
  assertEquals(walkingBassNotes(36, VOICINGS.min7, 41)[0], 36);
  assertEquals(walkingBassNotes(60, VOICINGS.maj7, 41)[0], 36);
});

Deno.test("walkingBassNotes: beat 2 is the 3rd of the chord (for 4-note voicings)", () => {
  // min7 = [0, 3, 7, 10] -> voicing[1] = 3; root 36 -> bassOct(39) = 39
  assertEquals(walkingBassNotes(36, VOICINGS.min7, 41)[1], 39);
});

Deno.test("walkingBassNotes: beat 3 is the 5th of the chord (for 4-note voicings)", () => {
  // min7 voicing[2] = 7; root 36 -> bassOct(43) = 43
  assertEquals(walkingBassNotes(36, VOICINGS.min7, 41)[2], 43);
});

Deno.test("walkingBassNotes: beat 4 is a chromatic approach to nextRoot", () => {
  // root 36, min7, next 41 -> beat3=43, nextRoot=41, diff=-2 -> approach = 41+1 = 42
  assertEquals(walkingBassNotes(36, VOICINGS.min7, 41)[3], 42);
});

Deno.test("walkingBassNotes: beat 4 approaches from below when next root is above beat3", () => {
  // root 36, min7, next 45 -> beat3=43, nextRoot=45, diff=2 (positive) -> approach = 45-1 = 44
  assertEquals(walkingBassNotes(36, VOICINGS.min7, 45)[3], 44);
});

Deno.test("walkingBassNotes: works with 5-note voicings (uses first 3 intervals)", () => {
  // min9 = [0, 3, 7, 10, 14]
  assertEquals(walkingBassNotes(36, VOICINGS.min9, 41)[1], 39);
  assertEquals(walkingBassNotes(36, VOICINGS.min9, 41)[2], 43);
});

Deno.test("walkingBassNotes: deterministic — same inputs always produce same output", () => {
  const a = walkingBassNotes(36, VOICINGS.dom7, 41);
  const b = walkingBassNotes(36, VOICINGS.dom7, 41);
  assertEquals(a, b);
});
