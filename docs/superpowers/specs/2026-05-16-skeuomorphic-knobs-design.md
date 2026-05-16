# Skeuomorphic Mixer Knobs — Design Spec

**Date:** 2026-05-16  
**Status:** Approved

## Overview

Replace the 12 `input[type="range"]` sliders in the mixer panel with skeuomorphic rotary knobs. The main volume slider is unchanged. The knobs use a hidden native input for all accessibility and keyboard behaviour; an SVG overlay provides the visual knob.

## Scope

- Affects: `.mixer-panel` in `index.html` only
- Out of scope: volume slider (`.vol-row`), mood buttons, play/skip controls

## HTML Structure

Each current `.mx-row` becomes a `.kn-cell`:

```html
<div class="kn-cell">
  <div class="kn-wrap">
    <svg class="kn-svg" aria-hidden="true">
      <!-- track arc, fill arc, indicator dot -->
    </svg>
    <input
      type="range"
      class="kn-input"
      aria-label="drums"
      aria-valuetext="90%"
      min="0" max="1" step="0.01" value="0.9"
    />
  </div>
  <span class="kn-lbl">drums</span>
  <span class="kn-val">90</span>
</div>
```

The 12 cells sit in a `.kn-grid`. Tempo and complexity follow the existing `.mx-div` divider in the same grid; tempo uses `grid-column: span 2` to reflect its wider range (45–95 BPM).

## Visual Design

The SVG knob has three layers:

1. **Track arc** — 270° partial circle (7 o'clock to 5 o'clock), thin stroke `rgba(255,255,255,0.12)`
2. **Fill arc** — same path clipped to current value, stroke `var(--warm)`
3. **Indicator dot** — small circle at tip of fill arc, fill `var(--warm)`

The knob body is a dark circle with a subtle radial gradient (lighter centre, darker edge) for depth. No chrome or fake highlights.

**Flash animation** (triggered when an instrument plays): fill arc and indicator dot briefly go white with a `var(--warm)` glow, mirroring the existing slider thumb flash.

## Layout

```css
.kn-grid {
  --kn-size: 52px;          /* single variable to resize all knobs */
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px 8px;
  padding: 12px 0 8px;
}
```

12 instrument knobs → 3 rows of 4. Tempo spans 2 columns, complexity spans 2 columns, below the `.mx-div` divider.

Label (`kn-lbl`) and numeric value (`kn-val`) sit below each knob, styled identically to the existing `.mx-lbl` and `.mx-val` (0.58rem DM Mono, `var(--dim)` / `var(--dimmer)`).

## Interaction

### Drag (mouse & touch)

- `pointerdown` on `.kn-wrap`: capture pointer, record start Y and input value
- `pointermove`: `Δy` maps linearly to value change; 200px upward = full range sweep (sensitivity configurable via `--kn-drag-px`, default `200`)
- Update hidden input value and dispatch synthetic `input` event — existing JS listeners fire unchanged
- `pointerup`: release pointer capture

### Keyboard

No custom keyboard code. Focus targets the hidden `<input type="range">`, which natively handles:
- Arrow keys: ±1 step
- Page Up/Down: ±10% of range
- Home/End: min/max

### Focus visible

```css
.kn-wrap:focus-within {
  outline: 2px solid var(--warm);
  border-radius: 50%;
  outline-offset: 3px;
}
```

## Accessibility (WCAG 2.1 AA)

| Requirement | Implementation |
|---|---|
| Keyboard operable | Native `<input type="range">` in tab order |
| Screen reader label | `aria-label` on each input matching visible label text |
| Screen reader value | `aria-valuetext` updated to e.g. `"72%"` on every value change |
| Focus visible | `:focus-within` ring on `.kn-wrap` |
| Decorative SVG hidden | `aria-hidden="true"` on all SVG elements |
| Hidden input reachable | `position: absolute; opacity: 0` — NOT `display:none` |

## JS Changes

- Pointer drag handlers added to each `.kn-wrap` (initialised in `src/ui/controls.ts`)
- On value change: update SVG fill arc + indicator dot position, update `aria-valuetext`, update `.kn-val` text — same as current slider `input` handler
- Flash animation: add/remove a `.flash` class on `.kn-cell`; CSS targets the SVG fill arc and dot

## Files Likely Touched

- `index.html` — HTML structure, CSS (knob styles replace slider styles)
- `src/ui/` — mixer init / event wiring (pointer handlers, SVG update fn)
