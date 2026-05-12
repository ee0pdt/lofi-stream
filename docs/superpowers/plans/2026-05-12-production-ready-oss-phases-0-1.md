# Production-Ready OSS — Phases 0+1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Deno-based tooling skeleton and fix the unicode contamination that silently breaks CSS, producing a repo that is type-checked, lint-clean, format-clean, unicode-clean, and ready for module extraction in subsequent phases.

**Architecture:** Two sequential phases as separate PRs. Phase 0 adds the tooling files (deno.json, scripts, hooks, workflows, docs) without touching `index.html`. Phase 1 fixes the unicode contamination in `index.html` and wires the unicode scanner into CI.

**Tech Stack:** Deno 2.x (single binary tool for type checking, linting, formatting, testing, dev server). TypeScript for tooling scripts. Bash for git hooks. GitHub Actions for CI. No npm, no node_modules.

**Spec:** `docs/superpowers/specs/2026-05-12-production-ready-oss-design.md`

**Scope note:** This plan covers phases 0 and 1 only. Phases 2–9 (module extraction, then deploy cutover) will get their own plans, each written after the prior phase lands. Phase 2 onward requires intimate knowledge of `index.html` internals that's best gained during the work itself.

---

## Pre-flight

### Task 1: Commit the existing spec and plan to main

The spec and this plan are currently untracked. Get them on main before opening any feature branch.

**Files:**
- Track: `docs/superpowers/specs/2026-05-12-production-ready-oss-design.md`
- Track: `docs/superpowers/plans/2026-05-12-production-ready-oss-phases-0-1.md`

- [ ] **Step 1: Verify clean state and remote**

Run:
```bash
git status
git remote -v
```

Expected: branch `main`, remote `origin` pointing to GitHub. Only untracked files should be under `docs/`.

- [ ] **Step 2: Commit the spec and plan**

Run:
```bash
git add docs/
git commit -m "docs: add production-ready OSS spec and phase 0+1 plan"
git push origin main
```

Expected: push succeeds; main is up to date on GitHub.

---

## Phase 0 — Tooling Skeleton

Open a feature branch for the whole phase. Each task within commits to that branch. At the end, one PR.

### Task 2: Create the phase 0 feature branch

- [ ] **Step 1: Branch from main**

Run:
```bash
git checkout -b feat/phase-0-tooling-skeleton
```

Expected: switched to a new branch.

---

### Task 3: Add `.gitignore`

**Files:**
- Create: `.gitignore`

- [ ] **Step 1: Write the file**

Create `.gitignore` with:
```gitignore
# Build output
dist/

# macOS
.DS_Store

# Editors
.vscode/
.idea/

# Deno
deno.lock.bak
```

- [ ] **Step 2: Stage and commit**

Run:
```bash
git add .gitignore
git commit -m "chore: add .gitignore for dist/ and editor noise"
```

---

### Task 4: Add `deno.json`

**Files:**
- Create: `deno.json`

- [ ] **Step 1: Write the file**

Create `deno.json` with:
```jsonc
{
  "tasks": {
    "check": "deno fmt --check && deno lint",
    "test": "deno test -A",
    "fix": "deno fmt && deno lint --fix"
  },
  "fmt": {
    "indentWidth": 2,
    "singleQuote": false,
    "lineWidth": 100
  },
  "lint": {
    "rules": {
      "tags": ["recommended"]
    }
  },
  "compilerOptions": {
    "strict": true,
    "lib": ["dom", "dom.iterable", "deno.ns", "es2023"]
  }
}
```

Notes:
- `deno task check` currently runs only formatter + linter. The unicode scanner is wired in during Phase 1 (Task 16). `deno check` (TypeScript type-check) is wired in during Phase 2 once `src/` exists.
- `dev` and `build` tasks are added in Phase 2 alongside `src/`.

- [ ] **Step 2: Verify it parses**

Run:
```bash
deno task check
```

Expected: no errors (there are no TS files to format/lint yet, so this passes trivially).

- [ ] **Step 3: Commit**

Run:
```bash
git add deno.json
git commit -m "chore: add deno.json with check/test/fix tasks"
```

---

### Task 5: Write the unicode scanner — failing test

**Files:**
- Create: `scripts/check-unicode.test.ts`

The scanner detects forbidden characters that have caused silent CSS breakage. We use TDD: write the test first, watch it fail, then implement.

- [ ] **Step 1: Write the test file**

Create `scripts/check-unicode.test.ts` with:
```typescript
import { assertEquals } from "jsr:@std/assert@^1";
import { scanContent } from "./check-unicode.ts";

Deno.test("scanContent: clean content has no violations", () => {
  const violations = scanContent(":root { --warm: red; }", "test.css");
  assertEquals(violations.length, 0);
});

Deno.test("scanContent: en-dash in CSS property is flagged", () => {
  const violations = scanContent(":root { –warm: red; }", "test.css");
  assertEquals(violations.length, 1);
  assertEquals(violations[0].char, "–");
  assertEquals(violations[0].suggest, "--");
  assertEquals(violations[0].line, 1);
});

Deno.test("scanContent: smart single quotes are flagged", () => {
  const left = scanContent("font: ‘DM Mono’;", "test.css");
  assertEquals(left.length, 2);
  assertEquals(left[0].suggest, "'");
});

Deno.test("scanContent: smart double quotes are flagged", () => {
  const v = scanContent("foo “bar” baz", "test.html");
  assertEquals(v.length, 2);
  assertEquals(v[0].suggest, '"');
});

Deno.test("scanContent: em-dash in // comment is allowed", () => {
  const v = scanContent("// section — audio — here\nconst x = 1;", "test.ts");
  assertEquals(v.length, 0);
});

Deno.test("scanContent: em-dash in /* */ comment is allowed", () => {
  const v = scanContent("/* — banner — */\nconst x = 1;", "test.ts");
  assertEquals(v.length, 0);
});

Deno.test("scanContent: em-dash in multi-line /* */ comment is allowed", () => {
  const src = "/* line one\n line two with — dash\n line three */\nconst x = 1;";
  const v = scanContent(src, "test.ts");
  assertEquals(v.length, 0);
});

Deno.test("scanContent: em-dash outside any comment is flagged", () => {
  const v = scanContent("const s = 'hello — world';", "test.ts");
  assertEquals(v.length, 1);
  assertEquals(v[0].char, "—");
});

Deno.test("scanContent: em-dash in HTML <!-- --> comment is allowed", () => {
  const v = scanContent("<!-- — banner — -->", "test.html");
  assertEquals(v.length, 0);
});

Deno.test("scanContent: reports correct line and column for multi-line input", () => {
  const src = "line one\nline two\nline three with –dash";
  const v = scanContent(src, "test.css");
  assertEquals(v.length, 1);
  assertEquals(v[0].line, 3);
  assertEquals(v[0].col, 17);
});

Deno.test("scanContent: multiple violations on one line are all reported", () => {
  const v = scanContent("–one and –two", "test.css");
  assertEquals(v.length, 2);
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run:
```bash
deno test scripts/check-unicode.test.ts
```

Expected: FAIL with `Cannot find module './check-unicode.ts'` (or similar import error). This confirms the test runs and the implementation doesn't exist yet.

---

### Task 6: Implement the unicode scanner

**Files:**
- Create: `scripts/check-unicode.ts`

- [ ] **Step 1: Write the implementation**

Create `scripts/check-unicode.ts` with:
```typescript
export type Violation = {
  file: string;
  line: number;
  col: number;
  char: string;
  name: string;
  suggest: string;
};

type Rule = {
  char: string;
  name: string;
  suggest: string;
  allowInComments?: boolean;
};

// Characters are written as Unicode escapes so this source file itself
// stays clean of contamination (and can be self-scanned if needed).
const RULES: Rule[] = [
  { char: "\u2013", name: "en-dash (U+2013)", suggest: "--" },
  { char: "\u2014", name: "em-dash (U+2014)", suggest: "--", allowInComments: true },
  { char: "\u2018", name: "left smart quote (U+2018)", suggest: "'" },
  { char: "\u2019", name: "right smart quote (U+2019)", suggest: "'" },
  { char: "\u201C", name: "left smart double quote (U+201C)", suggest: '"' },
  { char: "\u201D", name: "right smart double quote (U+201D)", suggest: '"' },
];

const RULE_BY_CHAR = new Map(RULES.map((r) => [r.char, r]));

function record(
  out: Violation[],
  filename: string,
  line: number,
  col: number,
  ch: string,
  rule: Rule,
) {
  out.push({ file: filename, line, col, char: ch, name: rule.name, suggest: rule.suggest });
}

/**
 * Scan a single content string for forbidden characters.
 * Tracks `\/* *\/` and `<!-- -->` block comments across lines, and `//` line
 * comments within a single line. Em-dashes inside any of these are allowed;
 * smart quotes are flagged regardless of comment context.
 */
export function scanContent(text: string, filename: string): Violation[] {
  const violations: Violation[] = [];
  let inBlockC = false;
  let inBlockHtml = false;
  let line = 1;
  let lineStart = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === "\n") {
      line++;
      lineStart = i + 1;
      continue;
    }

    if (!inBlockC && !inBlockHtml && text.startsWith("/*", i)) {
      inBlockC = true;
      i++;
      continue;
    }
    if (inBlockC && text.startsWith("*/", i)) {
      inBlockC = false;
      i++;
      continue;
    }
    if (!inBlockC && !inBlockHtml && text.startsWith("<!--", i)) {
      inBlockHtml = true;
      i += 3;
      continue;
    }
    if (inBlockHtml && text.startsWith("-->", i)) {
      inBlockHtml = false;
      i += 2;
      continue;
    }

    // // line comment: handle the rest of the line specially, then jump past it.
    if (!inBlockC && !inBlockHtml && text.startsWith("//", i)) {
      const nl = text.indexOf("\n", i);
      const end = nl === -1 ? text.length : nl;
      for (let j = i; j < end; j++) {
        const rule = RULE_BY_CHAR.get(text[j]);
        if (rule && !rule.allowInComments) {
          record(violations, filename, line, j - lineStart + 1, text[j], rule);
        }
      }
      i = end - 1;
      continue;
    }

    const rule = RULE_BY_CHAR.get(ch);
    if (!rule) continue;
    const inComment = inBlockC || inBlockHtml;
    if (rule.allowInComments && inComment) continue;
    record(violations, filename, line, i - lineStart + 1, ch, rule);
  }

  return violations;
}

/**
 * Scan one or more files on disk, returning all violations.
 */
export async function scanFiles(paths: string[]): Promise<Violation[]> {
  const all: Violation[] = [];
  for (const path of paths) {
    const text = await Deno.readTextFile(path);
    all.push(...scanContent(text, path));
  }
  return all;
}

/**
 * Default paths to scan: project files where contamination matters.
 * Extended automatically when src/ exists in later phases.
 */
async function defaultPaths(): Promise<string[]> {
  const paths: string[] = [];
  try {
    await Deno.stat("index.html");
    paths.push("index.html");
  } catch { /* missing — fine */ }
  for await (const entry of expandGlob("src/**/*.{ts,css}")) {
    paths.push(entry.path);
  }
  return paths;
}

// Minimal glob: only used to expand src/**/*.{ts,css}.
async function* expandGlob(pattern: string): AsyncIterable<{ path: string }> {
  // Pattern like "src/**/*.{ts,css}" — split extensions.
  const m = pattern.match(/^(.+)\/\*\*\/\*\.\{(.+)\}$/);
  if (!m) return;
  const root = m[1];
  const exts = m[2].split(",");
  try {
    await Deno.stat(root);
  } catch {
    return;
  }
  for await (const entry of Deno.readDir(root)) {
    const path = `${root}/${entry.name}`;
    if (entry.isDirectory) {
      yield* expandGlob(`${path}/**/*.{${exts.join(",")}}`);
    } else if (exts.some((e) => entry.name.endsWith(`.${e}`))) {
      yield { path };
    }
  }
}

if (import.meta.main) {
  const paths = await defaultPaths();
  const violations = await scanFiles(paths);
  if (violations.length === 0) {
    console.log(`check-unicode: clean (${paths.length} file(s) scanned)`);
    Deno.exit(0);
  }
  for (const v of violations) {
    console.error(
      `${v.file}:${v.line}:${v.col}  ${v.name}  → suggest: ${JSON.stringify(v.suggest)}`,
    );
  }
  console.error(`\ncheck-unicode: ${violations.length} violation(s)`);
  Deno.exit(1);
}
```

- [ ] **Step 2: Run the tests, verify they pass**

Run:
```bash
deno test scripts/check-unicode.test.ts
```

Expected: all 11 tests PASS.

- [ ] **Step 3: Manual smoke against `index.html` (do not commit yet)**

Run:
```bash
deno run --allow-read scripts/check-unicode.ts
```

Expected: many violations reported (en-dashes, smart quotes) in `index.html`. This proves the scanner detects the real contamination. Exit code 1.

- [ ] **Step 4: Commit**

Run:
```bash
git add scripts/check-unicode.ts scripts/check-unicode.test.ts
git commit -m "feat(tooling): add unicode contamination scanner with tests

Scans index.html and src/**/*.{ts,css} for forbidden characters that
silently break CSS or look correct but aren't (en-dash, smart quotes,
smart double quotes). Em-dashes allowed inside //, /* */, and <!-- -->
comments. Not yet wired into deno task check — that happens in phase 1
alongside the index.html fix."
```

Note: scanner is NOT wired into `deno task check` yet. Wiring it now would fail on `index.html`. Phase 1 handles that.

---

### Task 7: Add `.githooks/pre-commit`

**Files:**
- Create: `.githooks/pre-commit`

- [ ] **Step 1: Write the hook**

Create `.githooks/pre-commit` with:
```bash
#!/usr/bin/env bash
set -e

# Skip if deno is not installed locally (CI has it; some contributors might not)
if ! command -v deno >/dev/null 2>&1; then
  echo "pre-commit: deno not installed, skipping checks"
  exit 0
fi

deno task check
deno task test
```

- [ ] **Step 2: Make it executable**

Run:
```bash
chmod +x .githooks/pre-commit
```

- [ ] **Step 3: Enable hooks for this repo (one-time, local-only)**

Run:
```bash
git config core.hooksPath .githooks
```

This is a local config (not committed). CONTRIBUTING.md instructs contributors to run the same command after cloning.

- [ ] **Step 4: Commit the hook itself**

Run:
```bash
git add .githooks/pre-commit
git commit -m "chore: add pre-commit hook running deno task check + test"
```

---

### Task 8: Move technical content to `docs/ARCHITECTURE.md`

**Files:**
- Create: `docs/ARCHITECTURE.md`
- Modify: `CLAUDE.md`

The current `CLAUDE.md` contains both architectural documentation and AI-assistant instructions. We split these: architecture moves to `docs/ARCHITECTURE.md` (audience: any contributor or AI); `CLAUDE.md` becomes a short pointer.

- [ ] **Step 1: Read the existing CLAUDE.md to know what to move**

Read `/Users/petethorne/Documents/Projects/lofi-stream/CLAUDE.md` and identify which sections describe architecture vs which are AI-specific instructions.

Architectural sections (move): Project, Running, Architecture (and all sub-sections), Conventions.
AI-instruction sections (keep in CLAUDE.md, rewritten): the implicit "this file is for Claude Code" framing.

Note: the "Known file corruption — fix on sight" section becomes obsolete after Phase 1 (the unicode scanner enforces it). For now, copy it into ARCHITECTURE.md; remove it from both files at the end of Phase 1.

- [ ] **Step 2: Write `docs/ARCHITECTURE.md`**

Create `docs/ARCHITECTURE.md` with content adapted from the current CLAUDE.md. Use this structure:

```markdown
# Architecture

## Overview

`lofi forever` is a single-page, zero-runtime-dependency generative lofi music player. Today everything (HTML, CSS, JS) lives in `index.html`. Migration to ES modules under `src/` is in progress — see `docs/superpowers/specs/2026-05-12-production-ready-oss-design.md`.

## Running locally

- `deno task dev` (once Phase 2 lands) — local dev server on port 8000
- Until Phase 2: open `index.html` directly in a browser

A user gesture is required before audio starts: `AudioContext` is created lazily inside `initAudio()`, triggered by the play button.

WebGPU is used for the background when available (`navigator.gpu`); otherwise Canvas2D (`startCanvas2D()`). Both render into `#bg`.

## Known file corruption (temporary — fixed in Phase 1)

The HTML file has unicode contamination from a prior paste/edit. Phase 1 of the migration fixes this and the `scripts/check-unicode.ts` scanner prevents reintroduction:

- **CSS custom properties use `–` (U+2013 en-dash) instead of `--`** — these are invalid CSS, browser silently drops every rule referencing them
- **CSS strings use `'` `'` (U+2018/U+2019 smart quotes) instead of `'`** — font-family declarations and `@property` syntax descriptors
- **Stray markdown code fences inside `<body>`** — render as visible text in the sheet UI

Em-dashes (`—`) in comments are intentional decoration and harmless.

## Background renderer

`tryWebGPU()` attempts a WebGPU pipeline with a fragment shader rendering 5 drifting Gaussian blobs over a base colour. Falls back to `startCanvas2D()` if WebGPU is unavailable. Both react to `bgAmplitude`, fed by the audio analyser via `updateBgAmplitude()`.

## Music generation

Deterministic-form / probabilistic-content system — the chord sequence is fixed per mood, but voicings, melodies, and ornaments are sampled fresh each bar.

- **`FORMS`**: per-mood compositional forms as ordered arrays of `{ bars, prog }` sections, where each `prog` is a 4-chord cycle of `[rootOffsetSemitones, voicingName]`. The form playhead (`formSectionIdx`, `formBarInSection`, `formBarInProg`) advances once per bar in `advanceFormPlayhead()`; sections loop in order.
- **`MOOD_META`**: per-mood timbral + harmonic config — BPM range, swing range, allowed keys (`key_pool`), reverb impulse parameters, snare/bass filter shaping, comp/melody timbre choice (`rhodes` / `vibraphone` / `guitar` / `pad` / `celesta`), and ambience type (`rain` / `traffic` / `room` / `wind`).
- **`VOICINGS`**: jazz chord-quality recipes (`min7`, `maj9`, etc.) as semitone-offset arrays.
- **`generatePhrase()` / `scheduleBar()`**: generate one 4-bar melodic phrase per chord cycle, then schedule comp/melody/bass/drums for the next bar. `complexity` (0–1) gates re-comps, melodic ornaments, and walking-bass density.

## Web Audio scheduler

Lookahead scheduler at 50 ms interval with a **3-second lookahead**. The 3 s buffer is deliberate: Safari throttles `setTimeout` to ~1 Hz when the tab is hidden, but the Web Audio clock keeps running, so pre-scheduled events still fire on time. `visibilitychange` resumes the `AudioContext` and immediately flushes the scheduler on tab restore.

## Audio graph

`initAudio()`. Per-track gain nodes (`drums`, `bass`, `comp`, `melody`, `hiss`, `scratches`, `ambience`, `hum`) → `masterGain` → `DynamicsCompressor` → low-shelf + high-shelf filters (tape colour) → split into dry + reverb (`ConvolverNode` with a per-mood IR built by `buildIR()`) → `AnalyserNode` → destination. Rain, ambience, hum, and a global wow/flutter LFO bus (`warpModGain`, summed into oscillator `detune` params via `applyWarp()`) are constructed once here.

## Mood switching

`changeMood()`: crossfades master gain down (0.7 s), swaps mood, regenerates a fresh progression, rebuilds reverb IR, restarts ambience, then fades up (1.2 s) to the new mood's saved volume. Each mood has its own slider state in `moodSettings` (cloned from `DEFAULT_SETTINGS`) — switching moods restores that mood's last-used mixer values.

## UI

A draggable bottom sheet with a Web Audio frequency-band visualiser (`drawVis()`). Most controls are plain `<input type="range">` elements wired to `applySettingToAudio(key, val)` which routes each slider to the relevant `AudioParam`.

## Conventions

- All audio scheduling uses `actx.currentTime` and absolute times — never `setTimeout` for note timing.
- New oscillators that should respond to global warp must be wired through `applyWarp(osc)` after creation.
- Per-mood differences belong in `MOOD_META` and `FORMS` — avoid `if (currentMood === ...)` branches deep in the scheduler; add a config field instead.
```

- [ ] **Step 3: Commit ARCHITECTURE.md**

Run:
```bash
git add docs/ARCHITECTURE.md
git commit -m "docs: add ARCHITECTURE.md (lifted from CLAUDE.md)"
```

---

### Task 9: Slim `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Overwrite `CLAUDE.md` with the slimmed version**

Replace the contents of `/Users/petethorne/Documents/Projects/lofi-stream/CLAUDE.md` with:

```markdown
# CLAUDE.md

This file is read by Claude Code (and other AI assistants) when working on this repository.

## Project

`lofi forever` — a single-page, zero-runtime-dependency generative lofi music player. The system design is documented in [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## Running

- `deno task dev` for local development (once Phase 2 of the migration lands; until then, open `index.html` directly).
- See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for setup and contribution workflow.

## Required of any assistant working here

- **Always** run `deno task check && deno task test` and confirm clean output before reporting any work as done. Do not assume; confirm.
- Follow the conventions in [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — specifically:
  - audio scheduling uses absolute `actx.currentTime` values, never `setTimeout`
  - new oscillators that should respond to global warp must be wired through `applyWarp(osc)` after creation
  - per-mood differences belong in `MOOD_META` and `FORMS`, not in scheduler-level conditionals
- Touch one module at a time when extracting code — small focused diffs review better than sweeping changes.
- The migration to ES modules is staged across phases. The current phase plan lives under `docs/superpowers/plans/`. Read the latest one before starting work.

## What lives where

- `index.html` — the app (will be slimmed to a shell in Phase 8)
- `src/` — TypeScript modules (populated from Phase 2 onward)
- `tests/` — Deno tests
- `scripts/` — tooling: unicode scanner, dev server, build
- `docs/ARCHITECTURE.md` — system design
- `docs/superpowers/specs/` — design specs
- `docs/superpowers/plans/` — implementation plans
```

- [ ] **Step 2: Commit**

Run:
```bash
git add CLAUDE.md
git commit -m "docs: slim CLAUDE.md to assistant pointer (architecture moved to docs/)"
```

---

### Task 10: Add `README.md`

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write the file**

Create `README.md` with:
```markdown
# lofi forever

A single-page, zero-runtime-dependency generative lofi music player. Plays forever in your browser.

→ **Try it:** https://ee0pdt.github.io/lofi-stream/ *(activates once Phase 8 of the migration lands)*

## What it is

- 4-bar phrases over fixed per-mood chord progressions, with fresh voicings each bar
- Per-mood timbres: rhodes, vibraphone, guitar, pad, celesta
- Tape colour, wow/flutter, optional rain / traffic / room / wind ambience
- WebGPU background (Canvas2D fallback)
- No frameworks, no npm packages, no analytics

## Running locally

1. Install [Deno](https://deno.com)
2. Clone this repo
3. *Until Phase 2 of the migration lands:* open `index.html` directly in a browser
4. *After Phase 2:* `deno task dev`, then open http://localhost:8000

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Architecture

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## Licence

MIT — see [`LICENSE`](./LICENSE).
```

- [ ] **Step 2: Commit**

Run:
```bash
git add README.md
git commit -m "docs: add README"
```

---

### Task 11: Add `CONTRIBUTING.md`

**Files:**
- Create: `CONTRIBUTING.md`

- [ ] **Step 1: Write the file**

Create `CONTRIBUTING.md` with:
```markdown
# Contributing

Thanks for your interest in lofi-stream.

## Setup

1. Install [Deno](https://deno.com) (`brew install deno` on macOS, see Deno docs for others)
2. Clone the repo
3. One-time: enable the pre-commit hook
   ```bash
   git config core.hooksPath .githooks
   ```
4. Run the app:
   - Until Phase 2 lands: open `index.html` directly in a browser
   - From Phase 2: `deno task dev`, then open http://localhost:8000

There is no `npm install`, no `node_modules`. Deno is the only tool.

## Tasks

- `deno task check` — formatter, linter, unicode scanner (from Phase 1), type-check (from Phase 2)
- `deno task test` — all tests
- `deno task fix` — auto-fix formatting and lint issues
- `deno task dev` — local dev server (from Phase 2)
- `deno task build` — produce `dist/` for deployment (from Phase 2)

## Before opening a PR

- `deno task check` passes
- `deno task test` passes
- New behaviour has a test where reasonable (especially anything in `src/music/`)

## Adding a new mood (from Phase 2 onward)

1. Add an entry to `src/music/moods.ts` (`MOOD_META`)
2. Add a form to `src/music/forms.ts` (`FORMS`)
3. Add a button to `index.html` and wire it in `src/ui/controls.ts`
4. `deno task test` will fail if `MOOD_META` and `FORMS` keys do not match — that's intentional

## Watch out for

- **Unicode contamination.** En-dashes (`–` U+2013), smart quotes (`' '`), and smart double quotes (`" "`) silently break CSS. The unicode scanner catches these. Do not paste from rich-text sources.
- **Audio timing.** All audio scheduling must use `actx.currentTime` and absolute times. Never `setTimeout` for note timing.
- **Global warp.** New oscillators that should respond to global wow/flutter must be wired through `applyWarp(osc)` after creation.
- **Per-mood config.** Mood differences belong in `MOOD_META` and `FORMS`, not in `if (currentMood === ...)` branches inside the scheduler.

## Filing issues

See `.github/ISSUE_TEMPLATE/`. Bugs: include mood, browser, what happened, what you expected, console output. Features: what, why, how you would use it.
```

- [ ] **Step 2: Commit**

Run:
```bash
git add CONTRIBUTING.md
git commit -m "docs: add CONTRIBUTING.md"
```

---

### Task 12: Add issue templates

**Files:**
- Create: `.github/ISSUE_TEMPLATE/bug.md`
- Create: `.github/ISSUE_TEMPLATE/feature.md`

- [ ] **Step 1: Write `bug.md`**

Create `.github/ISSUE_TEMPLATE/bug.md` with:
```markdown
---
name: Bug report
about: Something does not work
title: ''
labels: bug
---

**What mood / which controls?**

**Browser and OS:**

**What happened:**

**What you expected:**

**Console output (any errors?):**
```

- [ ] **Step 2: Write `feature.md`**

Create `.github/ISSUE_TEMPLATE/feature.md` with:
```markdown
---
name: Feature request
about: Suggest something
title: ''
labels: enhancement
---

**What would you want?**

**Why — what's the use case?**

**How would you use it?**
```

- [ ] **Step 3: Commit**

Run:
```bash
git add .github/ISSUE_TEMPLATE/
git commit -m "chore: add issue templates"
```

---

### Task 13: Add PR template

**Files:**
- Create: `.github/pull_request_template.md`

- [ ] **Step 1: Write the file**

Create `.github/pull_request_template.md` with:
```markdown
## What this changes



## How to test



## Anything to watch for

```

- [ ] **Step 2: Commit**

Run:
```bash
git add .github/pull_request_template.md
git commit -m "chore: add PR template"
```

---

### Task 14: Add the CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/ci.yml` with:
```yaml
name: ci

on:
  pull_request:
  push:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v2
        with:
          deno-version: v2.x
      - name: Check (fmt + lint)
        run: deno task check
      - name: Test
        run: deno task test
```

Note: the `smoke` and `deploy` jobs come in Phase 8 once `src/` and a buildable artifact exist. Today, `deno task check` passes trivially (no source files yet); `deno task test` runs the scanner's own unit tests.

- [ ] **Step 2: Commit**

Run:
```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions workflow running deno task check + test"
```

---

### Task 15: Push phase 0 and open the PR

- [ ] **Step 1: Run full check locally as a sanity pass**

Run:
```bash
deno task check
deno task test
```

Expected: both pass.

- [ ] **Step 2: Push the branch**

Run:
```bash
git push -u origin feat/phase-0-tooling-skeleton
```

Expected: branch pushed; PR URL printed.

- [ ] **Step 3: Open the PR**

Run:
```bash
gh pr create --title "Phase 0: Deno tooling skeleton" --body "$(cat <<'EOF'
## What this changes

Establishes the Deno-based tooling skeleton described in [the OSS migration spec](../docs/superpowers/specs/2026-05-12-production-ready-oss-design.md):

- `deno.json` — `check`, `test`, `fix` tasks
- `scripts/check-unicode.ts` — scanner for the en-dash / smart-quote contamination, with unit tests (not yet wired into `deno task check`; that happens in Phase 1)
- `.githooks/pre-commit` — runs `deno task check && deno task test`
- `docs/ARCHITECTURE.md` — system design (lifted from CLAUDE.md)
- Slimmed `CLAUDE.md` to assistant pointer
- `README.md`, `CONTRIBUTING.md`
- Issue + PR templates
- `.github/workflows/ci.yml`
- `.gitignore`

`index.html` is unchanged; the app still runs by opening it directly. Unicode contamination is fixed in Phase 1.

## How to test

- `deno task check` passes (formatter + linter clean)
- `deno task test` passes (unicode scanner unit tests)
- CI green on this PR

## Anything to watch for

The unicode scanner finds real contamination in `index.html` (run `deno run -A scripts/check-unicode.ts` to see) but is not yet wired into `deno task check`. Phase 1 fixes the contamination and adds the wiring in the same PR so CI always passes on `main`.
EOF
)"
```

- [ ] **Step 4: Wait for CI green, then merge**

Wait for the `check` workflow to pass on the PR (visible at the PR URL). When green:
```bash
gh pr merge --squash --delete-branch
```

Expected: PR merged into `main`, feature branch deleted. Local main needs a refresh:
```bash
git checkout main
git pull origin main
```

---

## Phase 1 — Unicode Fix

### Task 16: Create the phase 1 feature branch and capture a baseline screenshot

- [ ] **Step 1: Branch from main**

Run:
```bash
git checkout main
git pull origin main
git checkout -b feat/phase-1-unicode-fix
```

- [ ] **Step 2: Capture pre-fix visual state**

Open `index.html` in a browser. Take a full-page screenshot and save it locally (not committed) as `before-unicode-fix.png`. This is a manual reference — after the fix, the visible styling of the bottom sheet, the warm-tone tokens, and the borders should be richer (because previously-dropped CSS rules will now apply).

There is nothing to commit in this step.

---

### Task 17: Replace en-dashes throughout CSS

**Files:**
- Modify: `index.html` (CSS block within `<style>`, approximately lines 22–470)

The 48 en-dash characters (`–`, U+2013) appear in `:root` declarations, `@property` selectors, transition lists, and `var()` references. They must all become `--`. This is a mechanical replacement; do it with `sed` to guarantee no manual typos.

- [ ] **Step 1: Verify current en-dash count**

Run:
```bash
grep -c -P "[\x{2013}]" index.html
```

Expected: `48`.

- [ ] **Step 2: Replace all en-dashes with double hyphens (single command)**

Run (note: requires `gsed` on macOS, or use the second form):
```bash
# macOS (BSD sed handles -i differently)
sed -i '' 's/\xE2\x80\x93/--/g' index.html

# Linux (GNU sed)
# sed -i 's/\xE2\x80\x93/--/g' index.html
```

Alternatively, in pure Deno (cross-platform):
```bash
deno eval 'const t = await Deno.readTextFile("index.html"); await Deno.writeTextFile("index.html", t.replaceAll("–", "--"));'
```

- [ ] **Step 3: Verify no en-dashes remain**

Run:
```bash
grep -c -P "[\x{2013}]" index.html
```

Expected: `0`.

- [ ] **Step 4: Spot-check the result**

Run:
```bash
sed -n '20,50p' index.html
```

Expected output (showing valid CSS now):
```
      :root {
        --warm: #c97d40;
        --warm2: #e8b07a;
        --glass: rgba(10, 13, 18, 0.78);
        ...
      }
      @property --warm {
        syntax: '<color>';
        ...
```

(Note: the smart quotes on the `syntax:` lines will still be present — they're fixed in the next task.)

- [ ] **Step 5: Open `index.html` in a browser to verify**

Open the file. Compare against the baseline screenshot. The bottom sheet should now have its warm border, glass background, and proper text colours — these CSS rules were silently dropping before because `var(–glass)` etc. referenced an invalid identifier.

If something looks broken (rather than improved), stop and investigate before continuing.

- [ ] **Step 6: Commit**

Run:
```bash
git add index.html
git commit -m "fix(css): replace en-dashes (U+2013) with double hyphens

The CSS custom property declarations and var() references used U+2013
en-dashes instead of '--'. These were invalid CSS — every rule
referencing them was silently dropped by the browser.

48 occurrences fixed. Visible result: the bottom sheet now picks up its
warm border, glass background, and proper text colours."
```

---

### Task 18: Replace smart single quotes with straight quotes

**Files:**
- Modify: `index.html` (CSS `font-family` declarations and `@property` `syntax:` descriptors)

The 8 smart single quotes (`'` U+2018 / `'` U+2019) appear in `font-family` declarations (`'DM Mono'`, `'DM Serif Display'`) and `@property` `syntax:` lines (`'<color>'`). They must become `'`.

- [ ] **Step 1: Verify current count**

Run:
```bash
grep -c -P "[\x{2018}\x{2019}]" index.html
```

Expected: `8`.

- [ ] **Step 2: Replace all smart single quotes with straight single quotes**

Run:
```bash
deno eval 'const t = await Deno.readTextFile("index.html"); await Deno.writeTextFile("index.html", t.replaceAll("‘", "'").replaceAll("’", "'"));'
```

- [ ] **Step 3: Verify none remain**

Run:
```bash
grep -c -P "[\x{2018}\x{2019}]" index.html
```

Expected: `0`.

- [ ] **Step 4: Reload `index.html` in the browser**

The font should now be `DM Mono` / `DM Serif Display` where appropriate (the `font-family` declarations now parse). Previously these silently fell back to `monospace` only.

- [ ] **Step 5: Commit**

Run:
```bash
git add index.html
git commit -m "fix(css): replace smart single quotes with straight quotes

The font-family declarations and @property syntax descriptors used
U+2018 and U+2019 smart quotes instead of '. These were invalid CSS —
the font-family fell back to monospace and @property declarations
were silently dropped.

8 occurrences fixed."
```

---

### Task 19: Remove stray markdown code fences from `<body>`

**Files:**
- Modify: `index.html` (lines 472, 527, 660, 688 approximately — paste artifacts)

Four `` ``` `` markdown code fences are inside `<body>`, rendering as visible text in the sheet UI.

- [ ] **Step 1: Find the lines**

Run:
```bash
grep -n '^[[:space:]]*```[[:space:]]*$' index.html
```

Expected: 4 line numbers. (They are likely at approximately 472, 527, 660, 688 per the old `CLAUDE.md` note, but may have shifted slightly during the previous fixes — use the actual output.)

- [ ] **Step 2: Remove those exact lines**

Run:
```bash
deno eval '
const t = await Deno.readTextFile("index.html");
const lines = t.split("\n");
const kept = lines.filter((line) => !/^\s*```\s*$/.test(line));
await Deno.writeTextFile("index.html", kept.join("\n"));
'
```

- [ ] **Step 3: Verify no fences remain**

Run:
```bash
grep -c -P "^\s*\`\`\`\s*$" index.html
```

Expected: `0`.

- [ ] **Step 4: Reload `index.html` in the browser**

The visible ` ``` ` text fragments should be gone from the sheet UI.

- [ ] **Step 5: Commit**

Run:
```bash
git add index.html
git commit -m "fix(html): remove stray markdown code fences from <body>

Four stray triple-backtick lines from a prior paste/edit were
rendering as visible text in the sheet UI."
```

---

### Task 20: Wire the unicode scanner into `deno task check`

**Files:**
- Modify: `deno.json`

- [ ] **Step 1: Update the `check` task**

Edit `deno.json`. Replace:
```jsonc
    "check": "deno fmt --check && deno lint",
```
with:
```jsonc
    "check": "deno run --allow-read scripts/check-unicode.ts && deno fmt --check && deno lint",
```

- [ ] **Step 2: Run the full check locally**

Run:
```bash
deno task check
```

Expected: passes. The scanner reports `check-unicode: clean (1 file(s) scanned)`. Formatter and linter clean.

If the scanner reports violations, the unicode fixes are incomplete. Re-run tasks 17–19 verification steps to find what remains.

- [ ] **Step 3: Commit**

Run:
```bash
git add deno.json
git commit -m "ci: wire unicode scanner into deno task check

Now that index.html is unicode-clean, the scanner runs on every check.
Pre-commit hook and CI both enforce it."
```

---

### Task 21: Remove the now-obsolete \"Known file corruption\" section from `docs/ARCHITECTURE.md`

**Files:**
- Modify: `docs/ARCHITECTURE.md`

The "Known file corruption (temporary — fixed in Phase 1)" section is now obsolete. Remove it. The scanner prevents reintroduction; CONTRIBUTING.md's "Watch out for" section gives contributors the guidance they need.

- [ ] **Step 1: Edit the file**

Remove the entire `## Known file corruption (temporary — fixed in Phase 1)` heading and its paragraph from `docs/ARCHITECTURE.md`.

- [ ] **Step 2: Commit**

Run:
```bash
git add docs/ARCHITECTURE.md
git commit -m "docs: drop 'known file corruption' section (fix landed)"
```

---

### Task 22: Push phase 1 and open the PR

- [ ] **Step 1: Push the branch**

Run:
```bash
git push -u origin feat/phase-1-unicode-fix
```

- [ ] **Step 2: Open the PR**

Run:
```bash
gh pr create --title "Phase 1: Fix unicode contamination" --body "$(cat <<'EOF'
## What this changes

Fixes the unicode contamination in `index.html` and wires the scanner into `deno task check`:

- 48 en-dashes (`–` U+2013) → `--` in CSS custom property declarations and `var()` references
- 8 smart single quotes (`'` `'`) → `'` in font-family declarations and `@property` syntax descriptors
- 4 stray markdown code fences removed from `<body>`
- `scripts/check-unicode.ts` wired into `deno task check`
- "Known file corruption" section removed from `docs/ARCHITECTURE.md`

## How to test

- `deno task check` passes
- Open `index.html` in a browser: the bottom sheet shows its warm border, glass background, and proper fonts (these CSS rules were silently dropping before)
- No visible triple-backtick fragments anywhere

## Anything to watch for

This is a CSS-rendering change as well as a textual one. Many rules that previously dropped silently now apply. Compare against the pre-fix screenshot if you want to see the difference.
EOF
)"
```

- [ ] **Step 3: Wait for CI green, then merge**

```bash
gh pr merge --squash --delete-branch
git checkout main
git pull origin main
```

---

## Done

At this point:
- The repo has its tooling skeleton (Deno, scanner, CI, hooks, docs)
- `index.html` is unicode-clean and visually correct
- Every commit on `main` passes `deno task check && deno task test`
- The repo is ready for Phase 2: extracting pure data + types into `src/`

The Phase 2 plan should be written next, after pausing here to verify nothing was overlooked.
