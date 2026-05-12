import { assertEquals } from "jsr:@std/assert@^1";
import { currentSectionProg, DEFAULT_PROG, nextFormPosition } from "../src/music/playhead.ts";
import { FORMS } from "../src/music/forms.ts";

Deno.test("nextFormPosition: advances barInSection within a section", () => {
  const next = nextFormPosition(FORMS.rainy, { sectionIdx: 0, barInSection: 0 });
  assertEquals(next.position.sectionIdx, 0);
  assertEquals(next.position.barInSection, 1);
  assertEquals(next.sectionChanged, false);
});

Deno.test("nextFormPosition: rolls over to next section when bars are exhausted", () => {
  // FORMS.rainy section 0 has bars=8; from barInSection=7 we wrap to section 1.
  const next = nextFormPosition(FORMS.rainy, { sectionIdx: 0, barInSection: 7 });
  assertEquals(next.position.sectionIdx, 1);
  assertEquals(next.position.barInSection, 0);
  assertEquals(next.sectionChanged, true);
});

Deno.test("nextFormPosition: wraps from last section back to first", () => {
  // FORMS.rainy section 4 has bars=2; at sectionIdx=4, barInSection=1, next wraps to (0, 0).
  const next = nextFormPosition(FORMS.rainy, { sectionIdx: 4, barInSection: 1 });
  assertEquals(next.position.sectionIdx, 0);
  assertEquals(next.position.barInSection, 0);
  assertEquals(next.sectionChanged, true);
});

Deno.test("nextFormPosition: 24 calls through rainy completes one full loop", () => {
  // FORMS.rainy = [8, 8, 4, 2, 2] = 24 bars. 24 steps from (0,0) -> (0,0).
  let pos = { sectionIdx: 0, barInSection: 0 };
  let sectionChangedCount = 0;
  for (let i = 0; i < 24; i++) {
    const r = nextFormPosition(FORMS.rainy, pos);
    pos = r.position;
    if (r.sectionChanged) sectionChangedCount++;
  }
  assertEquals(pos, { sectionIdx: 0, barInSection: 0 });
  assertEquals(sectionChangedCount, 5);
});

Deno.test("nextFormPosition: cafe completes a full loop in 16 calls", () => {
  let pos = { sectionIdx: 0, barInSection: 0 };
  for (let i = 0; i < 16; i++) {
    pos = nextFormPosition(FORMS.cafe, pos).position;
  }
  assertEquals(pos, { sectionIdx: 0, barInSection: 0 });
});

Deno.test("nextFormPosition: sleepy completes a full loop in 32 calls", () => {
  let pos = { sectionIdx: 0, barInSection: 0 };
  for (let i = 0; i < 32; i++) {
    pos = nextFormPosition(FORMS.sleepy, pos).position;
  }
  assertEquals(pos, { sectionIdx: 0, barInSection: 0 });
});

Deno.test("currentSectionProg: returns the active section's prog", () => {
  const prog = currentSectionProg(FORMS.rainy, { sectionIdx: 0, barInSection: 0 });
  assertEquals(prog, FORMS.rainy[0].prog);
});

Deno.test("currentSectionProg: returns the prog of whatever section sectionIdx points to", () => {
  const prog = currentSectionProg(FORMS.rainy, { sectionIdx: 2, barInSection: 1 });
  assertEquals(prog, FORMS.rainy[2].prog);
});

Deno.test("currentSectionProg: returns DEFAULT_PROG when form is empty", () => {
  const prog = currentSectionProg([], { sectionIdx: 0, barInSection: 0 });
  assertEquals(prog, DEFAULT_PROG);
});

Deno.test("DEFAULT_PROG: is the classic 4-chord min7 cycle [0,5,8,3]", () => {
  assertEquals(DEFAULT_PROG.length, 4);
  assertEquals(DEFAULT_PROG[0], [0, "min7"]);
  assertEquals(DEFAULT_PROG[1], [5, "min7"]);
  assertEquals(DEFAULT_PROG[2], [8, "maj7"]);
  assertEquals(DEFAULT_PROG[3], [3, "min7"]);
});
