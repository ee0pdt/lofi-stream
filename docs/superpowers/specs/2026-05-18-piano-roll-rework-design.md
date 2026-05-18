# Piano-roll rework

**Status:** Approved
**Date:** 2026-05-18
**Branch:** `feat/piano-roll-rework`

## Problem

The piano-roll visualiser ([`src/visual/piano-roll.ts`](../../../src/visual/piano-roll.ts), introduced commits `7ff2f5c…c07bcb5`) has three concrete defects:

1. **Wasted vertical real estate.** It is confined to a 56 px strip inside the bottom `.sheet` (`#vis` in `.wave-wrap`), while the gaussian blob background (`#bg`, full-bleed) is the dominant visual. The roll and the blobs never share the same canvas region — the user's eye picks one or the other.
2. **Per-frame allocation churn.** Every animation frame calls `snapshotInOrder()` (allocates a new `RollNote[]`) and `pruneOlderThan(cutoff)` (allocates a filtered array, then rebuilds the ring buffer). At 60 fps that is ~120 array allocations per second for a 256-slot buffer that changes only on note arrival. The render loop also issues 256 separate `fillStyle` writes per frame even though there are only four voice colours.
3. **No lifecycle awareness.** The rAF loop runs unconditionally regardless of play state; the ring buffer survives mood changes, so notes from the previous mood scroll across the new mood for ~2 bars until the prune window catches up; pausing leaves the playhead drifting on stale data.

## Goals

- Make the roll a first-class full-bleed visual layered above the gaussian blobs.
- Eliminate per-frame allocations on the hot path; batch GPU/2D state changes.
- Pause cleanly when playback pauses; reset cleanly when the user changes mood.
- Provide benchmarks that future changes can be measured against.

## Non-goals

- Replacing the gaussian background.
- Adding interactivity to the roll (clicks, drags, scrubbing).
- Changing what gets recorded — `recordNote` callers in [`src/audio/scheduler.ts`](../../../src/audio/scheduler.ts) stay as-is.
- Implementing the OffscreenCanvas scroll-by-blit optimisation; it is documented as a fallback if benchmarks miss.

## Design

### 1. DOM & CSS

- The 56 px `.wave-wrap` block in [`index.html`](../../../index.html) (around line 184 CSS, line 656 markup) is deleted entirely. The `#vis` canvas is removed from inside the sheet.
- A new `<canvas id="vis">` is inserted at the top level, immediately after `<canvas id="bg">`, so it sits in the same stacking context as the gaussian background.
- New CSS for `#vis`:

  ```css
  #vis {
    position: fixed;
    inset: 0;
    z-index: 1;
    pointer-events: none;
  }
  ```

  The gaussian `#bg` stays at `z-index: 0`. The bottom `.sheet` stays at `z-index: 10` and continues to occlude the roll where they overlap.

### 2. Render-loop state machine

The current loop runs forever and early-returns on `beatDur === 0`. Replace with explicit state:

| State    | rAF active | On entry                            |
| -------- | ---------- | ----------------------------------- |
| `idle`   | no         | last frame stays on the canvas      |
| `running`| yes        | rAF re-arms each frame              |

Transitions:

- `play()` → `idle → running` (no-op if already running).
- `pause()` → `running → idle`. Cancels the pending rAF handle. The canvas is *not* wiped; the last painted frame remains visible until the next `play()` or `clear()`.
- `clear()` → wipes the canvas (`ctx.clearRect(0, 0, visW, visH)`), drains the ring buffer (`buffer.length = 0; writeIdx = 0`). Leaves state unchanged: if `running`, the next frame re-paints from empty; if `idle`, the canvas stays blank until `play()`.

### 3. Module surface

`mountPianoRoll` returns a `PianoRoll` instance:

```ts
export interface PianoRoll {
  play(): void;
  pause(): void;
  clear(): void;
}

export function mountPianoRoll(
  canvas: HTMLCanvasElement,
  getAudioCtx: () => AudioContext | null,
  getBeatDur: () => number,
): PianoRoll;
```

`recordNote` stays as a free, module-level function. The scheduler calls it from nine sites in `scheduler.ts`; threading an instance through there would force a much larger diff for no benefit. The free function writes into the same module-level ring buffer that the renderer reads, exactly as today.

Test-only helpers (`__resetPianoRollForTest`, `__snapshotPianoRollForTest`, `__pruneOlderThanForTest`) stay in place. `clear()` and `__resetPianoRollForTest` share a small private `resetBuffer()` helper — `clear()` additionally wipes the canvas via `clearRect`; the test helper does not.

### 4. Hooks from `main.ts`

- After `mountPianoRoll` runs, store the returned instance in a local `pianoRoll: PianoRoll`.
- Inside `toggle()`:
  - On pause branch: call `pianoRoll.pause()` *after* the existing `stopScheduler()` + `stopAmbience()` call inside the `setTimeout`.
  - On play branch: call `pianoRoll.play()` at the same point as `startScheduler(refs, store)`.
- Inside `changeMood()`: call `pianoRoll.clear()` inside the existing `setTimeout` callback, immediately after the trackGains sever loop and before `newProgression(...)`. This puts the canvas wipe on the same audio-frame boundary as the sever, so the visual and the audio cross-fade move together.
- Extend the `__lofi` debug surface at the bottom of `main.ts` with `fps: () => number` (see §5).

### 5. Performance plan

#### What's expensive today

Per frame (every 16.7 ms at 60 fps):
1. `snapshotInOrder()` — one new `RollNote[]` of up to 256 refs.
2. `pruneOlderThan(now - halfSec)` — one `.filter()` allocation, then rebuilds `buffer`.
3. `fillStyle` is written 256× even though only four distinct colours exist.
4. Every note goes through `beginPath() + roundRect() + fill()` — three calls per note, even for short bass/drum hits whose width is 1–2 px.

#### Changes (in order of impact)

1. **Iterate the ring in place.** Drop the per-frame `snapshotInOrder` call. The draw loop walks `for (let i = 0; i < buffer.length; i++) buf[(writeIdx + i) % CAPACITY]`. Zero per-frame allocations from this path.
2. **Lazy prune.** Move pruning out of the render loop. `recordNote` checks once per call: if `buffer.length === CAPACITY` and the *oldest* note's `time + dur < now − halfSec`, run a compaction pass. Most calls do no work. Window-clipping inside the render loop already prevents off-screen notes from being drawn, so cleanup cadence does not affect visible output — it only bounds memory.
3. **Batch by colour.** Pre-allocate four `Uint16Array(CAPACITY)` index arrays (`chordsIdx`, `bassIdx`, `mel1Idx`, `mel2Idx`) plus matching `length` counters. Each frame:

   ```text
   reset four counters to 0
   for each note in window:
     push its ring-buffer index into the matching voice array
   for each voice:
     ctx.fillStyle = VOICE_STYLE[voice].fill (1 write per frame per voice)
     for each index in that voice's array:
       drawNote(...)
   ```

   Worst case: 4 `fillStyle` writes per frame instead of up to 256.
4. **Cheap rect for short notes.** If `w < 4 * dpr`, skip `beginPath` + `roundRect` and call `fillRect` directly. Bass and drum hits are typically 1–3 px wide; the path machinery dominates their cost.
5. **rAF only while running.** Covered by §2. Frees an rAF wakeup every 16.7 ms while paused.

#### Visual treatment

These changes ride on top of the perf rework — they are not orthogonal because the additive blend mode is what makes the full-bleed overlay readable.

- `ctx.globalCompositeOperation = 'lighter'` on the piano-roll canvas (set once at mount, not per frame). Notes bloom against the gaussian blobs.
- Voice colours keep their hues; alpha drops from `0.70` to `0.45` to compensate for additive blending so overlaps don't clip to white.
- Fade trail: the current `fillRect(0,0,visW,visH)` with `rgba(0,0,0,0.08)` won't work under additive composite (black is a no-op under `lighter`). Replace with:
  - `ctx.clearRect(0, 0, visW, visH)` at top of frame.
  - In-loop alpha attenuation for past notes: for `rel < 0`, multiply the voice's base alpha by `Math.max(0, 1 + rel / halfSec)` — linear ramp from full alpha at the playhead to zero at the left edge. Future notes (`rel >= 0`) draw at full alpha. No new compositing tricks.
- Note height scales with viewport: `NOTE_HEIGHT_PX = Math.max(3, Math.round(visH / 80))`. On a 800 px viewport that gives ~10 px tall notes; on a 240 px viewport, ~3 px.
- Playhead: brighten to `rgba(255,255,255,0.45)` (was `0.32`) — additive compositing washes the current dim line out against blob highlights.
- MIDI range stays `36..84`. Resize handling stays — keep the existing `ResizeObserver` and `visualViewport` listeners, just retargeted at the new fullscreen canvas.

#### Benchmarks

- **Deno bench** (`tests/piano-roll.bench.ts`):
  - `Deno.bench("piano-roll render: 256 notes")` — exercise the inner draw function against a mock 2D context recording call counts. Target: < 0.5 ms per call on the developer's machine. CI reports timing but does not fail on regressions (no agreed threshold yet).
  - `Deno.bench("piano-roll recordNote: hot path")` — 10 000 `recordNote` calls including the lazy-prune branch. Confirms the eager-prune work is gone from this path.
- **In-browser FPS probe**:
  - 120-frame rolling average of rAF deltas, exposed via `window.__lofi.fps()`.
  - Target: ≥ 58 fps sustained for 30 s of playback on the developer's machine.

#### Bail-out plan

If benchmarks still miss after the changes above, keep an `OffscreenCanvas` of the prior frame, blit it left by `(dt / (2 * halfSec)) * visW` each frame, and only paint newly-arrived notes on top — per-frame cost becomes O(new notes since last frame). This is documented for future reference; the design *does not* implement it. The scroll-by-blit arithmetic interacts awkwardly with the variable-rate playhead (which itself depends on `getBeatDur()` and so changes as the BPM changes), and the readability win from option A should be enough.

### 6. Testing

Extend [`tests/piano-roll.test.ts`](../../../tests/piano-roll.test.ts):

- Keep all three existing tests (recordNote append, ring-buffer wrap, prune semantics).
- Add: `clear()` empties the ring buffer and calls `clearRect` on the mocked context.
- Add: `pause()` after `play()` — assert that further mocked rAF ticks are not requested. Use a fake `requestAnimationFrame` that returns a numeric handle and tracks `cancelAnimationFrame` calls.
- Add: batching test — record five same-voice notes, run one frame, assert the mock context's `fillStyle` setter was invoked exactly *once* for that voice within the frame (proves §5.3 batching).

New file [`tests/piano-roll.bench.ts`](../../../tests/piano-roll.bench.ts) with the two `Deno.bench` cases listed in §5.

Manual end-to-end (recorded as a checklist for the PR):

- [ ] Start playback → notes appear full-screen above the gaussian blobs with additive bloom.
- [ ] Pause → notes freeze in place; gaussian blobs continue drifting.
- [ ] Resume → motion picks up; the buffer carries over (notes that were on-screen when paused remain visible as they scroll through the playhead).
- [ ] Switch moods → canvas hard-clears in sync with the audio sever; new mood populates.
- [ ] `window.__lofi.fps()` reports ≥ 58 sustained for 30 s of playback.

### 7. Docs

- Update the "Visualiser" subsection of [`docs/ARCHITECTURE.md`](../../../docs/ARCHITECTURE.md): the piano roll is now a fullscreen overlay above `#bg`, not a strip inside the player card; document the additive blend, the lazy-prune model, and the `play/pause/clear` lifecycle.

## Files touched

- `src/visual/piano-roll.ts` — main rewrite (renderer, lifecycle, batching, lazy prune, additive blend).
- `src/main.ts` — wire `pianoRoll.play() / pause() / clear()` into `toggle()` and `changeMood()`; extend the `__lofi` debug surface with `fps()`.
- `index.html` — move `<canvas id="vis">` out of `.wave-wrap`, delete `.wave-wrap` block + CSS, add fullscreen CSS for `#vis`.
- `tests/piano-roll.test.ts` — extended with `clear` / `pause` / batching tests.
- `tests/piano-roll.bench.ts` — new file.
- `docs/ARCHITECTURE.md` — visualiser section updated.

## Verification

CLAUDE.md requires `deno task check && deno task test` clean before reporting done. Both must pass. Manual checklist in §6 must also pass on the developer's local browser (the FPS gate is not enforced by CI).
