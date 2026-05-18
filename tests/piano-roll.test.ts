import { assertEquals } from "jsr:@std/assert@^1";
import {
  __pruneOlderThanForTest,
  __resetPianoRollForTest,
  __snapshotPianoRollForTest,
  recordNote,
  type RollVoice,
} from "../src/visual/piano-roll.ts";

Deno.test("piano-roll: recordNote appends to ring buffer", () => {
  __resetPianoRollForTest();
  recordNote({ time: 1.0, midi: 60, dur: 0.5, voice: "mel1" });
  recordNote({ time: 1.5, midi: 64, dur: 0.5, voice: "mel2" });
  const snap = __snapshotPianoRollForTest();
  assertEquals(snap.length, 2);
  assertEquals(snap[0].midi, 60);
  assertEquals(snap[0].voice as RollVoice, "mel1");
  assertEquals(snap[1].midi, 64);
});

Deno.test("piano-roll: buffer wraps at capacity", () => {
  __resetPianoRollForTest();
  // capacity is 256; push 300 notes — oldest should be evicted
  for (let i = 0; i < 300; i++) {
    recordNote({ time: i, midi: 60 + (i % 12), dur: 0.1, voice: "chords" });
  }
  const snap = __snapshotPianoRollForTest();
  assertEquals(snap.length, 256);
  // oldest surviving note is index 300 - 256 = 44
  assertEquals(snap[0].time, 44);
  assertEquals(snap[snap.length - 1].time, 299);
});

Deno.test("piano-roll: pruneOlderThan drops notes ending before cutoff", () => {
  __resetPianoRollForTest();
  recordNote({ time: 0, midi: 60, dur: 0.5, voice: "mel1" }); // ends at 0.5
  recordNote({ time: 1, midi: 60, dur: 0.5, voice: "mel1" }); // ends at 1.5
  recordNote({ time: 2, midi: 60, dur: 0.5, voice: "mel1" }); // ends at 2.5
  __pruneOlderThanForTest(1.6); // drops the first two (end at 0.5 and 1.5, both < 1.6)
  const snap = __snapshotPianoRollForTest();
  assertEquals(snap.length, 1);
  assertEquals(snap[0].time, 2);
});
