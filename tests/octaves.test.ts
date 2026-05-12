import { assertEquals } from "jsr:@std/assert@^1";
import { bassOct, melodyOct } from "../src/music/octaves.ts";

Deno.test("melodyOct: in-range MIDI is unchanged", () => {
  assertEquals(melodyOct(60), 60);
  assertEquals(melodyOct(72), 72);
  assertEquals(melodyOct(79), 79);
});

Deno.test("melodyOct: too-low MIDI is shifted up an octave", () => {
  assertEquals(melodyOct(48), 60);
  assertEquals(melodyOct(36), 60);
  assertEquals(melodyOct(59), 71);
});

Deno.test("melodyOct: too-high MIDI is shifted down an octave", () => {
  assertEquals(melodyOct(80), 68);
  assertEquals(melodyOct(91), 79);
  assertEquals(melodyOct(96), 72);
});

Deno.test("melodyOct: result is always in [60, 79]", () => {
  for (let m = 0; m < 128; m++) {
    const out = melodyOct(m);
    assertEquals(out >= 60 && out <= 79, true, `melodyOct(${m}) = ${out}, out of [60, 79]`);
  }
});

Deno.test("bassOct: in-range MIDI is unchanged", () => {
  assertEquals(bassOct(36), 36);
  assertEquals(bassOct(40), 40);
  assertEquals(bassOct(47), 47);
});

Deno.test("bassOct: too-low MIDI is shifted up an octave", () => {
  assertEquals(bassOct(24), 36);
  assertEquals(bassOct(35), 47);
  assertEquals(bassOct(0), 36);
});

Deno.test("bassOct: too-high MIDI is shifted down an octave (loops until in range)", () => {
  assertEquals(bassOct(48), 36); // 48 -> 36
  assertEquals(bassOct(60), 36); // 60 -> 48 -> 36 (loops twice)
  assertEquals(bassOct(59), 47); // 59 -> 47 (in range)
});

Deno.test("bassOct: result is always in [36, 47]", () => {
  for (let m = 0; m < 128; m++) {
    const out = bassOct(m);
    assertEquals(out >= 36 && out <= 47, true, `bassOct(${m}) = ${out}, out of [36, 47]`);
  }
});

Deno.test("bassOct: preserves pitch class (modulo 12)", () => {
  assertEquals(bassOct(24) % 12, 0);
  assertEquals(bassOct(36) % 12, 0);
  assertEquals(bassOct(48) % 12, 0);
});

Deno.test("melodyOct: preserves pitch class (modulo 12)", () => {
  assertEquals(melodyOct(36) % 12, 0);
  assertEquals(melodyOct(48) % 12, 0);
  assertEquals(melodyOct(60) % 12, 0);
  assertEquals(melodyOct(72) % 12, 0);
});
