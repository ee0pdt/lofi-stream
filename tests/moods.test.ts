import { assertEquals } from "jsr:@std/assert@^1";
import { MOOD_META } from "../src/music/moods.ts";
import type { Mood } from "../src/types.ts";

const MOODS: Mood[] = ["rainy", "late", "cafe", "sleepy", "transit"];

Deno.test("MOOD_META: contains exactly the five expected moods", () => {
  assertEquals(Object.keys(MOOD_META).sort(), [...MOODS].sort());
});

Deno.test("MOOD_META: every mood has bpmRange [low, high] with low < high", () => {
  for (const mood of MOODS) {
    const [lo, hi] = MOOD_META[mood].bpmRange;
    assertEquals(lo < hi, true, `${mood} bpmRange not ascending`);
    assertEquals(lo > 0, true, `${mood} bpmRange.low must be positive`);
  }
});

Deno.test("MOOD_META: every mood has swingRange [low, high] with low < high in [0, 0.5]", () => {
  for (const mood of MOODS) {
    const [lo, hi] = MOOD_META[mood].swingRange;
    assertEquals(lo < hi, true, `${mood} swingRange not ascending`);
    assertEquals(lo >= 0 && hi <= 0.5, true, `${mood} swingRange out of [0, 0.5]`);
  }
});

Deno.test("MOOD_META: every mood has at least one human-readable name", () => {
  for (const mood of MOODS) {
    assertEquals(MOOD_META[mood].names.length >= 1, true, `${mood} has no names`);
  }
});

Deno.test("MOOD_META: every key_pool entry is a semitone in [0, 11]", () => {
  for (const mood of MOODS) {
    for (const k of MOOD_META[mood].key_pool) {
      assertEquals(k >= 0 && k <= 11, true, `${mood} key_pool has out-of-range ${k}`);
    }
  }
});

Deno.test("MOOD_META: reverb dur > 0, decay in (0, 1)", () => {
  for (const mood of MOODS) {
    const { dur, decay } = MOOD_META[mood].reverb;
    assertEquals(dur > 0, true, `${mood} reverb.dur not positive`);
    assertEquals(decay > 0 && decay < 1, true, `${mood} reverb.decay out of (0, 1)`);
  }
});

Deno.test("MOOD_META: compTimbre and melTimbre are valid timbres", () => {
  const validTimbres = ["rhodes", "vibraphone", "guitar", "pad", "celesta", "bell", "coldsynth"];
  for (const mood of MOODS) {
    assertEquals(
      validTimbres.includes(MOOD_META[mood].compTimbre),
      true,
      `${mood} compTimbre invalid`,
    );
    assertEquals(
      validTimbres.includes(MOOD_META[mood].melTimbre),
      true,
      `${mood} melTimbre invalid`,
    );
  }
});

Deno.test("MOOD_META: ambience is a valid ambience type", () => {
  const validAmbience = ["rain", "traffic", "room", "wind", "transit"];
  for (const mood of MOODS) {
    assertEquals(
      validAmbience.includes(MOOD_META[mood].ambience),
      true,
      `${mood} ambience invalid`,
    );
  }
});

Deno.test("MOOD_META.rainy: spot-check known values", () => {
  const m = MOOD_META.rainy;
  assertEquals(m.bpmRange, [62, 72]);
  assertEquals(m.compTimbre, "rhodes");
  assertEquals(m.ambience, "rain");
});

Deno.test("MOOD_META.sleepy: spot-check known values", () => {
  const m = MOOD_META.sleepy;
  assertEquals(m.bpmRange, [55, 65]);
  assertEquals(m.compTimbre, "pad");
  assertEquals(m.melTimbre, "celesta");
  assertEquals(m.ambience, "wind");
});

Deno.test("MOOD_META.transit: spot-check known values", () => {
  const m = MOOD_META.transit;
  assertEquals(m.bpmRange, [60, 70]);
  assertEquals(m.compTimbre, "coldsynth");
  assertEquals(m.melTimbre, "bell");
  assertEquals(m.ambience, "transit");
  assertEquals(m.names, ["platform 4", "last departure", "signal hold"]);
});
