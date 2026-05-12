import { assertEquals } from "jsr:@std/assert@^1";
import { FORMS } from "../src/music/forms.ts";
import { MOOD_META } from "../src/music/moods.ts";
import { DEFAULT_SETTINGS } from "../src/music/settings.ts";

Deno.test("integrity: MOOD_META, FORMS, and DEFAULT_SETTINGS all use the same mood keys", () => {
  const moodKeys = Object.keys(MOOD_META).sort();
  const formKeys = Object.keys(FORMS).sort();
  const settingsKeys = Object.keys(DEFAULT_SETTINGS).sort();
  assertEquals(moodKeys, formKeys, "MOOD_META and FORMS keys differ");
  assertEquals(moodKeys, settingsKeys, "MOOD_META and DEFAULT_SETTINGS keys differ");
});

Deno.test("integrity: every mood that says ambience='rain' has rain>0 in defaults", () => {
  for (const mood of Object.keys(MOOD_META) as (keyof typeof MOOD_META)[]) {
    if (MOOD_META[mood].ambience === "rain") {
      assertEquals(
        DEFAULT_SETTINGS[mood].rain > 0,
        true,
        `${mood} has ambience=rain but rain default is ${DEFAULT_SETTINGS[mood].rain}`,
      );
    }
  }
});

Deno.test("integrity: every mood that says ambience!='rain' has rain<0.5 in defaults", () => {
  // Non-rain moods may still have a tiny rain layer (e.g., 'late' has 0.05) but
  // shouldn't have a prominent one — guards against accidentally re-enabling rain.
  for (const mood of Object.keys(MOOD_META) as (keyof typeof MOOD_META)[]) {
    if (MOOD_META[mood].ambience !== "rain") {
      assertEquals(
        DEFAULT_SETTINGS[mood].rain < 0.5,
        true,
        `${mood} has ambience=${MOOD_META[mood].ambience} but rain default is ${DEFAULT_SETTINGS[mood].rain}`,
      );
    }
  }
});
