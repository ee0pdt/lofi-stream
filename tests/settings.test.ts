import { assertEquals } from "jsr:@std/assert@^1";
import { DEFAULT_SETTINGS } from "../src/music/settings.ts";
import type { Mood } from "../src/types.ts";

const MOODS: Mood[] = ["rainy", "late", "cafe", "sleepy"];

const SLIDER_KEYS = [
  "drums",
  "bass",
  "comp",
  "melody",
  "hiss",
  "scratches",
  "hum",
  "warp",
  "ambience",
  "rain",
  "reverb",
  "complexity",
  "vol",
] as const;

Deno.test("DEFAULT_SETTINGS: contains exactly the four expected moods", () => {
  assertEquals(Object.keys(DEFAULT_SETTINGS).sort(), [...MOODS].sort());
});

Deno.test("DEFAULT_SETTINGS: each mood has all 13 slider keys", () => {
  for (const mood of MOODS) {
    const keys = Object.keys(DEFAULT_SETTINGS[mood]).sort();
    assertEquals(keys, [...SLIDER_KEYS].sort(), `${mood} keys mismatch`);
  }
});

Deno.test("DEFAULT_SETTINGS: every slider value is in [0, 1]", () => {
  for (const mood of MOODS) {
    for (const [key, val] of Object.entries(DEFAULT_SETTINGS[mood])) {
      assertEquals(val >= 0 && val <= 1, true, `${mood}.${key}=${val} out of [0, 1]`);
    }
  }
});

Deno.test("DEFAULT_SETTINGS.rainy: spot-check known values", () => {
  const s = DEFAULT_SETTINGS.rainy;
  assertEquals(s.drums, 0.85);
  assertEquals(s.rain, 0.6);
  assertEquals(s.complexity, 0.45);
});

Deno.test("DEFAULT_SETTINGS.cafe: rain is 0 (no rain in cafe)", () => {
  assertEquals(DEFAULT_SETTINGS.cafe.rain, 0);
});

Deno.test("DEFAULT_SETTINGS.sleepy: rain is 0 (no rain when sleepy)", () => {
  assertEquals(DEFAULT_SETTINGS.sleepy.rain, 0);
});
