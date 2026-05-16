# Skeuomorphic Mixer Knobs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 12 mixer panel range sliders with skeuomorphic SVG rotary knobs backed by hidden native inputs for full keyboard/screen-reader accessibility.

**Architecture:** Each knob is an SVG arc (track + fill + indicator dot) overlaid on a hidden `<input type="range">`. The native input stays in the tab order and handles all keyboard behaviour; pointer drag on the knob wrap updates the input value and dispatches a synthetic `input` event so existing audio-graph listeners fire unchanged. SVG arc geometry is recomputed on every value change via `updateKnobSvg`.

**Tech Stack:** Vanilla HTML/CSS/SVG/TypeScript, no new dependencies. Deno for check/test.

---

## File Map

| File | Change |
|---|---|
| `index.html` | Replace 12 `.mx-row` groups with `.kn-grid`+`.kn-cell` HTML; add knob CSS; update flash CSS |
| `src/ui/controls.ts` | Export `updateKnobSvg` + `initKnobDrag`; call them in `mountControls` and `applyMoodSettings` |
| `src/ui/flash.ts` | Target `.kn-cell` instead of `input[type=range]` for flash class |
| `src/main.ts` | Import and call `initKnobDrag` + `updateKnobSvg` for the tempo slider |

> No new unit tests — SVG/drag behaviour is integration-level only. Run `deno task check && deno task test` after every commit to catch regressions.

---

## SVG Geometry Reference

All knobs use viewBox `0 0 52 52`, cx=26, cy=26, track-arc r=18.

- **Start angle:** 135° (7 o'clock, bottom-left) — `x=13.27, y=38.73`
- **End angle:** 405° = 45° (5 o'clock, bottom-right) — `x=38.73, y=38.73`
- **Sweep:** 270° clockwise
- **Track path (static):** `M 13.27 38.73 A 18 18 0 1 1 38.73 38.73`
- **Fill path:** arc from 135° to `135 + value * 270` degrees
- **Indicator dot:** circle at polar coords `(26, 26, 15, 135 + value*270)`  (r=15, slightly inside track)

`large-arc-flag` = 1 when sweep > 180° (i.e. value > 2/3), else 0. Sweep direction always clockwise (sweep-flag=1).

---

## Task 1: Add knob CSS to index.html

**Files:**
- Modify: `index.html` (CSS section only — no HTML body changes yet)

- [ ] **Step 1: Add grid and cell CSS**

Insert after the existing `.mx-div` rule (around line 471) in `index.html`:

```css
      /* ── Knob grid ── */
      .kn-grid {
        --kn-size: 52px;
        --kn-drag-px: 200;
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 16px 8px;
        padding: 12px 0 8px;
      }
      .kn-cell {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
      }
      .kn-wrap {
        position: relative;
        width: var(--kn-size);
        height: var(--kn-size);
        border-radius: 50%;
        touch-action: none;
      }
      .kn-wrap:focus-within {
        outline: 2px solid var(--warm);
        outline-offset: 3px;
      }
      .kn-svg {
        width: var(--kn-size);
        height: var(--kn-size);
        display: block;
        pointer-events: none;
      }
      .kn-body {
        fill: #1a1d24;
      }
      .kn-track {
        fill: none;
        stroke: rgba(255, 255, 255, 0.12);
        stroke-width: 3;
        stroke-linecap: round;
      }
      .kn-fill {
        fill: none;
        stroke: var(--warm);
        stroke-width: 3;
        stroke-linecap: round;
        transition: stroke 0.06s ease;
      }
      .kn-dot {
        fill: var(--warm);
        transition: fill 0.06s ease;
      }
      .kn-input {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        opacity: 0;
        cursor: pointer;
        margin: 0;
        -webkit-appearance: none;
        border-radius: 50%;
      }
      .kn-lbl {
        font-size: 0.58rem;
        color: var(--dim);
        letter-spacing: 0.04em;
        text-align: center;
      }
      .kn-val {
        font-size: 0.58rem;
        color: var(--dimmer);
        font-variant-numeric: tabular-nums;
        text-align: center;
      }
      /* Flash: brighten fill arc + dot when instrument plays */
      .kn-cell.flash .kn-fill {
        stroke: #fff;
        filter: drop-shadow(0 0 4px var(--warm));
      }
      .kn-cell.flash .kn-dot {
        fill: #fff;
        filter: drop-shadow(0 0 4px var(--warm));
      }
```

- [ ] **Step 2: Verify no visual breakage**

Run `deno task dev`, open http://localhost:8000, open the controls panel. The existing sliders should still look normal (CSS added but HTML unchanged).

- [ ] **Step 3: Commit**

```bash
git checkout -b feat/skeuomorphic-knobs
git add index.html
git commit -m "feat(ui): add knob grid CSS"
```

---

## Task 2: Replace mixer HTML rows with knob cells

**Files:**
- Modify: `index.html` (body only — the `.mixer-panel` div)

- [ ] **Step 1: Replace the mixer panel body**

Find the `<div class="mixer-panel" id="mixerPanel">` block (lines ~597–758) and replace its contents with:

```html
      <div class="mixer-panel" id="mixerPanel">
        <div class="kn-grid">
          <div class="kn-cell" id="mx-drums">
            <div class="kn-wrap">
              <svg class="kn-svg" viewBox="0 0 52 52" aria-hidden="true">
                <circle class="kn-body" cx="26" cy="26" r="24"/>
                <path class="kn-track" d="M 13.27 38.73 A 18 18 0 1 1 38.73 38.73"/>
                <path class="kn-fill" d=""/>
                <circle class="kn-dot" cx="13.27" cy="38.73" r="3"/>
              </svg>
              <input class="kn-input" type="range" data-track="drums"
                aria-label="drums" min="0" max="1" step="0.01" value="0.9"/>
            </div>
            <span class="kn-lbl">drums</span>
            <span class="kn-val" id="val-drums">90</span>
          </div>

          <div class="kn-cell" id="mx-bass">
            <div class="kn-wrap">
              <svg class="kn-svg" viewBox="0 0 52 52" aria-hidden="true">
                <circle class="kn-body" cx="26" cy="26" r="24"/>
                <path class="kn-track" d="M 13.27 38.73 A 18 18 0 1 1 38.73 38.73"/>
                <path class="kn-fill" d=""/>
                <circle class="kn-dot" cx="13.27" cy="38.73" r="3"/>
              </svg>
              <input class="kn-input" type="range" data-track="bass"
                aria-label="bass" min="0" max="1" step="0.01" value="0.85"/>
            </div>
            <span class="kn-lbl">bass</span>
            <span class="kn-val" id="val-bass">85</span>
          </div>

          <div class="kn-cell" id="mx-comp">
            <div class="kn-wrap">
              <svg class="kn-svg" viewBox="0 0 52 52" aria-hidden="true">
                <circle class="kn-body" cx="26" cy="26" r="24"/>
                <path class="kn-track" d="M 13.27 38.73 A 18 18 0 1 1 38.73 38.73"/>
                <path class="kn-fill" d=""/>
                <circle class="kn-dot" cx="13.27" cy="38.73" r="3"/>
              </svg>
              <input class="kn-input" type="range" data-track="comp"
                aria-label="piano" min="0" max="1" step="0.01" value="0.8"/>
            </div>
            <span class="kn-lbl">piano</span>
            <span class="kn-val" id="val-comp">80</span>
          </div>

          <div class="kn-cell" id="mx-melody">
            <div class="kn-wrap">
              <svg class="kn-svg" viewBox="0 0 52 52" aria-hidden="true">
                <circle class="kn-body" cx="26" cy="26" r="24"/>
                <path class="kn-track" d="M 13.27 38.73 A 18 18 0 1 1 38.73 38.73"/>
                <path class="kn-fill" d=""/>
                <circle class="kn-dot" cx="13.27" cy="38.73" r="3"/>
              </svg>
              <input class="kn-input" type="range" data-track="melody"
                aria-label="melody" min="0" max="1" step="0.01" value="0.75"/>
            </div>
            <span class="kn-lbl">melody</span>
            <span class="kn-val" id="val-melody">75</span>
          </div>

          <div class="kn-cell">
            <div class="kn-wrap">
              <svg class="kn-svg" viewBox="0 0 52 52" aria-hidden="true">
                <circle class="kn-body" cx="26" cy="26" r="24"/>
                <path class="kn-track" d="M 13.27 38.73 A 18 18 0 1 1 38.73 38.73"/>
                <path class="kn-fill" d=""/>
                <circle class="kn-dot" cx="13.27" cy="38.73" r="3"/>
              </svg>
              <input class="kn-input" type="range" data-track="hiss"
                aria-label="hiss" min="0" max="1" step="0.01" value="0.5"/>
            </div>
            <span class="kn-lbl">hiss</span>
            <span class="kn-val" id="val-hiss">50</span>
          </div>

          <div class="kn-cell">
            <div class="kn-wrap">
              <svg class="kn-svg" viewBox="0 0 52 52" aria-hidden="true">
                <circle class="kn-body" cx="26" cy="26" r="24"/>
                <path class="kn-track" d="M 13.27 38.73 A 18 18 0 1 1 38.73 38.73"/>
                <path class="kn-fill" d=""/>
                <circle class="kn-dot" cx="13.27" cy="38.73" r="3"/>
              </svg>
              <input class="kn-input" type="range" data-track="scratches"
                aria-label="scratch" min="0" max="1" step="0.01" value="0.7"/>
            </div>
            <span class="kn-lbl">scratch</span>
            <span class="kn-val" id="val-scratches">70</span>
          </div>

          <div class="kn-cell">
            <div class="kn-wrap">
              <svg class="kn-svg" viewBox="0 0 52 52" aria-hidden="true">
                <circle class="kn-body" cx="26" cy="26" r="24"/>
                <path class="kn-track" d="M 13.27 38.73 A 18 18 0 1 1 38.73 38.73"/>
                <path class="kn-fill" d=""/>
                <circle class="kn-dot" cx="13.27" cy="38.73" r="3"/>
              </svg>
              <input class="kn-input" type="range" data-track="hum"
                aria-label="hum" min="0" max="1" step="0.01" value="0.4"/>
            </div>
            <span class="kn-lbl">hum</span>
            <span class="kn-val" id="val-hum">40</span>
          </div>

          <div class="kn-cell">
            <div class="kn-wrap">
              <svg class="kn-svg" viewBox="0 0 52 52" aria-hidden="true">
                <circle class="kn-body" cx="26" cy="26" r="24"/>
                <path class="kn-track" d="M 13.27 38.73 A 18 18 0 1 1 38.73 38.73"/>
                <path class="kn-fill" d=""/>
                <circle class="kn-dot" cx="13.27" cy="38.73" r="3"/>
              </svg>
              <input class="kn-input" type="range" data-track="ambience"
                aria-label="ambience" min="0" max="1" step="0.01" value="0.6"/>
            </div>
            <span class="kn-lbl">ambience</span>
            <span class="kn-val" id="val-ambience">60</span>
          </div>

          <div class="kn-cell">
            <div class="kn-wrap">
              <svg class="kn-svg" viewBox="0 0 52 52" aria-hidden="true">
                <circle class="kn-body" cx="26" cy="26" r="24"/>
                <path class="kn-track" d="M 13.27 38.73 A 18 18 0 1 1 38.73 38.73"/>
                <path class="kn-fill" d=""/>
                <circle class="kn-dot" cx="13.27" cy="38.73" r="3"/>
              </svg>
              <input class="kn-input" type="range" id="warpSlider"
                aria-label="warp" min="0" max="1" step="0.01" value="0.3"/>
            </div>
            <span class="kn-lbl">warp</span>
            <span class="kn-val" id="val-warp">30</span>
          </div>

          <div class="kn-cell">
            <div class="kn-wrap">
              <svg class="kn-svg" viewBox="0 0 52 52" aria-hidden="true">
                <circle class="kn-body" cx="26" cy="26" r="24"/>
                <path class="kn-track" d="M 13.27 38.73 A 18 18 0 1 1 38.73 38.73"/>
                <path class="kn-fill" d=""/>
                <circle class="kn-dot" cx="13.27" cy="38.73" r="3"/>
              </svg>
              <input class="kn-input" type="range" id="rainSlider"
                aria-label="rain" min="0" max="1" step="0.01" value="0.4"/>
            </div>
            <span class="kn-lbl">rain</span>
            <span class="kn-val" id="val-rain">40</span>
          </div>

          <div class="kn-cell">
            <div class="kn-wrap">
              <svg class="kn-svg" viewBox="0 0 52 52" aria-hidden="true">
                <circle class="kn-body" cx="26" cy="26" r="24"/>
                <path class="kn-track" d="M 13.27 38.73 A 18 18 0 1 1 38.73 38.73"/>
                <path class="kn-fill" d=""/>
                <circle class="kn-dot" cx="13.27" cy="38.73" r="3"/>
              </svg>
              <input class="kn-input" type="range" id="reverbSlider"
                aria-label="reverb" min="0" max="1" step="0.01" value="0.3"/>
            </div>
            <span class="kn-lbl">reverb</span>
            <span class="kn-val" id="val-reverb">30</span>
          </div>

          <div class="kn-cell">
            <div class="kn-wrap">
              <svg class="kn-svg" viewBox="0 0 52 52" aria-hidden="true">
                <circle class="kn-body" cx="26" cy="26" r="24"/>
                <path class="kn-track" d="M 13.27 38.73 A 18 18 0 1 1 38.73 38.73"/>
                <path class="kn-fill" d=""/>
                <circle class="kn-dot" cx="13.27" cy="38.73" r="3"/>
              </svg>
              <input class="kn-input" type="range" id="complexitySlider"
                aria-label="complexity" min="0" max="1" step="0.01" value="0.5"/>
            </div>
            <span class="kn-lbl">complexity</span>
            <span class="kn-val" id="val-complexity">50</span>
          </div>
        </div>

        <div class="mx-div"></div>

        <div class="kn-grid" style="grid-template-columns: repeat(2, 1fr);">
          <div class="kn-cell">
            <div class="kn-wrap">
              <svg class="kn-svg" viewBox="0 0 52 52" aria-hidden="true">
                <circle class="kn-body" cx="26" cy="26" r="24"/>
                <path class="kn-track" d="M 13.27 38.73 A 18 18 0 1 1 38.73 38.73"/>
                <path class="kn-fill" d=""/>
                <circle class="kn-dot" cx="13.27" cy="38.73" r="3"/>
              </svg>
              <input class="kn-input" type="range" id="bpmSlider"
                aria-label="tempo" min="45" max="95" step="1" value="68"/>
            </div>
            <span class="kn-lbl">tempo</span>
            <span class="kn-val" id="bpmVal">&mdash;</span>
          </div>
        </div>
      </div>
```

- [ ] **Step 2: Verify in browser**

Run `deno task dev`, open http://localhost:8000, open controls panel. You should see knob cell shapes (dark circles with labels). SVG arcs will not yet update — that comes in Task 3.

- [ ] **Step 3: Run checks**

```bash
deno task check && deno task test
```

Expected: all 99 tests pass, no type errors.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(ui): replace mixer rows with knob cell HTML"
```

---

## Task 3: Add SVG helpers and updateKnobSvg to controls.ts

**Files:**
- Modify: `src/ui/controls.ts`

- [ ] **Step 1: Add arc geometry helpers at the top of the file**

Add these pure functions immediately after the imports (before `TRACK_SLIDERS`):

```typescript
const KN_CX = 26;
const KN_CY = 26;
const KN_R = 18;
const KN_DOT_R = 15;
const KN_START = 135; // degrees
const KN_SWEEP = 270; // degrees

function knPolar(angleDeg: number): [number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  return [KN_CX + KN_R * Math.cos(rad), KN_CY + KN_R * Math.sin(rad)];
}

function knDotPolar(angleDeg: number): [number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  return [KN_CX + KN_DOT_R * Math.cos(rad), KN_CY + KN_DOT_R * Math.sin(rad)];
}

function knArcPath(startDeg: number, endDeg: number): string {
  const [sx, sy] = knPolar(startDeg);
  const [ex, ey] = knPolar(endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${KN_R} ${KN_R} 0 ${large} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`;
}
```

- [ ] **Step 2: Add updateKnobSvg function**

Add this exported function after `knArcPath`, before `TRACK_SLIDERS`:

```typescript
/**
 * Repaints the SVG fill arc and indicator dot for `input` based on its
 * current value. Also updates aria-valuetext for screen readers.
 * Safe to call on a non-knob input (no-ops if SVG siblings not found).
 */
export function updateKnobSvg(input: HTMLInputElement): void {
  const wrap = input.closest(".kn-wrap");
  if (!wrap) return;
  const min = parseFloat(input.min) || 0;
  const max = parseFloat(input.max) || 1;
  const val = parseFloat(input.value);
  const norm = Math.max(0, Math.min(1, (val - min) / (max - min)));

  const endAngle = KN_START + norm * KN_SWEEP;
  const fill = wrap.querySelector(".kn-fill");
  if (fill) fill.setAttribute("d", norm > 0 ? knArcPath(KN_START, endAngle) : "");

  const [dx, dy] = knDotPolar(endAngle);
  const dot = wrap.querySelector(".kn-dot");
  if (dot) {
    dot.setAttribute("cx", dx.toFixed(2));
    dot.setAttribute("cy", dy.toFixed(2));
  }

  const pct = Math.round(norm * 100);
  if (min === 0 && max === 1) {
    input.setAttribute("aria-valuetext", `${pct}%`);
  } else {
    input.setAttribute("aria-valuetext", `${Math.round(val)} BPM`);
  }
}
```

- [ ] **Step 3: Run checks**

```bash
deno task check && deno task test
```

Expected: all 99 tests pass, no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/ui/controls.ts
git commit -m "feat(ui): add knob SVG arc helpers and updateKnobSvg"
```

---

## Task 4: Add initKnobDrag to controls.ts

**Files:**
- Modify: `src/ui/controls.ts`

- [ ] **Step 1: Add initKnobDrag function**

Add after `updateKnobSvg`:

```typescript
const DRAG_PX = 200; // px of upward drag = full range sweep

/**
 * Wires vertical pointer-drag on `input`'s parent `.kn-wrap` so that
 * dragging up increases the value and dragging down decreases it.
 * Dispatches a synthetic `input` event after each update so existing
 * audio-graph listeners fire unchanged.
 */
export function initKnobDrag(input: HTMLInputElement): void {
  let startY = 0;
  let startVal = 0;

  input.addEventListener("pointerdown", (e: PointerEvent) => {
    e.preventDefault();
    input.setPointerCapture(e.pointerId);
    startY = e.clientY;
    startVal = parseFloat(input.value);
  });

  input.addEventListener("pointermove", (e: PointerEvent) => {
    if (!input.hasPointerCapture(e.pointerId)) return;
    const min = parseFloat(input.min) || 0;
    const max = parseFloat(input.max) || 1;
    const range = max - min;
    const delta = (startY - e.clientY) / DRAG_PX * range;
    const newVal = Math.max(min, Math.min(max, startVal + delta));
    const stepped = Math.round(newVal / parseFloat(input.step || "1")) * parseFloat(input.step || "1");
    input.value = String(stepped);
    updateKnobSvg(input);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  input.addEventListener("pointerup", (e: PointerEvent) => {
    input.releasePointerCapture(e.pointerId);
  });
}
```

- [ ] **Step 2: Run checks**

```bash
deno task check && deno task test
```

Expected: all 99 tests pass, no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/controls.ts
git commit -m "feat(ui): add initKnobDrag for vertical pointer-drag on knobs"
```

---

## Task 5: Wire up knobs in mountControls and applyMoodSettings

**Files:**
- Modify: `src/ui/controls.ts`

- [ ] **Step 1: Update applyMoodSettings to refresh SVG**

In `applyMoodSettings`, the loop already sets `slider.value`. Add a call to `updateKnobSvg` right after:

```typescript
export function applyMoodSettings(
  ctx: ControlsContext,
  moodSettings: Record<Mood, MoodSettings>,
  mood: Mood,
): void {
  const s = moodSettings[mood] ?? DEFAULT_SETTINGS[mood];
  for (const key of Object.keys(s) as Array<keyof MoodSettings>) {
    const val = s[key];
    const slider = document.querySelector(TRACK_SLIDERS[key]) as
      | HTMLInputElement
      | null;
    if (slider) {
      slider.value = String(val);
      updateKnobSvg(slider);           // ← add this line
    }
    const labelEl = document.getElementById(valLabelFor(key));
    if (labelEl) labelEl.textContent = String(Math.round(val * 100));
    dispatchSetting(ctx, moodSettings, key, val);
  }
}
```

- [ ] **Step 2: Update data-track input event handlers to call updateKnobSvg**

In `mountControls`, the `querySelectorAll("input[data-track]")` forEach block:

```typescript
  document.querySelectorAll("input[data-track]").forEach((node) => {
    const slider = node as HTMLInputElement;
    const track = slider.dataset.track as keyof MoodSettings | undefined;
    if (!track) return;
    initKnobDrag(slider);                                       // ← add
    slider.addEventListener("input", () => {
      const val = parseFloat(slider.value);
      const label = document.getElementById(valLabelFor(track));
      if (label) label.textContent = String(Math.round(val * 100));
      updateKnobSvg(slider);                                    // ← add
      dispatchSetting(ctx, moodSettings, track, val);
    });
  });
```

- [ ] **Step 3: Update named slider event handlers to call updateKnobSvg**

In the `for (const key of ["rain", "reverb", "warp", "complexity", "vol"] as const)` loop:

```typescript
  for (const key of ["rain", "reverb", "warp", "complexity", "vol"] as const) {
    const slider = document.querySelector(TRACK_SLIDERS[key]) as
      | HTMLInputElement
      | null;
    if (!slider) continue;
    if (key !== "vol") initKnobDrag(slider);                    // ← add (vol not a knob)
    slider.addEventListener("input", () => {
      const val = parseFloat(slider.value);
      if (key !== "vol") {
        const label = document.getElementById(valLabelFor(key));
        if (label) label.textContent = String(Math.round(val * 100));
        updateKnobSvg(slider);                                  // ← add
      }
      dispatchSetting(ctx, moodSettings, key, val);
    });
  }
```

- [ ] **Step 4: Call updateKnobSvg on all knob inputs at init**

At the end of `mountControls`, before the `return` statement, add an initial paint of all knob SVGs:

```typescript
  document.querySelectorAll(".kn-input").forEach((node) => {
    updateKnobSvg(node as HTMLInputElement);
  });
```

- [ ] **Step 5: Run checks**

```bash
deno task check && deno task test
```

Expected: all 99 tests pass, no type errors.

- [ ] **Step 6: Verify in browser**

Open the controls panel. Each knob should now show its amber fill arc at the correct starting position. Dragging a knob up/down should move the arc. Pressing Tab should move focus through knobs; arrow keys should adjust the value and redraw the arc.

- [ ] **Step 7: Commit**

```bash
git add src/ui/controls.ts
git commit -m "feat(ui): wire knob drag and SVG updates in mountControls"
```

---

## Task 6: Wire tempo knob in main.ts

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Import initKnobDrag and updateKnobSvg**

Find the import from `./src/ui/controls.ts` (or add one). Add `initKnobDrag` and `updateKnobSvg` to the named imports:

```typescript
import { mountControls, applyMoodSettings, initKnobDrag, updateKnobSvg } from "./src/ui/controls.ts";
```

(Adjust path to match existing import style in main.ts.)

- [ ] **Step 2: Wire initKnobDrag and initial SVG paint for bpmSlider**

Find the existing bpmSlider block (around line 201):

```typescript
const bpmSlider = document.getElementById("bpmSlider");
if (bpmSlider instanceof HTMLInputElement) {
  bpmSlider.addEventListener("input", () => setCurrentBPM(parseInt(bpmSlider.value)));
}
```

Replace with:

```typescript
const bpmSlider = document.getElementById("bpmSlider");
if (bpmSlider instanceof HTMLInputElement) {
  initKnobDrag(bpmSlider);
  updateKnobSvg(bpmSlider);
  bpmSlider.addEventListener("input", () => {
    updateKnobSvg(bpmSlider);
    setCurrentBPM(parseInt(bpmSlider.value));
  });
}
```

- [ ] **Step 3: Run checks**

```bash
deno task check && deno task test
```

Expected: all 99 tests pass, no type errors.

- [ ] **Step 4: Verify in browser**

The tempo knob should show its arc at ~51% (68 BPM out of 45–95 range) and respond to drag. Keyboard arrow keys should adjust BPM.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts
git commit -m "feat(ui): wire tempo knob drag and SVG in main.ts"
```

---

## Task 7: Update flash.ts for knob cells

**Files:**
- Modify: `src/ui/flash.ts`

The current implementation adds `.flash` to `input[type=range]` inside a row. The CSS flash style targets the input's thumb pseudo-element (now gone). We need to add `.flash` to the `.kn-cell` ancestor instead, where CSS targets `.kn-fill` and `.kn-dot`.

- [ ] **Step 1: Update flashRow to target .kn-cell**

Replace the body of `flash.ts` with:

```typescript
const FLASH_DUR = 80;

/**
 * Fire a brief CSS flash on the given mixer-cell's SVG arcs at the
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
    row.classList.add("flash");
    setTimeout(() => row.classList.remove("flash"), duration);
  }, Math.max(0, delayMs));
}
```

- [ ] **Step 2: Verify flash CSS targets are correct**

The CSS from Task 1 already has:
```css
.kn-cell.flash .kn-fill { stroke: #fff; filter: drop-shadow(0 0 4px var(--warm)); }
.kn-cell.flash .kn-dot  { fill: #fff;   filter: drop-shadow(0 0 4px var(--warm)); }
```

The flash row IDs used in the scheduler (e.g. `mx-drums`, `mx-bass`, `mx-comp`, `mx-melody`) must match the `.kn-cell` IDs in the HTML. Confirm they do — in Task 2 we set `id="mx-drums"` etc on the `.kn-cell` divs. ✓

- [ ] **Step 3: Run checks**

```bash
deno task check && deno task test
```

Expected: all 99 tests pass.

- [ ] **Step 4: Verify flash in browser**

Start playback, open the controls panel. When drums/bass/piano/melody play, the corresponding knob's fill arc and dot should briefly brighten white.

- [ ] **Step 5: Commit**

```bash
git add src/ui/flash.ts
git commit -m "fix(ui): update flashRow to target .kn-cell for knob flash animation"
```

---

## Task 8: Clean up old slider CSS

**Files:**
- Modify: `index.html` (CSS section)

- [ ] **Step 1: Remove mixer-specific slider CSS that no longer applies**

The following rules styled `.mx-row input[type="range"]` and its thumb — these no longer exist in the mixer panel. Remove these blocks from `index.html`:

```css
/* Remove: */
.mx-row input[type="range"].flash::-webkit-slider-thumb { ... }
.mx-row input[type="range"].flash::-moz-range-thumb { ... }
input[type="range"] { ... }
input[type="range"]::-webkit-slider-thumb { ... }
input[type="range"]::-moz-range-thumb { ... }
.mx-row input[type="range"] { ... }
.mx-lbl { ... }
.mx-val { ... }
.mx-row { ... }
```

Keep `.mx-div` (the divider is still used).

The volume slider (`#volSlider`) still uses `input[type="range"]`. Add specific styles for it so it keeps its original look:

```css
      /* ── Volume slider (only range input remaining) ── */
      #volSlider {
        -webkit-appearance: none;
        width: 100%;
        height: 3px;
        background: rgba(255, 255, 255, 0.12);
        border-radius: 2px;
        outline: none;
        cursor: pointer;
      }
      #volSlider::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: var(--warm);
        border: 2px solid rgba(0, 0, 0, 0.4);
        cursor: pointer;
        transition:
          transform 0.06s ease,
          background 0.06s ease,
          box-shadow 0.06s ease;
      }
      #volSlider::-moz-range-thumb {
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: var(--warm);
        border: 2px solid rgba(0, 0, 0, 0.4);
        transition:
          transform 0.06s ease,
          background 0.06s ease,
          box-shadow 0.06s ease;
      }
```

- [ ] **Step 2: Run checks**

```bash
deno task check && deno task test
```

Expected: all 99 tests pass.

- [ ] **Step 3: Verify in browser**

- Volume slider still looks correct
- Knobs look correct (no visual regression from removed CSS)
- Knob drag, keyboard, and flash all still work

- [ ] **Step 4: Final commit**

```bash
git add index.html
git commit -m "chore(ui): remove stale mixer slider CSS, scope vol slider styles"
```

---

## Self-Review

**Spec coverage:**
- [x] 12 mixer panel knobs — Tasks 2–7
- [x] Vol slider unchanged — Task 8
- [x] Grid layout with `--kn-size` variable — Task 1
- [x] Tempo spans 2 columns (2-column sub-grid) — Task 2
- [x] Track arc / fill arc / indicator dot — Tasks 3–5
- [x] Flash animation on kn-cell — Tasks 1, 7
- [x] Vertical drag (200px = full sweep) — Task 4
- [x] Keyboard via native input — Tasks 2 (input remains in tab order)
- [x] `aria-label` on each input — Task 2 HTML
- [x] `aria-valuetext` updated on change — Task 3 `updateKnobSvg`
- [x] `:focus-within` ring — Task 1 CSS
- [x] `aria-hidden` on SVGs — Task 2 HTML
- [x] `initKnobDrag` + `updateKnobSvg` exported for main.ts — Tasks 3–4, 6

**Placeholder scan:** None found.

**Type consistency:** `updateKnobSvg(input: HTMLInputElement): void` and `initKnobDrag(input: HTMLInputElement): void` are used consistently across Tasks 3, 4, 5, 6.
