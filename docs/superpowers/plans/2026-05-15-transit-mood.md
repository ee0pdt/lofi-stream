# Transit Mood Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fifth mood `transit` — a melancholic synthwave train station with a layered ambience palette of noise beds and four distinct triggered SFX events (filter sweep, synth stab, pad swell, metallic ping).

**Architecture:** `transit` follows the same patterns as the existing four moods: config lives in `MOOD_META` / `DEFAULT_SETTINGS` / `FORMS`, ambience lives in `ambience.ts`, visual colours in `webgpu.ts` and `canvas2d.ts`, the button in `index.html`. The only structural change is widening `currentSources` in `ambience.ts` from `AudioBufferSourceNode[]` to `(AudioBufferSourceNode | OscillatorNode)[]` to accommodate the LFO used in the noise bed.

**Tech Stack:** TypeScript, Deno, Web Audio API, existing test suite (`jsr:@std/assert`)

---

## File map

| File | Change |
|---|---|
| `src/types.ts` | Add `"transit"` to `Mood` union; add `"transit"` to `Ambience` union |
| `src/music/moods.ts` | Add `transit` entry to `MOOD_META` |
| `src/music/forms.ts` | Add `transit` entry to `FORMS` |
| `src/music/settings.ts` | Add `transit` entry to `DEFAULT_SETTINGS` |
| `src/audio/ambience.ts` | Widen `currentSources`, add noise bed + 4 triggered events for transit |
| `src/visual/webgpu.ts` | Add transit entry to `MOOD_GPU` |
| `src/visual/canvas2d.ts` | Add transit entry to `MOOD_PALETTE` |
| `src/ui/mood-ui.ts` | Add transit entry to `MOOD_UI` |
| `index.html` | Add transit mood button |
| `tests/moods.test.ts` | Add `"transit"` to `MOODS` array; update ambience valid list; add transit spot-check |
| `tests/forms.test.ts` | Add `"transit"` to `MOODS` array; add transit form spot-check |
| `tests/settings.test.ts` | Add `"transit"` to `MOODS` array; add transit spot-check |

---

### Task 1: Expand type system

**Files:**
- Modify: `src/types.ts:4`
- Modify: `src/types.ts:14`

- [ ] **Step 1: Update `src/types.ts`**

Replace line 4:
```ts
export type Mood = "rainy" | "late" | "cafe" | "sleepy";
```
with:
```ts
export type Mood = "rainy" | "late" | "cafe" | "sleepy" | "transit";
```

Replace line 14:
```ts
export type Ambience = "rain" | "traffic" | "room" | "wind";
```
with:
```ts
export type Ambience = "rain" | "traffic" | "room" | "wind" | "transit";
```

- [ ] **Step 2: Verify type-check passes**

```bash
deno task check
```

Expected: no errors (no data files have been updated yet — the `Record<Mood, ...>` objects will error until subsequent tasks add the key, so do not run `deno task test` yet).

---

### Task 2: Add transit to `MOOD_META`

**Files:**
- Modify: `src/music/moods.ts`
- Modify: `tests/moods.test.ts`

- [ ] **Step 1: Update the `MOODS` constant and ambience valid list in `tests/moods.test.ts`**

Replace line 5:
```ts
const MOODS: Mood[] = ["rainy", "late", "cafe", "sleepy"];
```
with:
```ts
const MOODS: Mood[] = ["rainy", "late", "cafe", "sleepy", "transit"];
```

Replace the `validAmbience` array on line 66:
```ts
  const validAmbience = ["rain", "traffic", "room", "wind"];
```
with:
```ts
  const validAmbience = ["rain", "traffic", "room", "wind", "transit"];
```

- [ ] **Step 2: Run the mood tests to see them fail**

```bash
deno test tests/moods.test.ts
```

Expected: several tests fail — "MOOD_META: contains exactly the four expected moods" and others that iterate `MOODS`.

- [ ] **Step 3: Add `transit` entry to `MOOD_META` in `src/music/moods.ts`**

After the closing brace of the `sleepy` entry (before the final `};`), add:

```ts
  transit: {
    bpmRange: [60, 70],
    swingRange: [0.08, 0.13],
    names: ["platform 4", "last departure", "signal hold"],
    key_pool: [0, 2, 3, 5, 8],
    reverb: { dur: 4.5, decay: 0.38 },
    snareFreq: 2000,
    snareQ: 0.45,
    bassFilter: 220,
    bassAttack: 0.03,
    compTimbre: "pad",
    melTimbre: "celesta",
    ambience: "transit",
  },
```

- [ ] **Step 4: Add a transit spot-check test to `tests/moods.test.ts`**

Append at the end of the file:

```ts
Deno.test("MOOD_META.transit: spot-check known values", () => {
  const m = MOOD_META.transit;
  assertEquals(m.bpmRange, [60, 70]);
  assertEquals(m.compTimbre, "pad");
  assertEquals(m.melTimbre, "celesta");
  assertEquals(m.ambience, "transit");
  assertEquals(m.names, ["platform 4", "last departure", "signal hold"]);
});
```

- [ ] **Step 5: Run mood tests**

```bash
deno test tests/moods.test.ts
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/music/moods.ts tests/moods.test.ts
git commit -m "feat: add transit to Mood/Ambience types and MOOD_META"
```

---

### Task 3: Add transit to `FORMS`

**Files:**
- Modify: `src/music/forms.ts`
- Modify: `tests/forms.test.ts`

- [ ] **Step 1: Update the `MOODS` constant in `tests/forms.test.ts`**

Replace line 6:
```ts
const MOODS: Mood[] = ["rainy", "late", "cafe", "sleepy"];
```
with:
```ts
const MOODS: Mood[] = ["rainy", "late", "cafe", "sleepy", "transit"];
```

- [ ] **Step 2: Run forms tests to see them fail**

```bash
deno test tests/forms.test.ts
```

Expected: "FORMS: contains exactly the four expected moods" fails.

- [ ] **Step 3: Add `transit` entry to `FORMS` in `src/music/forms.ts`**

After the closing brace of the `sleepy` entry (before the final `};`), add:

```ts
  // TRANSIT — 24 bars: AABB'A'
  transit: [
    {
      bars: 8,
      prog: [
        [0, "min7"],
        [3, "maj7"],
        [5, "min9"],
        [8, "maj7"],
      ],
    }, // A home
    {
      bars: 8,
      prog: [
        [0, "min7"],
        [5, "min7"],
        [3, "maj7"],
        [8, "maj7"],
      ],
    }, // A variant
    {
      bars: 4,
      prog: [
        [0, "min9"],
        [7, "min7"],
        [3, "maj9"],
        [5, "min7"],
      ],
    }, // B lift
    {
      bars: 2,
      prog: [
        [5, "min7b5"],
        [8, "dom9"],
        [3, "maj7"],
        [0, "min7"],
      ],
    }, // B' darker
    {
      bars: 2,
      prog: [
        [0, "min7"],
        [3, "maj7"],
        [5, "min9"],
        [8, "maj7"],
      ],
    }, // A' return
  ],
```

- [ ] **Step 4: Add a transit spot-check test to `tests/forms.test.ts`**

Append at the end of the file:

```ts
Deno.test("FORMS.transit: matches the known 24-bar AABB'A' structure", () => {
  const bars = FORMS.transit.map((s) => s.bars);
  assertEquals(bars, [8, 8, 4, 2, 2]);
  assertEquals(bars.reduce((a, b) => a + b, 0), 24);
});
```

- [ ] **Step 5: Run forms tests**

```bash
deno test tests/forms.test.ts
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/music/forms.ts tests/forms.test.ts
git commit -m "feat: add transit compositional form"
```

---

### Task 4: Add transit to `DEFAULT_SETTINGS`

**Files:**
- Modify: `src/music/settings.ts`
- Modify: `tests/settings.test.ts`

- [ ] **Step 1: Update the `MOODS` constant in `tests/settings.test.ts`**

Replace line 5:
```ts
const MOODS: Mood[] = ["rainy", "late", "cafe", "sleepy"];
```
with:
```ts
const MOODS: Mood[] = ["rainy", "late", "cafe", "sleepy", "transit"];
```

- [ ] **Step 2: Run settings tests to see them fail**

```bash
deno test tests/settings.test.ts
```

Expected: "DEFAULT_SETTINGS: contains exactly the four expected moods" fails.

- [ ] **Step 3: Add `transit` entry to `DEFAULT_SETTINGS` in `src/music/settings.ts`**

After the closing brace of the `sleepy` entry (before the final `};`), add:

```ts
  transit: {
    drums: 0.75,
    bass: 0.8,
    comp: 0.85,
    melody: 0.75,
    hiss: 0.25,
    scratches: 0.6,
    hum: 0.45,
    warp: 0.6,
    ambience: 0.75,
    rain: 0,
    reverb: 0.4,
    complexity: 0.35,
    vol: 0.65,
  },
```

- [ ] **Step 4: Add a transit spot-check test to `tests/settings.test.ts`**

Append at the end of the file:

```ts
Deno.test("DEFAULT_SETTINGS.transit: spot-check known values", () => {
  const s = DEFAULT_SETTINGS.transit;
  assertEquals(s.rain, 0);
  assertEquals(s.ambience, 0.75);
  assertEquals(s.complexity, 0.35);
});
```

- [ ] **Step 5: Run settings tests**

```bash
deno test tests/settings.test.ts
```

Expected: all pass.

- [ ] **Step 6: Run the integrity tests**

```bash
deno test tests/integrity.test.ts
```

Expected: all pass (MOOD_META, FORMS, DEFAULT_SETTINGS now all have matching keys).

- [ ] **Step 7: Commit**

```bash
git add src/music/settings.ts tests/settings.test.ts
git commit -m "feat: add transit mixer defaults"
```

---

### Task 5: Add transit ambience to `ambience.ts`

**Files:**
- Modify: `src/audio/ambience.ts`

This task has no unit tests (Web Audio isn't available in Deno's test runtime). Correctness is verified by running the app in the browser in Task 8.

- [ ] **Step 1: Widen `currentSources` type**

Replace line 17:
```ts
let currentSources: AudioBufferSourceNode[] = [];
```
with:
```ts
let currentSources: (AudioBufferSourceNode | OscillatorNode)[] = [];
```

- [ ] **Step 2: Add the transit noise bed to `buildAmbienceForMood`**

In `buildAmbienceForMood`, after the closing brace of the `} else if (mood === "sleepy") {` block (before the closing `}` of the function), add:

```ts
  } else if (mood === "transit") {
    // Sub rumble — constant low-end presence
    loopedNoise(audio, 90, "lowpass", 1.5, 0.20, 0.0, dest);
    // Distant station hiss
    loopedNoise(audio, 5000, "highpass", 0.8, 0.02, 0.0, dest);

    // Mid movement layer with slow LFO filter sweep
    const moveSrc = audio.actx.createBufferSource();
    moveSrc.buffer = noiseBuffer(audio.actx, 4, true);
    moveSrc.loop = true;
    const moveFilt = audio.actx.createBiquadFilter();
    moveFilt.type = "bandpass";
    moveFilt.frequency.value = 600;
    moveFilt.Q.value = 0.4;
    const moveGain = audio.actx.createGain();
    moveGain.gain.value = 0.10;
    const movePan = audio.actx.createStereoPanner();
    movePan.pan.value = 0.1;
    // LFO: 0.03 Hz sine, ±200 Hz sweep around 600 Hz
    const lfo = audio.actx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.03;
    const lfoGain = audio.actx.createGain();
    lfoGain.gain.value = 200;
    lfo.connect(lfoGain);
    lfoGain.connect(moveFilt.frequency);
    lfo.start();
    moveSrc.connect(moveFilt);
    moveFilt.connect(moveGain);
    moveGain.connect(movePan);
    movePan.connect(dest);
    moveSrc.start();
    currentSources.push(moveSrc);
    currentSources.push(lfo);
  }
```

- [ ] **Step 3: Add the four triggered event functions**

Add the following four functions before the `buildRainLayers` export. They follow the same self-recursing pattern as `scheduleSiren` and `scheduleClink`.

```ts
function scheduleTransitSweep(audio: AudioRefs, store: Store<AppState>): void {
  if (store.get().currentMood !== "transit" || !store.get().isPlaying) return;
  const delay = randRange(25000, 55000);
  setTimeout(() => {
    if (store.get().currentMood !== "transit" || !store.get().isPlaying) return;
    const now = audio.actx.currentTime;
    const dur = randRange(5, 9);
    const o = audio.actx.createOscillator();
    const filt = audio.actx.createBiquadFilter();
    const g = audio.actx.createGain();
    const p = audio.actx.createStereoPanner();
    o.type = "sawtooth";
    o.frequency.value = randRange(60, 120);
    filt.type = "lowpass";
    filt.frequency.value = 300;
    filt.Q.value = 2.0;
    p.pan.value = randRange(-0.5, 0.5);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.08, now + 1);
    g.gain.setValueAtTime(0.08, now + dur - 1.5);
    g.gain.linearRampToValueAtTime(0, now + dur);
    o.connect(filt);
    filt.connect(g);
    g.connect(p);
    p.connect(audio.ambienceGain);
    o.start(now);
    o.stop(now + dur);
    scheduleTransitSweep(audio, store);
  }, delay);
}

function scheduleTransitStab(audio: AudioRefs, store: Store<AppState>): void {
  if (store.get().currentMood !== "transit" || !store.get().isPlaying) return;
  const delay = randRange(15000, 35000);
  setTimeout(() => {
    if (store.get().currentMood !== "transit" || !store.get().isPlaying) return;
    const now = audio.actx.currentTime;
    // Root from key_pool: offsets [0, 2, 3, 5, 8] relative to A2 (110 Hz)
    const rootFreq = 110 * Math.pow(2, pickFrom([0, 2, 3, 5, 8]) / 12);
    const detunes = [0, 8, -8];
    detunes.forEach((detuneCents) => {
      const o = audio.actx.createOscillator();
      const g = audio.actx.createGain();
      o.type = "sine";
      o.frequency.value = rootFreq * Math.pow(2, detuneCents / 1200);
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.05, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
      o.connect(g);
      g.connect(audio.ambienceGain);
      o.start(now);
      o.stop(now + 0.45);
    });
    scheduleTransitStab(audio, store);
  }, delay);
}

function scheduleTransitSwell(audio: AudioRefs, store: Store<AppState>): void {
  if (store.get().currentMood !== "transit" || !store.get().isPlaying) return;
  const delay = randRange(40000, 80000);
  setTimeout(() => {
    if (store.get().currentMood !== "transit" || !store.get().isPlaying) return;
    const now = audio.actx.currentTime;
    const totalDur = 4 + 3 + 4; // fade-in + hold + fade-out
    [0, 6].forEach((detuneCents) => {
      const o = audio.actx.createOscillator();
      const filt = audio.actx.createBiquadFilter();
      const g = audio.actx.createGain();
      o.type = "sawtooth";
      o.frequency.value = 110 * Math.pow(2, detuneCents / 1200);
      filt.type = "lowpass";
      filt.frequency.value = 400;
      filt.Q.value = 1.0;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.06, now + 4);
      g.gain.setValueAtTime(0.06, now + 7);
      g.gain.linearRampToValueAtTime(0, now + totalDur);
      o.connect(filt);
      filt.connect(g);
      g.connect(audio.ambienceGain);
      o.start(now);
      o.stop(now + totalDur);
    });
    scheduleTransitSwell(audio, store);
  }, delay);
}

function scheduleTransitPing(audio: AudioRefs, store: Store<AppState>): void {
  if (store.get().currentMood !== "transit" || !store.get().isPlaying) return;
  const delay = randRange(20000, 45000);
  setTimeout(() => {
    if (store.get().currentMood !== "transit" || !store.get().isPlaying) return;
    const now = audio.actx.currentTime;
    const freq = randRange(2000, 4000);
    const o = audio.actx.createOscillator();
    const g = audio.actx.createGain();
    const p = audio.actx.createStereoPanner();
    o.type = "sine";
    o.frequency.value = freq;
    p.pan.value = randRange(-0.3, 0.3);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.04, now + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 2);
    o.connect(g);
    g.connect(p);
    p.connect(audio.ambienceGain);
    o.start(now);
    o.stop(now + 2.1);
    scheduleTransitPing(audio, store);
  }, delay);
}
```

- [ ] **Step 4: Wire the transit events in `startAmbience`**

In `startAmbience`, after the `if (mood === "cafe") scheduleClink(audio, store);` line, add:

```ts
    if (mood === "transit") {
      scheduleTransitSweep(audio, store);
      scheduleTransitStab(audio, store);
      scheduleTransitSwell(audio, store);
      scheduleTransitPing(audio, store);
    }
```

- [ ] **Step 5: Type-check**

```bash
deno task check
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/audio/ambience.ts
git commit -m "feat: add transit ambience — noise bed, sweep, stab, swell, ping"
```

---

### Task 6: Add transit visual colours

**Files:**
- Modify: `src/visual/webgpu.ts`
- Modify: `src/visual/canvas2d.ts`

- [ ] **Step 1: Add transit entry to `MOOD_GPU` in `src/visual/webgpu.ts`**

After the `sleepy` entry in `MOOD_GPU` (before the closing `};`), add:

```ts
  transit: {
    base: [0.1, 0.04, 0.18],
    blobs: [
      [270, 60, 45, 0.5],
      [290, 50, 50, 0.42],
      [250, 45, 40, 0.35],
    ],
  },
```

(The base `[0.1, 0.04, 0.18]` is the linear-light equivalent of `#1a0a2e`.)

- [ ] **Step 2: Add transit entry to `MOOD_PALETTE` in `src/visual/canvas2d.ts`**

After the `sleepy` entry in `MOOD_PALETTE` (before the closing `};`), add:

```ts
  transit: {
    base: "#1a0a2e",
    blobs: [
      [270, 60, 45],
      [290, 50, 50],
      [250, 45, 40],
    ],
  },
```

- [ ] **Step 3: Type-check**

```bash
deno task check
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/visual/webgpu.ts src/visual/canvas2d.ts
git commit -m "feat: add transit visual palette — deep indigo/purple"
```

---

### Task 7: Add transit mood button and UI palette

**Files:**
- Modify: `src/ui/mood-ui.ts`
- Modify: `index.html`

- [ ] **Step 1: Add transit entry to `MOOD_UI` in `src/ui/mood-ui.ts`**

After the `sleepy` entry in `MOOD_UI` (before the closing `};`), add:

```ts
  transit: { warm: "#7b2fff", warm2: "#a06fff" },
```

- [ ] **Step 2: Add transit button to `index.html`**

After line 505:
```html
          <button class="mood-btn" data-mood="sleepy">sleepy</button>
```
add:
```html
          <button class="mood-btn" data-mood="transit">transit</button>
```

- [ ] **Step 3: Type-check**

```bash
deno task check
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/ui/mood-ui.ts index.html
git commit -m "feat: add transit mood button and accent palette"
```

---

### Task 8: Full test suite + browser smoke test

- [ ] **Step 1: Run the full test suite**

```bash
deno task check && deno task test
```

Expected: all 96+ tests pass, 0 failed.

- [ ] **Step 2: Start the dev server**

```bash
deno task dev
```

Open `http://localhost:8000` in a browser.

- [ ] **Step 3: Smoke test checklist**

- [ ] Click **transit** button — mood switches, background shifts to deep indigo/purple, accent colour updates
- [ ] Track name cycles through "platform 4", "last departure", "signal hold"
- [ ] Ambience slider audibly affects the noise bed
- [ ] Wait ~30 s — a sweep, stab, ping, or swell fires (may take up to 80 s for swell)
- [ ] Switch away from transit mid-SFX — events stop, no orphaned audio
- [ ] Switch back — new events schedule correctly
- [ ] Pause + resume — no duplicate events

- [ ] **Step 4: Commit any fixes found during smoke test, then final commit**

```bash
git add -p
git commit -m "fix: <describe any issues found>"
```
