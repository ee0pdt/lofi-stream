import { assertEquals } from "jsr:@std/assert@^1";
import { initialAppState } from "../src/state-init.ts";
import { DEFAULT_SETTINGS } from "../src/music/settings.ts";

Deno.test("initialAppState: currentMood defaults to rainy", () => {
  assertEquals(initialAppState().currentMood, "rainy");
});

Deno.test("initialAppState: isPlaying defaults to false", () => {
  assertEquals(initialAppState().isPlaying, false);
});

Deno.test("initialAppState: complexity mirrors rainy.complexity", () => {
  assertEquals(initialAppState().complexity, DEFAULT_SETTINGS.rainy.complexity);
});
