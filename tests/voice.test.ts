import { assertEquals } from "jsr:@std/assert@^1";
import { FORMS } from "../src/music/forms.ts";
import {
  advanceVoiceBar,
  initVoice,
  startNextPhrase,
  swapRoles,
  updateVoiceMidi,
} from "../src/music/voice.ts";

const testProg = FORMS["late"][0].prog;
const beatDur = 60 / 70;

Deno.test("voice: initVoice defaults", () => {
  const v = initVoice(1, "vibraphone", "lead");
  assertEquals(v.id, 1);
  assertEquals(v.timbre, "vibraphone");
  assertEquals(v.role, "lead");
  assertEquals(v.mode, "structured");
  assertEquals(v.phrase, null);
  assertEquals(v.phraseBarIdx, 0);
  assertEquals(v.barsInMode, 0);
  assertEquals(v.lastMidi, null);
});

Deno.test("voice: lead startNextPhrase returns a structured phrase from formProg", () => {
  const v = initVoice(1, "vibraphone", "lead");
  const next = startNextPhrase(v, {
    formProg: testProg,
    currentKey: 0,
    complexity: 0.5,
    beatDur,
    melodyEnergy: 0.3, // below breakout threshold
    breakoutThreshold: 0.62,
    leadLastMidi: null,
    rng: () => 0.99, // RNG that defeats breakout roll
  });
  assertEquals(next.phrase !== null, true);
  assertEquals(next.mode, "structured");
});

Deno.test("voice: lead with high energy can enter improv mode", () => {
  const v = initVoice(1, "vibraphone", "lead");
  const next = startNextPhrase(v, {
    formProg: testProg,
    currentKey: 0,
    complexity: 0.5,
    beatDur,
    melodyEnergy: 0.85, // above threshold
    breakoutThreshold: 0.62,
    leadLastMidi: null,
    rng: () => 0.1, // RNG that succeeds the breakout roll (< 0.45)
  });
  assertEquals(next.mode, "improv");
});

Deno.test("voice: support always stays structured even at high energy", () => {
  const v = initVoice(2, "bell", "support");
  const next = startNextPhrase(v, {
    formProg: testProg,
    currentKey: 0,
    complexity: 0.5,
    beatDur,
    melodyEnergy: 0.95,
    breakoutThreshold: 0.62,
    leadLastMidi: 60,
    rng: () => 0.05,
  });
  assertEquals(next.mode, "structured");
});

Deno.test("voice: support is seeded with lead's last midi (not its own)", () => {
  // Self-midi 50 but lead at 70. Heuristic: the support's first note should
  // land closer to 70 than to 50 because seedNote propagates through
  // generatePhrase's contour logic. We assert > 58 (well above the self-seed).
  const v = updateVoiceMidi(initVoice(2, "bell", "support"), 50);
  const next = startNextPhrase(v, {
    formProg: testProg,
    currentKey: 0,
    complexity: 0.3,
    beatDur,
    melodyEnergy: 0.4,
    breakoutThreshold: 0.62,
    leadLastMidi: 70,
    rng: () => 0.5,
  });
  const firstMidi = next.phrase![0][0].midi;
  assertEquals(firstMidi > 58, true, `first midi ${firstMidi} should be closer to 70 than to 50`);
});

Deno.test("voice: advanceVoiceBar increments phraseBarIdx", () => {
  let v = initVoice(1, "rhodes", "lead");
  v = advanceVoiceBar(v);
  assertEquals(v.phraseBarIdx, 1);
});

Deno.test("voice: updateVoiceMidi stores last midi", () => {
  const v = initVoice(1, "rhodes", "lead");
  const next = updateVoiceMidi(v, 64);
  assertEquals(next.lastMidi, 64);
});

Deno.test("voice: swapRoles flips both voices and clears mode/bars-in-mode", () => {
  let a = initVoice(1, "rhodes", "lead");
  let b = initVoice(2, "vibraphone", "support");
  a = { ...a, mode: "improv", barsInMode: 4 };
  [a, b] = swapRoles(a, b);
  assertEquals(a.role, "support");
  assertEquals(b.role, "lead");
  assertEquals(a.mode, "structured");
  assertEquals(a.barsInMode, 0);
});
