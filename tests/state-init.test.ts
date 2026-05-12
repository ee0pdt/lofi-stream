import { assertEquals, assertStrictEquals } from "jsr:@std/assert@^1";
import { initialAppState } from "../src/state-init.ts";
import { DEFAULT_SETTINGS } from "../src/music/settings.ts";

Deno.test("initialAppState: currentMood defaults to rainy", () => {
  assertEquals(initialAppState().currentMood, "rainy");
});

Deno.test("initialAppState: isPlaying defaults to false", () => {
  assertEquals(initialAppState().isPlaying, false);
});

Deno.test("initialAppState: currentSettings ALIASES moodSettings[currentMood]", () => {
  const s = initialAppState();
  assertStrictEquals(s.currentSettings, s.moodSettings[s.currentMood]);
  s.currentSettings.drums = 0.12;
  assertEquals(s.moodSettings.rainy.drums, 0.12);
});

Deno.test("initialAppState: moodSettings does NOT share references with DEFAULT_SETTINGS", () => {
  const s = initialAppState();
  // Mutating runtime state must not bleed back to the readonly defaults.
  s.moodSettings.rainy.drums = 0.99;
  assertEquals(DEFAULT_SETTINGS.rainy.drums === 0.99, false);
});

Deno.test("initialAppState: complexity mirrors rainy.complexity", () => {
  const s = initialAppState();
  assertEquals(s.complexity, DEFAULT_SETTINGS.rainy.complexity);
});
