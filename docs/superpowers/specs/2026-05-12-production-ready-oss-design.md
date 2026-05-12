# Production-Ready Open Source — Design Spec

**Date:** 2026-05-12
**Status:** Approved, awaiting implementation plan
**Project:** lofi-stream (`lofi forever`)

## Context

The project is a single-file (~3.2k lines), zero-runtime-dependency generative lofi music player. Everything — HTML, CSS, JS — lives in `index.html`. There is no build step, no package manager, no tests, no framework. The deployed artifact is the source file.

Four problems make refining features painful today:

1. **One giant file.** The 3.2k-line `index.html` is hard to navigate, hard to hold in your head, and intimidating to edit because changes ripple unpredictably.
2. **No safety net.** The only way to know if a change broke something is to play the app and listen.
3. **Silent bugs.** A prior paste/edit introduced unicode contamination — en-dashes (`–` U+2013) instead of `--` in CSS custom property names, smart quotes instead of `'`, and stray markdown code fences inside `<body>`. The browser silently drops every CSS rule that references the corrupted identifiers. There is no tooling to detect or prevent this class of issue.
4. **Contributor onboarding.** Architecture is documented only in `CLAUDE.md`. No contributing guide, no obvious place to make a small change.

This spec describes a path to a production-ready open source project that addresses all four — without inflating the project beyond what a small generative-music utility warrants.

## Non-goals

- Becoming a framework or library that other projects depend on.
- Supporting more than one deployed artifact (one HTML shell + one JS bundle is the target).
- Heavy testing of subjective musical quality. Tests pin deterministic data and integration behaviour; they do not assert that "the music sounds good."
- A mobile app, an Electron wrapper, a server-side component, or any non-browser distribution.
- Switching frameworks. The app remains vanilla DOM + Web Audio + WebGPU.

## Decisions

### Tooling

- **Source language:** TypeScript (`.ts` files in `src/`).
- **Toolchain:** Deno as the single binary tool for everything (type checking, linting, formatting, testing, dev server, build). No `package.json`, no `node_modules`, no npm.
- **Build:** required, because browsers cannot run TypeScript directly. The build is one Deno script (`scripts/build.ts`) using esbuild via JSR. It produces `dist/main.js` and copies `index.html` into `dist/`.
- **Dev server:** `scripts/dev.ts` is a Deno HTTP server that transpiles `.ts` files on the fly using `@deno/emit`. Edit a source file, refresh the browser, see the change. No file watcher required.
- **End-user experience on GitHub Pages is identical to today:** visit the URL, the app loads.
- **Contributor experience:** install Deno once (`brew install deno` or equivalent), clone, `deno task dev`.

#### `deno.json`

```jsonc
{
  "tasks": {
    "dev":   "deno run -A scripts/dev.ts",
    "build": "deno run -A scripts/build.ts",
    "check": "deno run -A scripts/check-unicode.ts && deno check src/**/*.ts && deno lint && deno fmt --check",
    "test":  "deno test -A --doc",
    "fix":   "deno fmt && deno lint --fix"
  },
  "imports": {
    "@astral/astral": "jsr:@astral/astral@^0.5"
  },
  "compilerOptions": {
    "strict": true,
    "lib": ["dom", "dom.iterable", "deno.ns", "es2023"]
  }
}
```

### Project layout

```
.
├── deno.json
├── deno.lock
├── index.html              # shell only: head, body, <canvas>, sheet markup, <script type="module" src="./dist/main.js">
├── src/
│   ├── main.ts             # entry, wires everything
│   ├── types.ts            # shared typedefs (Mood, Settings, MoodMeta, FormSection, …)
│   ├── audio/
│   │   ├── graph.ts        # initAudio(), master chain, reverb IR (buildIR)
│   │   ├── scheduler.ts    # 50ms lookahead, scheduleBar, advanceFormPlayhead caller, visibilitychange
│   │   ├── instruments.ts  # comp / melody / bass / drum voice builders
│   │   ├── warp.ts         # warpModGain bus, applyWarp(osc)
│   │   └── ambience.ts     # rain, traffic, room, wind, hum generators
│   ├── music/
│   │   ├── voicings.ts     # VOICINGS data
│   │   ├── forms.ts        # FORMS data
│   │   ├── moods.ts        # MOOD_META data
│   │   └── generator.ts    # generatePhrase, ornament logic, walking-bass helpers
│   ├── visual/
│   │   ├── background.ts   # WebGPU pipeline + Canvas2D fallback
│   │   └── visualizer.ts   # frequency band bars
│   └── ui/
│       ├── sheet.ts        # draggable bottom sheet
│       ├── controls.ts     # slider wiring, applySettingToAudio
│       └── state.ts        # moodSettings, persistence
├── tests/
│   ├── voicings.test.ts
│   ├── forms.test.ts
│   ├── moods.test.ts
│   ├── generator.test.ts
│   └── smoke.test.ts       # Astral browser smoke tests
├── scripts/
│   ├── dev.ts              # dev server with on-the-fly TS
│   ├── build.ts            # esbuild-via-Deno, emits dist/
│   └── check-unicode.ts    # forbidden-char scanner
├── dist/                   # gitignored; what GH Pages serves
├── docs/
│   ├── ARCHITECTURE.md     # technical content currently in CLAUDE.md, restructured around modules
│   └── superpowers/
│       └── specs/          # design docs (this file)
├── .github/
│   ├── workflows/
│   │   ├── ci.yml
│   │   └── deploy.yml
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug.md
│   │   └── feature.md
│   └── pull_request_template.md
├── .githooks/
│   └── pre-commit
├── CLAUDE.md               # slimmed; points to ARCHITECTURE.md
├── CONTRIBUTING.md
├── README.md
└── LICENSE                 # MIT (already exists)
```

**Module principles:**

- Each file has one clear responsibility, named after it.
- `music/` is pure data and pure functions. No Web Audio, no DOM dependency. This is the testable core.
- `audio/` owns the Web Audio graph and timing.
- `visual/` is isolated from audio mechanics (reads `bgAmplitude` only).
- `ui/` is the only place that touches DOM beyond `<canvas>`.

### Code quality stack

**Type checking — `deno check`**
- TypeScript with `strict: true`. DOM lib is loaded so `OscillatorNode`, `AudioParam`, `GPUDevice` etc. type-check natively.

**Linting — `deno lint`**
- Built-in. Recommended rule set.

**Formatting — `deno fmt`**
- Built-in. Opinionated; settles bikeshedding. `deno fmt --check` in CI; `deno fmt` to fix.

**Unicode contamination prevention — `scripts/check-unicode.ts`**
- Custom script that scans `src/**/*.{ts,css}` and `index.html` for forbidden characters:

```typescript
const FORBIDDEN = [
  { char: "–", name: "en-dash (U+2013)", suggest: "--" },
  { char: "—", name: "em-dash (U+2014)", suggest: "--", allowInComments: true },
  { char: "‘", name: "left smart quote", suggest: "'" },
  { char: "’", name: "right smart quote", suggest: "'" },
  { char: "“", name: "left smart double quote", suggest: '"' },
  { char: "”", name: "right smart double quote", suggest: '"' },
];
```

- Em-dashes are allowed inside `//` and `/* */` comments (intentional decoration in section banners).
- Reports `file:line:col` and the suggested replacement. Non-zero exit on hit.
- Wired into `deno task check` and the pre-commit hook.

**Pre-commit (`.githooks/pre-commit`)**

```bash
#!/usr/bin/env bash
set -e
deno task check
deno test
```

Documented one-time setup: `git config core.hooksPath .githooks`. Smoke tests are skipped locally for speed; CI catches them.

### Testing

Two layers, both runnable as `deno test`.

**Layer 1 — Logic unit tests (~30–40 tests)**

Pure data and pure functions in `src/music/`. Examples:

```typescript
Deno.test("VOICINGS.min7 produces a minor 7th chord from root 0", () => {
  assertEquals(VOICINGS.min7, [0, 3, 7, 10]);
});

Deno.test("every chord in every FORM references a voicing that exists in VOICINGS", () => {
  for (const [mood, form] of Object.entries(FORMS)) {
    for (const section of form) {
      for (const [_offset, voicing] of section.prog) {
        assert(voicing in VOICINGS, `${mood} references missing voicing ${voicing}`);
      }
    }
  }
});

Deno.test("every MOOD_META key has a corresponding FORMS entry", () => {
  for (const mood of Object.keys(MOOD_META)) {
    assert(mood in FORMS, `${mood} in MOOD_META but missing from FORMS`);
  }
});

Deno.test("advanceFormPlayhead advances bars and wraps at section boundaries", () => {
  // …
});
```

**The high-leverage tests are data-integrity:** every voicing referenced exists, every mood has a form, every form has bars > 0. These catch the most likely class of LLM-introduced regression — adding a mood but forgetting to update the other side of the data.

**Layer 2 — Smoke tests in a real browser (Astral, ~5–8 tests)**

```typescript
Deno.test("page loads with no console errors", async () => { … });
Deno.test("clicking play starts the audio context", async () => { … });
Deno.test("switching mood does not throw", async () => { … });
Deno.test("settings persist across reload", async () => { … });
```

Astral (`jsr:@astral/astral`) is the Deno-native Chrome DevTools Protocol client — natural fit since we are avoiding npm.

**Explicitly out of scope:**

- Testing that music "sounds good" (subjective).
- Asserting exact note timings (brittle).
- Tests of the visual background beyond "doesn't error".
- Snapshot-testing audio output. Possible via `OfflineAudioContext` but high effort, low value for a hobby project.

**Coverage philosophy:** near-100% of the deterministic music-theory layer. Smoke-only for audio graph and UI. None for visual.

### CI/CD

**`.github/workflows/ci.yml`** — runs on every PR and push to any branch.

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
        with: { deno-version: v2.x }
      - run: deno task check
      - run: deno test --doc

  smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v2
        with: { deno-version: v2.x }
      - run: deno task build
      - run: deno run -A jsr:@std/http/file-server dist/ &
      - run: sleep 1
      - run: deno test -A tests/smoke.test.ts
```

Two jobs so fast checks fail fast.

**`.github/workflows/deploy.yml`** — runs only on push to `main`.

```yaml
name: deploy
on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v2
      - run: deno task build
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist/ }
      - id: deployment
        uses: actions/deploy-pages@v4
```

GitHub Pages, deployed from Actions (not from a `gh-pages` branch).

**Branch protection on `main`:** require `ci/check` and `ci/smoke` to pass before merge; require linear history (rebase or squash merge only).

**Versioning:** semver-style git tags (`v0.1.0`) when meaningful changes ship. GitHub auto-generates release notes from PRs. No formal release process.

### Documentation

**`README.md`** — short, end-user focused. What it is, link to live demo, how to run locally, link to CONTRIBUTING and ARCHITECTURE. Keep under 50 lines.

**`CONTRIBUTING.md`** — for contributors. Setup steps, list of `deno task` commands, pre-PR checklist, instructions for adding a new mood, and the "watch out for" list (unicode contamination, applyWarp wiring, absolute-time scheduling).

**`docs/ARCHITECTURE.md`** — the technical content currently in `CLAUDE.md`, restructured around the new module layout. Architecture diagrams of the audio signal chain and module dependency graph.

**`CLAUDE.md`** — slim. Points to `ARCHITECTURE.md` for system design; tells assistants to run `deno task check && deno task test` before claiming work done; lists the conventions.

**`LICENSE`** — MIT (already present in repo).

**Issue templates (`.github/ISSUE_TEMPLATE/`):** `bug.md` and `feature.md`. Minimal.

**PR template (`.github/pull_request_template.md`):** three bullets — what this changes, how to test it, anything to watch for.

**Not included** (can be added later if needed): `CODE_OF_CONDUCT.md`, `SECURITY.md`, `SUPPORT.md`. These are for projects with traffic.

## Migration plan

The principle: each phase leaves the app working and shippable. Each phase is a separate PR.

### Phase 0 — Tooling skeleton (no behaviour change)

- Add `deno.json` with tasks (initially `deno task check` runs only `deno fmt --check` against any new `.ts` files; `deno check` and `deno lint` are no-ops until `src/` exists)
- Add `scripts/check-unicode.ts`, `scripts/dev.ts`, `scripts/build.ts`. The unicode scanner exists but **is not yet wired into `deno task check` or CI** — wiring it now would fail because `index.html` still contains the contamination. It is wired in phase 1, alongside the fix.
- Add `.githooks/pre-commit`
- Add `README.md`, `CONTRIBUTING.md`, `.gitignore` (`dist/`, `.DS_Store`)
- Add `.github/workflows/ci.yml` (running `deno task check` — passes trivially at this stage)
- Add `.github/ISSUE_TEMPLATE/`, `.github/pull_request_template.md`
- Move existing `CLAUDE.md` technical content to `docs/ARCHITECTURE.md`; slim `CLAUDE.md`
- **Risk:** zero. `index.html` is untouched. App still runs by opening the file directly.

### Phase 1 — Fix the unicode contamination

- One PR that does only this. Easy to review, easy to verify.
- Replace `–` → `--` in every CSS custom property declaration and `var()` reference (~47 sites)
- Replace `'` `'` → `'` in CSS strings (font-family, `@property` syntax)
- Remove the four stray `` ``` `` markdown fences inside `<body>` (lines 472, 527, 660, 688 per `CLAUDE.md`)
- Verify by running the app: many rules that were silently dropping should now apply (warm/glass/border tokens take effect; the bottom sheet becomes properly styled)
- Wire `scripts/check-unicode.ts` into `deno task check` and the pre-commit hook. It now runs clean.
- **Risk:** low. Pure CSS fix.

### Phase 2 — Extract pure data + types

- Create `src/types.ts` with typedefs
- Create `src/music/voicings.ts`, `forms.ts`, `moods.ts`
- For now, `index.html` keeps its inline script; the entry module re-exports these constants onto `window` so the existing inline script can read them
- Add the first batch of Layer 1 tests (voicings, forms, moods integrity)
- Add `deno task build` and `deno task dev`; CI starts running them
- **Risk:** low–medium. Data is genuinely standalone; the `window`-bridge wiring is the fiddly part but isolated.

### Phase 3 — Extract pure music logic

- Create `src/music/generator.ts` — `generatePhrase`, `advanceFormPlayhead`, walking-bass helpers
- Tests pin behaviour for the deterministic parts (form playhead advancement, voicing arithmetic)
- Update the inline script to call these via `window`-exposed wrappers from `main.ts`
- **Risk:** medium. Some of these functions may have hidden coupling to scheduler state. Refactor in small commits.

### Phase 4 — Extract the audio graph

- Create `src/audio/warp.ts`, then `ambience.ts`, then `instruments.ts`, then `graph.ts` (in that order — fewest dependencies first)
- After each sub-extraction, run smoke tests + manual listening
- **Risk:** high. The audio nodes hold many cross-references. Mitigations: small commits within the PR, frequent manual QA, app keeps working until the last commit.

### Phase 5 — Extract scheduler

- Create `src/audio/scheduler.ts` — the 50ms lookahead, `scheduleBar`, the `visibilitychange` handler
- Depends on phase 4
- **Risk:** medium. Scheduler is small but timing-sensitive.

### Phase 6 — Extract visual

- Create `src/visual/background.ts`, `visualizer.ts`
- Self-contained, only reads `bgAmplitude`
- **Risk:** low.

### Phase 7 — Extract UI

- Create `src/ui/sheet.ts`, `controls.ts`, `state.ts`
- Move slider wiring out of the inline script
- **Risk:** low–medium. UI is touched by many subsystems but only as event sources.

### Phase 8 — Cut over `index.html` to a true shell

- `index.html` becomes: `<head>`, `<body>` with `<canvas>` + sheet markup + `<script type="module" src="./dist/main.js">`. No inline `<script>` block.
- `dist/` becomes the deployed artifact
- Add `tests/smoke.test.ts`
- Add `.github/workflows/deploy.yml` — first deploy to GH Pages
- **Risk:** medium. This is the moment everything becomes load-bearing on the module system. Smoke tests are the safety net.

### Phase 9 — Polish (optional, anytime after 8)

- Split CSS into `src/styles.css` (referenced from `index.html`)
- Architecture diagrams in `docs/ARCHITECTURE.md`
- Refine module boundaries based on what we learned during the migration
- Add tests the migration revealed gaps in

**Effort estimate:** 9 PRs, none enormous. Phases 0–3 each fit in a single focused session. Phase 4 warrants taking time. Whole migration is plausible across 1–2 weeks of focused evenings, or spread over months — there is no penalty for pausing at a phase boundary.

**Crucial property:** at every phase boundary, the deployed app works. Until phase 8, opening `index.html` directly from the filesystem also works (the original inline script remains until then). From phase 8 onward, the app requires a local server (`deno task dev`) or a real host like GH Pages, because native ES modules cannot be loaded from `file://`. There is never a "broken state we're working through."

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Audio graph extraction (phase 4) reveals deep coupling that resists clean module boundaries | Medium | High — could stall the migration | Small sub-commits within the PR; willingness to leave one or two modules slightly larger than ideal rather than force unnatural splits |
| `Astral` is less polished than Playwright; smoke tests prove brittle | Medium | Low | Keep smoke suite small (≤8 tests). If Astral fails us, fall back to a hand-rolled HTML test page run via Deno's HTTP server. |
| Browser cannot run TS at all means the "no build step" dev story is broken until `scripts/dev.ts` works reliably | Medium | Medium | Build `scripts/dev.ts` early in phase 0 and prove it works before depending on it. Worst case, contributors run `deno task build` before opening the browser. |
| GitHub Pages deploy path breaks on first cutover (phase 8) | Low | Medium | Smoke tests run in CI against the built `dist/`. Deploy job is gated on CI passing. |
| Migration drags out, project sits in a half-migrated state for months | Medium | Low (the app still works) | Phases are designed to leave the app working at every boundary. Pausing is fine. |

## Open questions

None at design-stage. All open questions will be resolved during the implementation plan and individual phase PRs.
