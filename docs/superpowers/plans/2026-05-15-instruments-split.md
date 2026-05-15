# Instruments Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the 588-line `src/audio/instruments.ts` into focused single-purpose modules: pure math utilities, one file per timbre, voice dispatchers, and DOM flash helper — deleting `instruments.ts` entirely.

**Architecture:** Pure code-move — no logic changes. Each step ends with `deno task check && deno task test && deno task build` green. We move functions incrementally: create the destination file, re-export from `instruments.ts` so nothing breaks, then at the end delete `instruments.ts` and fix all import sites in one sweep.

**Tech Stack:** TypeScript, Deno 2.x, Web Audio API. Run all commands with `export PATH="$HOME/.deno/bin:$PATH"` if `deno` is not found.

**Spec:** `docs/superpowers/specs/2026-05-15-instruments-split-design.md`

---

## Pre-flight

### Task 0: Verify clean baseline

**Files:** none

- [ ] **Step 1: Check working tree is clean and tests pass**

```bash
export PATH="$HOME/.deno/bin:$PATH"
git status --short
deno task check && deno task test && deno task build
```

Expected: `git status` empty, all three commands pass.

---

## Task 1: Create `src/audio/timing.ts`

**Files:**
- Create: `src/audio/timing.ts`
- Modify: `src/audio/instruments.ts` (replace definitions with re-exports)
- Modify: `src/audio/scheduler.ts` (update import)

- [ ] **Step 1: Create `src/audio/timing.ts`**

```ts
export function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export function beatDur(bpm: number): number {
  return 60 / bpm;
}

export function swungTime(
  i: number,
  barStart: number,
  bpm: number,
  swingAmount: number,
): number {
  const sd = beatDur(bpm) / 4;
  return barStart + i * sd + (i % 2 === 1 ? swingAmount * sd : 0);
}
```

- [ ] **Step 2: Replace the three functions in `instruments.ts` with re-exports**

Find and replace the `midiToFreq`, `beatDur`, and `swungTime` function bodies in `src/audio/instruments.ts`. Remove the three function declarations entirely and add this line near the top of the file (after the existing imports):

```ts
export { beatDur, midiToFreq, swungTime } from "./timing.ts";
```

Also remove the `beatDur` call inside `swungTime` since that function no longer lives here.

- [ ] **Step 3: Update `scheduler.ts` import**

In `src/audio/scheduler.ts`, change:

```ts
import {
  beatDur,
  playBass,
  playComp,
  playHat,
  playKick,
  playMelody,
  playSnare,
  swungTime,
} from "./instruments.ts";
```

to:

```ts
import { beatDur, swungTime } from "./timing.ts";
import {
  playBass,
  playComp,
  playHat,
  playKick,
  playMelody,
  playSnare,
} from "./instruments.ts";
```

- [ ] **Step 4: Verify**

```bash
export PATH="$HOME/.deno/bin:$PATH"
deno task check && deno task test && deno task build
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/audio/timing.ts src/audio/instruments.ts src/audio/scheduler.ts
git commit -m "refactor(audio): extract timing utilities to src/audio/timing.ts"
```

---

## Task 2: Create `src/ui/flash.ts`

**Files:**
- Create: `src/ui/flash.ts`
- Modify: `src/audio/instruments.ts` (replace definition with re-export)

- [ ] **Step 1: Create `src/ui/flash.ts`**

```ts
const FLASH_DUR = 80;

/**
 * Fire a brief CSS flash on the given mixer-row's range input at the
 * wall-clock moment when the audio event plays. No-ops if the event is
 * already more than 50ms in the past.
 */
export function flashRow(
  actx: AudioContext,
  rowId: string,
  scheduledAudioTime: number,
  duration = FLASH_DUR,
): void {
  const delayMs = (scheduledAudioTime - actx.currentTime) * 1000;
  if (delayMs < -50) return;
  setTimeout(() => {
    const row = document.getElementById(rowId);
    if (!row) return;
    const input = row.querySelector("input[type=range]");
    if (!input) return;
    input.classList.add("flash");
    setTimeout(() => input.classList.remove("flash"), duration);
  }, Math.max(0, delayMs));
}
```

- [ ] **Step 2: Replace `flashRow` and `FLASH_DUR` in `instruments.ts` with a re-export**

Remove the `const FLASH_DUR = 80;` line and the entire `flashRow` function body from `src/audio/instruments.ts`, and add:

```ts
export { flashRow } from "../ui/flash.ts";
```

- [ ] **Step 3: Verify**

```bash
export PATH="$HOME/.deno/bin:$PATH"
deno task check && deno task test && deno task build
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/ui/flash.ts src/audio/instruments.ts
git commit -m "refactor(ui): extract flashRow to src/ui/flash.ts"
```

---

## Task 3: Create `src/audio/timbres/kick.ts`

**Files:**
- Create: `src/audio/timbres/kick.ts`
- Modify: `src/audio/instruments.ts` (replace definition with re-export)

Note: `roleRouting` is a private helper used only by harmonic timbres (not kick/snare/hat). It stays in `instruments.ts` for now and will be inlined into each harmonic timbre file later.

- [ ] **Step 1: Create `src/audio/timbres/kick.ts`**

```ts
import { makeSpatial, noiseBuffer } from "../graph.ts";
import { flashRow } from "../../ui/flash.ts";
import type { AudioRefs, Mood } from "../../types.ts";

export function playKick(audio: AudioRefs, time: number, mood: Mood): void {
  flashRow(audio.actx, "mx-drums", time, 120);
  const vel = mood === "sleepy" ? 0.38 : 0.55;
  const o = audio.actx.createOscillator();
  const g = audio.actx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(180, time);
  o.frequency.exponentialRampToValueAtTime(38, time + 0.18);
  g.gain.setValueAtTime(vel, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.28);
  const sp = makeSpatial(audio, "kick");
  o.connect(g);
  g.connect(sp.input);
  sp.output.connect(audio.trackGains.drums);
  o.start(time);
  o.stop(time + 0.3);
  const b = noiseBuffer(audio.actx, 0.008);
  const src = audio.actx.createBufferSource();
  src.buffer = b;
  const cg = audio.actx.createGain();
  cg.gain.value = 0.1;
  src.connect(cg);
  cg.connect(sp.input);
  src.start(time);
}
```

- [ ] **Step 2: Replace `playKick` in `instruments.ts` with a re-export**

Remove the `playKick` function body and add:

```ts
export { playKick } from "./timbres/kick.ts";
```

- [ ] **Step 3: Verify**

```bash
export PATH="$HOME/.deno/bin:$PATH"
deno task check && deno task test && deno task build
```

- [ ] **Step 4: Commit**

```bash
git add src/audio/timbres/kick.ts src/audio/instruments.ts
git commit -m "refactor(audio): extract playKick to timbres/kick.ts"
```

---

## Task 4: Create `src/audio/timbres/snare.ts`

**Files:**
- Create: `src/audio/timbres/snare.ts`
- Modify: `src/audio/instruments.ts`

- [ ] **Step 1: Create `src/audio/timbres/snare.ts`**

```ts
import { MOOD_META } from "../../music/moods.ts";
import { makeSpatial, noiseBuffer } from "../graph.ts";
import { flashRow } from "../../ui/flash.ts";
import type { AudioRefs, Mood } from "../../types.ts";

export function playSnare(
  audio: AudioRefs,
  time: number,
  mood: Mood,
  ghost = false,
): void {
  if (!ghost) flashRow(audio.actx, "mx-drums", time, 80);
  const m = MOOD_META[mood];
  const vol = ghost ? 0.04 : mood === "sleepy" ? 0.09 : 0.15;
  const b = noiseBuffer(audio.actx, 0.18);
  const src = audio.actx.createBufferSource();
  src.buffer = b;
  const filt = audio.actx.createBiquadFilter();
  filt.type = "bandpass";
  filt.frequency.value = m.snareFreq;
  filt.Q.value = m.snareQ;
  const g = audio.actx.createGain();
  g.gain.setValueAtTime(vol, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.15);
  const sp = makeSpatial(audio, "snare");
  src.connect(filt);
  filt.connect(g);
  g.connect(sp.input);
  sp.output.connect(audio.trackGains.drums);
  src.start(time);
}
```

- [ ] **Step 2: Replace `playSnare` in `instruments.ts` with a re-export**

```ts
export { playSnare } from "./timbres/snare.ts";
```

- [ ] **Step 3: Verify**

```bash
export PATH="$HOME/.deno/bin:$PATH"
deno task check && deno task test && deno task build
```

- [ ] **Step 4: Commit**

```bash
git add src/audio/timbres/snare.ts src/audio/instruments.ts
git commit -m "refactor(audio): extract playSnare to timbres/snare.ts"
```

---

## Task 5: Create `src/audio/timbres/hat.ts`

**Files:**
- Create: `src/audio/timbres/hat.ts`
- Modify: `src/audio/instruments.ts`

- [ ] **Step 1: Create `src/audio/timbres/hat.ts`**

```ts
import { makeSpatial, noiseBuffer } from "../graph.ts";
import { flashRow } from "../../ui/flash.ts";
import type { AudioRefs, Mood } from "../../types.ts";

export function playHat(
  audio: AudioRefs,
  time: number,
  mood: Mood,
  open = false,
  vol = 0.06,
): void {
  flashRow(audio.actx, "mx-drums", time, 40);
  const moodVol = { rainy: 1, late: 0.9, cafe: 0.7, sleepy: 0.5, transit: 0.6 }[mood] ?? 1;
  const len = open ? 0.22 : 0.04;
  const b = noiseBuffer(audio.actx, len);
  const src = audio.actx.createBufferSource();
  src.buffer = b;
  const filt = audio.actx.createBiquadFilter();
  filt.type = "highpass";
  filt.frequency.value = mood === "cafe" ? 11000 : 9000;
  const g = audio.actx.createGain();
  g.gain.setValueAtTime(vol * moodVol, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + len * 0.85);
  const sp = makeSpatial(audio, "hat");
  src.connect(filt);
  filt.connect(g);
  g.connect(sp.input);
  sp.output.connect(audio.trackGains.drums);
  src.start(time);
}
```

- [ ] **Step 2: Replace `playHat` in `instruments.ts` with a re-export**

```ts
export { playHat } from "./timbres/hat.ts";
```

- [ ] **Step 3: Verify**

```bash
export PATH="$HOME/.deno/bin:$PATH"
deno task check && deno task test && deno task build
```

- [ ] **Step 4: Commit**

```bash
git add src/audio/timbres/hat.ts src/audio/instruments.ts
git commit -m "refactor(audio): extract playHat to timbres/hat.ts"
```

---

## Task 6: Create `src/audio/timbres/rhodes.ts`

**Files:**
- Create: `src/audio/timbres/rhodes.ts`
- Modify: `src/audio/instruments.ts`

Note: `roleRouting` is a private 3-line helper inlined in each harmonic timbre file.

- [ ] **Step 1: Create `src/audio/timbres/rhodes.ts`**

```ts
import { applyWarp, makeHaasSpatial } from "../graph.ts";
import { midiToFreq } from "../timing.ts";
import { flashRow } from "../../ui/flash.ts";
import type { AudioRefs } from "../../types.ts";

function roleRouting(role: string): { trackKey: string; rowId: string } {
  return role === "rhodesMel"
    ? { trackKey: "melody", rowId: "mx-melody" }
    : { trackKey: "comp", rowId: "mx-comp" };
}

export function playRhodes(
  audio: AudioRefs,
  midi: number,
  time: number,
  dur: number,
  vel = 0.16,
  role = "rhodesComp",
): void {
  const { trackKey, rowId } = roleRouting(role);
  const sp = makeHaasSpatial(audio, role);
  sp.output.connect(audio.trackGains[trackKey]);
  const partials: ReadonlyArray<readonly [number, OscillatorType]> = [
    [midiToFreq(midi), "sine"],
    [midiToFreq(midi) * 1.004, "sine"],
    [midiToFreq(midi) * 0.997, "triangle"],
  ];
  partials.forEach(([f, type], i) => {
    if (i === 0) flashRow(audio.actx, rowId, time, 120);
    const o = audio.actx.createOscillator();
    const g = audio.actx.createGain();
    const filt = audio.actx.createBiquadFilter();
    o.type = type;
    o.frequency.value = f;
    applyWarp(audio, o);
    const v = vel * (i === 2 ? 0.3 : 1);
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(v, time + 0.008);
    g.gain.exponentialRampToValueAtTime(v * 0.55, time + 0.06);
    g.gain.setValueAtTime(v * 0.55, time + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur * 0.95);
    filt.type = "lowpass";
    filt.frequency.setValueAtTime(1800, time);
    filt.frequency.exponentialRampToValueAtTime(700, time + dur * 0.7);
    filt.Q.value = 0.8;
    o.connect(filt);
    filt.connect(g);
    g.connect(sp.input);
    o.start(time);
    o.stop(time + dur + 0.05);
  });
}
```

- [ ] **Step 2: Replace `playRhodes` in `instruments.ts` with a re-export**

```ts
export { playRhodes } from "./timbres/rhodes.ts";
```

Also remove the `roleRouting` function from `instruments.ts` — it will be inlined in each harmonic timbre file as we move them. Leave it in place for now; it will naturally disappear as each timbre is moved out.

- [ ] **Step 3: Verify**

```bash
export PATH="$HOME/.deno/bin:$PATH"
deno task check && deno task test && deno task build
```

- [ ] **Step 4: Commit**

```bash
git add src/audio/timbres/rhodes.ts src/audio/instruments.ts
git commit -m "refactor(audio): extract playRhodes to timbres/rhodes.ts"
```

---

## Task 7: Create `src/audio/timbres/vibraphone.ts`

**Files:**
- Create: `src/audio/timbres/vibraphone.ts`
- Modify: `src/audio/instruments.ts`

- [ ] **Step 1: Create `src/audio/timbres/vibraphone.ts`**

```ts
import { applyWarp, makeHaasSpatial } from "../graph.ts";
import { midiToFreq } from "../timing.ts";
import { flashRow } from "../../ui/flash.ts";
import type { AudioRefs } from "../../types.ts";

function roleRouting(role: string): { trackKey: string; rowId: string } {
  return role === "rhodesMel"
    ? { trackKey: "melody", rowId: "mx-melody" }
    : { trackKey: "comp", rowId: "mx-comp" };
}

export function playVibraphone(
  audio: AudioRefs,
  midi: number,
  time: number,
  dur: number,
  vel = 0.14,
  role = "rhodesComp",
): void {
  const { trackKey, rowId } = roleRouting(role);
  const sp = makeHaasSpatial(audio, role);
  sp.output.connect(audio.trackGains[trackKey]);
  const f = midiToFreq(midi);
  [
    [f, 0.9],
    [f * 2, 0.12],
  ].forEach(([freq, relVel], idx) => {
    if (idx === 0) flashRow(audio.actx, rowId, time, 120);
    const o = audio.actx.createOscillator();
    const g = audio.actx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    applyWarp(audio, o);
    const v = vel * relVel;
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(v, time + 0.005);
    g.gain.exponentialRampToValueAtTime(v * 0.3, time + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur * 1.4);
    o.connect(g);
    g.connect(sp.input);
    o.start(time);
    o.stop(time + dur * 1.5);
  });
}
```

- [ ] **Step 2: Replace `playVibraphone` in `instruments.ts` with a re-export**

```ts
export { playVibraphone } from "./timbres/vibraphone.ts";
```

- [ ] **Step 3: Verify**

```bash
export PATH="$HOME/.deno/bin:$PATH"
deno task check && deno task test && deno task build
```

- [ ] **Step 4: Commit**

```bash
git add src/audio/timbres/vibraphone.ts src/audio/instruments.ts
git commit -m "refactor(audio): extract playVibraphone to timbres/vibraphone.ts"
```

---

## Task 8: Create `src/audio/timbres/guitar.ts`

**Files:**
- Create: `src/audio/timbres/guitar.ts`
- Modify: `src/audio/instruments.ts`

- [ ] **Step 1: Create `src/audio/timbres/guitar.ts`**

```ts
import { applyWarp, makeHaasSpatial } from "../graph.ts";
import { midiToFreq } from "../timing.ts";
import { flashRow } from "../../ui/flash.ts";
import type { AudioRefs } from "../../types.ts";

function roleRouting(role: string): { trackKey: string; rowId: string } {
  return role === "rhodesMel"
    ? { trackKey: "melody", rowId: "mx-melody" }
    : { trackKey: "comp", rowId: "mx-comp" };
}

export function playGuitar(
  audio: AudioRefs,
  midi: number,
  time: number,
  dur: number,
  vel = 0.18,
  role = "rhodesComp",
): void {
  const { trackKey, rowId } = roleRouting(role);
  const sp = makeHaasSpatial(audio, role);
  sp.output.connect(audio.trackGains[trackKey]);
  const f = midiToFreq(midi);
  [
    [f, 1],
    [f * 2, 0.4],
    [f * 3, 0.18],
    [f * 4, 0.08],
  ].forEach(([freq, relVel], idx) => {
    if (idx === 0) flashRow(audio.actx, rowId, time, 80);
    const o = audio.actx.createOscillator();
    const g = audio.actx.createGain();
    const filt = audio.actx.createBiquadFilter();
    o.type = idx < 2 ? "sawtooth" : "sine";
    o.frequency.value = freq;
    applyWarp(audio, o);
    const v = vel * relVel;
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(v, time + 0.003);
    g.gain.exponentialRampToValueAtTime(v * 0.08, time + 0.09);
    g.gain.exponentialRampToValueAtTime(0.0001, time + Math.min(dur, 0.6));
    filt.type = "lowpass";
    filt.frequency.setValueAtTime(5000, time);
    filt.frequency.exponentialRampToValueAtTime(800, time + 0.08);
    filt.Q.value = 0.5;
    o.connect(filt);
    filt.connect(g);
    g.connect(sp.input);
    o.start(time);
    o.stop(time + Math.min(dur, 0.65));
  });
}
```

- [ ] **Step 2: Replace `playGuitar` in `instruments.ts` with a re-export**

```ts
export { playGuitar } from "./timbres/guitar.ts";
```

- [ ] **Step 3: Verify**

```bash
export PATH="$HOME/.deno/bin:$PATH"
deno task check && deno task test && deno task build
```

- [ ] **Step 4: Commit**

```bash
git add src/audio/timbres/guitar.ts src/audio/instruments.ts
git commit -m "refactor(audio): extract playGuitar to timbres/guitar.ts"
```

---

## Task 9: Create `src/audio/timbres/pad.ts`

**Files:**
- Create: `src/audio/timbres/pad.ts`
- Modify: `src/audio/instruments.ts`

- [ ] **Step 1: Create `src/audio/timbres/pad.ts`**

```ts
import { applyWarp, makeHaasSpatial } from "../graph.ts";
import { beatDur, midiToFreq } from "../timing.ts";
import { flashRow } from "../../ui/flash.ts";
import type { AudioRefs } from "../../types.ts";

function roleRouting(role: string): { trackKey: string; rowId: string } {
  return role === "rhodesMel"
    ? { trackKey: "melody", rowId: "mx-melody" }
    : { trackKey: "comp", rowId: "mx-comp" };
}

export function playPad(
  audio: AudioRefs,
  midi: number,
  time: number,
  dur: number,
  vel = 0.1,
  role = "rhodesComp",
  bpm = 80,
): void {
  const { trackKey, rowId } = roleRouting(role);
  const sp = makeHaasSpatial(audio, role);
  sp.output.connect(audio.trackGains[trackKey]);
  const f = midiToFreq(midi);
  const bd = beatDur(bpm);
  [
    [f, 1],
    [f * 1.002, 0.7],
    [f * 0.998, 0.7],
  ].forEach(([freq], idx) => {
    if (idx === 0) flashRow(audio.actx, rowId, time, 300);
    const o = audio.actx.createOscillator();
    const g = audio.actx.createGain();
    const filt = audio.actx.createBiquadFilter();
    o.type = "sine";
    o.frequency.value = freq;
    applyWarp(audio, o);
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(vel, time + bd * 0.8);
    g.gain.setValueAtTime(vel, time + dur * 0.6);
    g.gain.linearRampToValueAtTime(0, time + dur + bd * 0.5);
    filt.type = "lowpass";
    filt.frequency.value = 900;
    filt.Q.value = 0.4;
    o.connect(filt);
    filt.connect(g);
    g.connect(sp.input);
    o.start(time);
    o.stop(time + dur + bd * 0.6);
  });
}
```

- [ ] **Step 2: Replace `playPad` in `instruments.ts` with a re-export**

```ts
export { playPad } from "./timbres/pad.ts";
```

- [ ] **Step 3: Verify**

```bash
export PATH="$HOME/.deno/bin:$PATH"
deno task check && deno task test && deno task build
```

- [ ] **Step 4: Commit**

```bash
git add src/audio/timbres/pad.ts src/audio/instruments.ts
git commit -m "refactor(audio): extract playPad to timbres/pad.ts"
```

---

## Task 10: Create `src/audio/timbres/celesta.ts`

**Files:**
- Create: `src/audio/timbres/celesta.ts`
- Modify: `src/audio/instruments.ts`

- [ ] **Step 1: Create `src/audio/timbres/celesta.ts`**

```ts
import { applyWarp, buildIR, makeHaasSpatial } from "../graph.ts";
import { midiToFreq } from "../timing.ts";
import { flashRow } from "../../ui/flash.ts";
import type { AudioRefs } from "../../types.ts";

function roleRouting(role: string): { trackKey: string; rowId: string } {
  return role === "rhodesMel"
    ? { trackKey: "melody", rowId: "mx-melody" }
    : { trackKey: "comp", rowId: "mx-comp" };
}

let cachedCelestaIR: AudioBuffer | null = null;

export function playCelesta(
  audio: AudioRefs,
  midi: number,
  time: number,
  dur: number,
  vel = 0.1,
  role = "rhodesComp",
): void {
  const { trackKey, rowId } = roleRouting(role);
  flashRow(audio.actx, rowId, time, 90);
  const f = midiToFreq(midi + 12);
  const o = audio.actx.createOscillator();
  const g = audio.actx.createGain();
  o.type = "sine";
  o.frequency.value = f;
  applyWarp(audio, o);
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(vel * 0.6, time + 0.004);
  g.gain.exponentialRampToValueAtTime(vel * 0.08, time + 0.2);
  g.gain.exponentialRampToValueAtTime(0.0001, time + Math.min(dur * 0.9, 1.2));
  if (cachedCelestaIR === null) cachedCelestaIR = buildIR(audio, 1.5, 0.6);
  const reverb2 = audio.actx.createConvolver();
  reverb2.buffer = cachedCelestaIR;
  const rv = audio.actx.createGain();
  rv.gain.value = 0.5;
  const sp = makeHaasSpatial(audio, role);
  o.connect(g);
  g.connect(sp.input);
  sp.output.connect(audio.trackGains[trackKey]);
  g.connect(rv);
  rv.connect(reverb2);
  reverb2.connect(audio.trackGains[trackKey]);
  o.start(time);
  o.stop(time + Math.min(dur, 1.3));
}
```

- [ ] **Step 2: Replace `playCelesta` and `cachedCelestaIR` in `instruments.ts`**

Remove `let cachedCelestaIR: AudioBuffer | null = null;` and the `playCelesta` function body. Add:

```ts
export { playCelesta } from "./timbres/celesta.ts";
```

- [ ] **Step 3: Verify**

```bash
export PATH="$HOME/.deno/bin:$PATH"
deno task check && deno task test && deno task build
```

- [ ] **Step 4: Commit**

```bash
git add src/audio/timbres/celesta.ts src/audio/instruments.ts
git commit -m "refactor(audio): extract playCelesta to timbres/celesta.ts"
```

---

## Task 11: Create `src/audio/timbres/bell.ts`

**Files:**
- Create: `src/audio/timbres/bell.ts`
- Modify: `src/audio/instruments.ts`

- [ ] **Step 1: Create `src/audio/timbres/bell.ts`**

```ts
import { applyWarp, makeHaasSpatial } from "../graph.ts";
import { midiToFreq } from "../timing.ts";
import { flashRow } from "../../ui/flash.ts";
import type { AudioRefs } from "../../types.ts";

function roleRouting(role: string): { trackKey: string; rowId: string } {
  return role === "rhodesMel"
    ? { trackKey: "melody", rowId: "mx-melody" }
    : { trackKey: "comp", rowId: "mx-comp" };
}

export function playBell(
  audio: AudioRefs,
  midi: number,
  time: number,
  dur: number,
  vel = 0.1,
  role = "rhodesComp",
): void {
  const { trackKey, rowId } = roleRouting(role);
  const sp = makeHaasSpatial(audio, role);
  sp.output.connect(audio.trackGains[trackKey]);
  const f = midiToFreq(midi + 12);
  const harmonics: [number, number][] = [
    [f, 1.0],
    [f * 2, 0.35],
    [f * 3, 0.12],
  ];
  harmonics.forEach(([freq, amp], idx) => {
    if (idx === 0) flashRow(audio.actx, rowId, time, 120);
    const o = audio.actx.createOscillator();
    const g = audio.actx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    applyWarp(audio, o);
    const decayTime = Math.max(0.4, Math.min(dur * 0.85, 2.5)) * (1 - idx * 0.2);
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(vel * amp, time + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, time + decayTime);
    o.connect(g);
    g.connect(sp.input);
    o.start(time);
    o.stop(time + decayTime + 0.05);
  });
}
```

- [ ] **Step 2: Replace `playBell` in `instruments.ts` with a re-export**

```ts
export { playBell } from "./timbres/bell.ts";
```

- [ ] **Step 3: Verify**

```bash
export PATH="$HOME/.deno/bin:$PATH"
deno task check && deno task test && deno task build
```

- [ ] **Step 4: Commit**

```bash
git add src/audio/timbres/bell.ts src/audio/instruments.ts
git commit -m "refactor(audio): extract playBell to timbres/bell.ts"
```

---

## Task 12: Create `src/audio/timbres/coldsynth.ts`

**Files:**
- Create: `src/audio/timbres/coldsynth.ts`
- Modify: `src/audio/instruments.ts`

- [ ] **Step 1: Create `src/audio/timbres/coldsynth.ts`**

```ts
import { applyWarp, makeHaasSpatial } from "../graph.ts";
import { beatDur, midiToFreq } from "../timing.ts";
import { flashRow } from "../../ui/flash.ts";
import type { AudioRefs } from "../../types.ts";

function roleRouting(role: string): { trackKey: string; rowId: string } {
  return role === "rhodesMel"
    ? { trackKey: "melody", rowId: "mx-melody" }
    : { trackKey: "comp", rowId: "mx-comp" };
}

export function playColdsynth(
  audio: AudioRefs,
  midi: number,
  time: number,
  dur: number,
  vel = 0.1,
  role = "rhodesComp",
  bpm = 80,
): void {
  const { trackKey, rowId } = roleRouting(role);
  const sp = makeHaasSpatial(audio, role);
  sp.output.connect(audio.trackGains[trackKey]);
  const f = midiToFreq(midi);
  const bd = beatDur(bpm);
  [
    [f, 1.0],
    [f * 1.003, 0.8],
    [f * 0.997, 0.8],
  ].forEach(([freq], idx) => {
    if (idx === 0) flashRow(audio.actx, rowId, time, 300);
    const o = audio.actx.createOscillator();
    const g = audio.actx.createGain();
    const filt = audio.actx.createBiquadFilter();
    o.type = "sawtooth";
    o.frequency.value = freq;
    applyWarp(audio, o);
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(vel, time + 0.05);
    g.gain.setValueAtTime(vel, time + dur);
    g.gain.linearRampToValueAtTime(0, time + dur + bd * 0.8);
    filt.type = "lowpass";
    filt.frequency.value = 1600;
    filt.Q.value = 0.6;
    o.connect(filt);
    filt.connect(g);
    g.connect(sp.input);
    o.start(time);
    o.stop(time + dur + bd * 0.9);
  });
}
```

- [ ] **Step 2: Replace `playColdsynth` in `instruments.ts` with a re-export**

```ts
export { playColdsynth } from "./timbres/coldsynth.ts";
```

Also remove the `roleRouting` function from `instruments.ts` — every harmonic timbre that used it has now been moved. Verify it no longer appears in any remaining `instruments.ts` function body before deleting it.

- [ ] **Step 3: Verify**

```bash
export PATH="$HOME/.deno/bin:$PATH"
deno task check && deno task test && deno task build
```

- [ ] **Step 4: Commit**

```bash
git add src/audio/timbres/coldsynth.ts src/audio/instruments.ts
git commit -m "refactor(audio): extract playColdsynth to timbres/coldsynth.ts"
```

---

## Task 13: Create `src/audio/voices.ts`

**Files:**
- Create: `src/audio/voices.ts`
- Modify: `src/audio/instruments.ts`

- [ ] **Step 1: Create `src/audio/voices.ts`**

```ts
import { MOOD_META } from "../music/moods.ts";
import { makeSpatial } from "./graph.ts";
import { midiToFreq } from "./timing.ts";
import { flashRow } from "../ui/flash.ts";
import { applyWarp } from "./graph.ts";
import { playRhodes } from "./timbres/rhodes.ts";
import { playVibraphone } from "./timbres/vibraphone.ts";
import { playGuitar } from "./timbres/guitar.ts";
import { playPad } from "./timbres/pad.ts";
import { playCelesta } from "./timbres/celesta.ts";
import { playBell } from "./timbres/bell.ts";
import { playColdsynth } from "./timbres/coldsynth.ts";
import type { AudioRefs, Mood } from "../types.ts";

export function playComp(
  audio: AudioRefs,
  midi: number,
  time: number,
  dur: number,
  vel: number,
  role: string,
  mood: Mood,
  bpm: number,
): void {
  const t = MOOD_META[mood].compTimbre;
  if (t === "vibraphone") playVibraphone(audio, midi, time, dur, vel, role);
  else if (t === "guitar") playGuitar(audio, midi, time, dur, vel, role);
  else if (t === "pad") playPad(audio, midi, time, dur, vel, role, bpm);
  else if (t === "coldsynth") playColdsynth(audio, midi, time, dur, vel, role, bpm);
  else playRhodes(audio, midi, time, dur, vel, role);
}

export function playMelody(
  audio: AudioRefs,
  midi: number,
  time: number,
  dur: number,
  vel: number,
  role: string,
  mood: Mood,
): void {
  const t = MOOD_META[mood].melTimbre;
  if (t === "vibraphone") playVibraphone(audio, midi, time, dur, vel, role);
  else if (t === "celesta") playCelesta(audio, midi, time, dur, vel, role);
  else if (t === "bell") playBell(audio, midi, time, dur, vel, role);
  else playRhodes(audio, midi, time, dur, vel, role);
}

export function playBass(
  audio: AudioRefs,
  midi: number,
  time: number,
  dur: number,
  vel = 0.28,
  mood: Mood = "rainy",
): void {
  if (vel >= 0.28) flashRow(audio.actx, "mx-bass", time, 100);
  const m = MOOD_META[mood];
  const o = audio.actx.createOscillator();
  const o2 = audio.actx.createOscillator();
  const g = audio.actx.createGain();
  const filt = audio.actx.createBiquadFilter();
  o.type = "triangle";
  o2.type = "sine";
  o.frequency.value = midiToFreq(midi);
  o2.frequency.value = midiToFreq(midi - 12);
  applyWarp(audio, o);
  applyWarp(audio, o2);
  filt.type = "lowpass";
  filt.frequency.value = m.bassFilter;
  filt.Q.value = 1.1;
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(vel, time + m.bassAttack);
  g.gain.setValueAtTime(vel * 0.75, time + 0.1);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur * 0.88);
  const sp = makeSpatial(audio, "bass");
  o.connect(filt);
  o2.connect(filt);
  filt.connect(g);
  g.connect(sp.input);
  sp.output.connect(audio.trackGains.bass);
  o.start(time);
  o2.start(time);
  o.stop(time + dur + 0.05);
  o2.stop(time + dur + 0.05);
}
```

- [ ] **Step 2: Replace `playComp`, `playMelody`, `playBass` in `instruments.ts` with re-exports**

```ts
export { playBass, playComp, playMelody } from "./voices.ts";
```

- [ ] **Step 3: Verify**

```bash
export PATH="$HOME/.deno/bin:$PATH"
deno task check && deno task test && deno task build
```

- [ ] **Step 4: Commit**

```bash
git add src/audio/voices.ts src/audio/instruments.ts
git commit -m "refactor(audio): extract voice dispatchers to src/audio/voices.ts"
```

---

## Task 14: Move tape noise into `src/audio/ambience.ts`

**Files:**
- Modify: `src/audio/ambience.ts` (add `startTapeHiss`, `playVinylScratch`, `startScratches`)
- Modify: `src/audio/instruments.ts` (replace with re-exports)
- Modify: `src/main.ts` (update import)

- [ ] **Step 1: Add `startTapeHiss`, `playVinylScratch`, `startScratches` to `src/audio/ambience.ts`**

Append to the end of `src/audio/ambience.ts`:

```ts
import { randRange } from "./rand.ts";
import type { Store } from "../store.ts";
import type { AppState } from "../types.ts";

/**
 * Decorrelated tape hiss bed: two EQ bands, each panned hard L/R so the
 * hiss stays stereo rather than collapsing mono. Sources are not tracked
 * for teardown — hiss persists across mood changes.
 */
export function startTapeHiss(audio: AudioRefs): void {
  for (
    const { freq, Q, gain } of [
      { freq: 5500, Q: 0.6, gain: 0.09 },
      { freq: 1800, Q: 0.4, gain: 0.035 },
    ]
  ) {
    for (const panValue of [-0.9, 0.9]) {
      const src = audio.actx.createBufferSource();
      src.buffer = noiseBuffer(audio.actx, 4, true);
      src.loop = true;
      const filt = audio.actx.createBiquadFilter();
      filt.type = "bandpass";
      filt.frequency.value = freq;
      filt.Q.value = Q;
      const g = audio.actx.createGain();
      g.gain.value = gain;
      const p = audio.actx.createStereoPanner();
      p.pan.value = panValue;
      src.connect(filt);
      filt.connect(g);
      g.connect(p);
      p.connect(audio.trackGains.hiss);
      src.start();
    }
  }
}

export function playVinylScratch(
  audio: AudioRefs,
  store: Store<AppState>,
): void {
  if (!store.get().isPlaying) return;
  const now = audio.actx.currentTime;
  const numGrains = Math.floor(randRange(2, 5));
  for (let i = 0; i < numGrains; i++) {
    const offset = i * randRange(0.04, 0.09);
    const grainDur = randRange(0.04, 0.1);
    const src = audio.actx.createBufferSource();
    src.buffer = noiseBuffer(audio.actx, 0.15);
    src.playbackRate.setValueAtTime(randRange(0.6, 1.8), now + offset);
    src.playbackRate.linearRampToValueAtTime(
      randRange(0.4, 2.2),
      now + offset + grainDur,
    );
    const filt = audio.actx.createBiquadFilter();
    filt.type = "bandpass";
    filt.frequency.setValueAtTime(randRange(800, 3000), now + offset);
    filt.frequency.exponentialRampToValueAtTime(
      randRange(400, 6000),
      now + offset + grainDur,
    );
    filt.Q.value = randRange(1.5, 4);
    const gainNode = audio.actx.createGain();
    gainNode.gain.setValueAtTime(0, now + offset);
    gainNode.gain.linearRampToValueAtTime(
      randRange(0.06, 0.14),
      now + offset + 0.005,
    );
    gainNode.gain.exponentialRampToValueAtTime(
      0.0001,
      now + offset + grainDur,
    );
    const p = audio.actx.createStereoPanner();
    p.pan.value = randRange(-0.4, 0.4);
    src.connect(filt);
    filt.connect(gainNode);
    gainNode.connect(p);
    p.connect(audio.trackGains.scratches);
    src.start(now + offset);
    src.stop(now + offset + grainDur + 0.02);
  }
  setTimeout(
    () => playVinylScratch(audio, store),
    randRange(8000, 24000),
  );
}

export function startScratches(
  audio: AudioRefs,
  store: Store<AppState>,
): void {
  setTimeout(
    () => playVinylScratch(audio, store),
    randRange(4000, 10000),
  );
}
```

Check whether `randRange` and `noiseBuffer` are already imported in `ambience.ts`. `noiseBuffer` is defined in `graph.ts` and already imported. `randRange` is in `./rand.ts` — add it to the import if not already there. `Store` and `AppState` types also need importing if not present.

- [ ] **Step 2: Replace the three functions in `instruments.ts` with re-exports**

```ts
export { playVinylScratch, startScratches, startTapeHiss } from "./ambience.ts";
```

- [ ] **Step 3: Update `src/main.ts` import**

In `src/main.ts`, change:

```ts
import { startScratches, startTapeHiss } from "./audio/instruments.ts";
```

to:

```ts
import { startScratches, startTapeHiss } from "./audio/ambience.ts";
```

- [ ] **Step 4: Verify**

```bash
export PATH="$HOME/.deno/bin:$PATH"
deno task check && deno task test && deno task build
```

- [ ] **Step 5: Commit**

```bash
git add src/audio/ambience.ts src/audio/instruments.ts src/main.ts
git commit -m "refactor(audio): move tape hiss + vinyl scratch into ambience.ts"
```

---

## Task 15: Delete `instruments.ts` and fix all import sites

At this point `instruments.ts` contains only re-exports. This task removes it and points all consumers directly at their new homes.

**Files:**
- Delete: `src/audio/instruments.ts`
- Modify: `src/audio/scheduler.ts`

- [ ] **Step 1: Confirm `instruments.ts` contains only re-exports**

```bash
grep -v "^export {" src/audio/instruments.ts | grep -v "^$" | grep -v "^//"
```

Expected: no output (nothing left but re-exports and blank lines).

- [ ] **Step 2: Delete `instruments.ts`**

```bash
rm src/audio/instruments.ts
```

- [ ] **Step 3: Fix `src/audio/scheduler.ts` imports**

Replace:

```ts
import { beatDur, swungTime } from "./timing.ts";
import {
  playBass,
  playComp,
  playHat,
  playKick,
  playMelody,
  playSnare,
} from "./instruments.ts";
```

with:

```ts
import { beatDur, swungTime } from "./timing.ts";
import { playKick } from "./timbres/kick.ts";
import { playSnare } from "./timbres/snare.ts";
import { playHat } from "./timbres/hat.ts";
import { playBass, playComp, playMelody } from "./voices.ts";
```

- [ ] **Step 4: Verify**

```bash
export PATH="$HOME/.deno/bin:$PATH"
deno task check && deno task test && deno task build
```

Expected: all pass with no references to `instruments.ts` remaining.

- [ ] **Step 5: Confirm no remaining references**

```bash
grep -r "instruments" src/ tests/
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(audio): delete instruments.ts — all consumers updated"
```

---

## Task 16: Final check + push + PR

- [ ] **Step 1: Full verification**

```bash
export PATH="$HOME/.deno/bin:$PATH"
deno task check && deno task test && deno task build
```

All three pass.

- [ ] **Step 2: Push and open PR**

```bash
git push -u origin feat/split-instruments
gh pr create \
  --title "refactor(audio): split instruments.ts into focused modules" \
  --body "$(cat <<'EOF'
## Summary

- `src/audio/timing.ts` — pure math utilities (`midiToFreq`, `beatDur`, `swungTime`)
- `src/audio/timbres/` — one file per instrument voice (`kick`, `snare`, `hat`, `rhodes`, `vibraphone`, `guitar`, `pad`, `celesta`, `bell`, `coldsynth`)
- `src/audio/voices.ts` — dispatchers (`playComp`, `playMelody`, `playBass`)
- `src/audio/ambience.ts` — gains tape hiss + vinyl scratch
- `src/ui/flash.ts` — DOM flash side-effect
- `src/audio/instruments.ts` — **deleted**

Pure code-move. No logic changes. Each intermediate commit left check+test+build green.

## Spec
\`docs/superpowers/specs/2026-05-15-instruments-split-design.md\`

## Test plan
- [ ] `deno task check` passes
- [ ] `deno task test` passes
- [ ] `deno task build` produces `dist/main.js`
- [ ] `deno task dev` — open http://localhost:8000, play music, verify all moods/sliders work
EOF
)"
```
