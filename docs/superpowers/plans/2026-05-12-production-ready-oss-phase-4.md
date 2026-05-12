# Phase 4 — Wire `index.html` to the Modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `index.html` actually load and use the modules built in Phases 2 and 3, eliminating the duplicated inline definitions of `VOICINGS`, `FORMS`, `MOOD_META`, `DEFAULT_SETTINGS`, `melodyOct`, and `walkingBassNotes`, plus refactor the inline `advanceFormPlayhead` and `currentSectionProg` to delegate to the pure module versions.

**Architecture:** A small `<script type="module">` runs before the existing inline `<script>`, imports the module surface, assigns it to `window`, and dispatches a custom `lofi:ready` event. The inline script's body is wrapped in `window.addEventListener("lofi:ready", () => { ... })` so it doesn't run until the module is loaded. Duplicate inline definitions are then removed one at a time across separate commits, so any regression is small and easy to bisect.

**Tech Stack:** Plain HTML + native ES modules. No new dependencies. Deno 2.x for type-checking, tests, and the dev server.

**Spec:** `docs/superpowers/specs/2026-05-12-production-ready-oss-design.md`

**Risk:** medium. This is the first phase that genuinely changes the runtime path. Mitigations: each duplicate-removal lands as its own commit; the wrapping commit alone is non-destructive (duplicates still take precedence locally); easy revert if anything goes wrong.

**Spec deviation (acknowledged):** the spec's "phase boundary invariant" said opening `index.html` directly via `file://` would continue to work until Phase 8. Phase 4 breaks that one phase earlier, because native ES modules cannot load from `file://`. The deployed artifact (GH Pages, `deno task dev`) is unaffected. README and CONTRIBUTING get updated accordingly (Task 11).

**Spec deviation (acknowledged):** `generatePhrase` is still inline and still uses `Math.random` non-deterministically. It stays inline for now and gets extracted in a future phase alongside its scheduler caller.

---

## Pre-flight

### Task 1: Create the Phase 4 feature branch and verify clean baseline

- [ ] **Step 1: Branch from main**

```bash
git checkout main
git pull origin main
git checkout -b feat/phase-4-wire-modules
```

- [ ] **Step 2: Confirm clean baseline**

```bash
export PATH="$HOME/.deno/bin:$PATH"
deno task check
deno task test
deno task build
```

All three must pass. If any fails, STOP — the branch is not in a sane starting state.

- [ ] **Step 3: Confirm the inline `<script>` boundaries are where the plan expects**

```bash
grep -nE "^    <script>|^    </script>" index.html
```

Expected (or very close):
```
688:    <script>
3159:    </script>
```

If the line numbers have shifted significantly, all subsequent tasks need their line references updated. Stop and report rather than guessing.

---

## Bridge + wrap (single safe commit)

### Task 2: Add module bridge and wrap the inline script in a `lofi:ready` listener

**Files:**
- Modify: `index.html`

This commit is non-destructive. The inline duplicate definitions still exist and still take precedence inside the wrapper, so the app behaves exactly as before. We just add infrastructure for subsequent commits to remove duplicates one at a time.

- [ ] **Step 1: Read the current bottom of the inline script**

```bash
sed -n '3155,3160p' index.html
```

Expected (or very close):
```
        handle.addEventListener("mousedown", onStart);
        handle.addEventListener("touchstart", onStart, { passive: true });
      })();
    </script>
```

This is the closing IIFE for the sheet-drag block followed by the closing `</script>` tag.

- [ ] **Step 2: Insert the bridge module script BEFORE the inline `<script>`**

Use Edit. Find:
```
      </div>
    </div>

    <script>
      // ── Generative background — WebGPU flow field with Canvas2D fallback ──────────
```

Replace with:
```
      </div>
    </div>

    <script type="module">
      // Phase 4 bridge: import the modules built in Phases 2 and 3 and expose
      // them on `window`, then signal readiness so the classic inline script
      // (which is wrapped in a `lofi:ready` listener) can run.
      import {
        VOICINGS,
        FORMS,
        MOOD_META,
        DEFAULT_SETTINGS,
        bassOct,
        melodyOct,
        walkingBassNotes,
        nextFormPosition,
        currentSectionProg as currentSectionProgPure,
        DEFAULT_PROG,
      } from "./dist/main.js";

      Object.assign(window, {
        VOICINGS,
        FORMS,
        MOOD_META,
        DEFAULT_SETTINGS,
        bassOct,
        melodyOct,
        walkingBassNotes,
        nextFormPosition,
        DEFAULT_PROG,
        // The pure module version of currentSectionProg takes (form, position).
        // The inline version is no-arg. We expose the pure one under a distinct
        // name so the inline `currentSectionProg` can wrap it without recursion.
        currentSectionProgPure,
      });

      window.dispatchEvent(new Event("lofi:ready"));
    </script>
    <script>
      window.addEventListener("lofi:ready", () => {
      // ── Generative background — WebGPU flow field with Canvas2D fallback ──────────
```

- [ ] **Step 3: Close the wrapper at the bottom**

Find:
```
        handle.addEventListener("mousedown", onStart);
        handle.addEventListener("touchstart", onStart, { passive: true });
      })();
    </script>
```

Replace with:
```
        handle.addEventListener("mousedown", onStart);
        handle.addEventListener("touchstart", onStart, { passive: true });
      })();

      }); // end window.addEventListener("lofi:ready", ...)
    </script>
```

- [ ] **Step 4: Run the static checks**

```bash
export PATH="$HOME/.deno/bin:$PATH"
deno task check
```

Expected: passes. The unicode scanner reads `index.html` too — note that the docstring above contains an em-dash inside a `/* */` block, which is allowed.

- [ ] **Step 5: Build and smoke-test the dev server**

```bash
deno task build
deno task dev &
DEV_PID=$!
sleep 2
echo "index: $(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/index.html)"
echo "dist: $(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/dist/main.js)"
kill $DEV_PID 2>/dev/null
wait $DEV_PID 2>/dev/null
```

Expected: `index: 200` and `dist: 200`. If port 8000 is already in use, retry with another port or skip this step and report.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(integration): add module bridge + wrap inline script in lofi:ready

A new <script type='module'> imports the data + helpers from dist/main.js
and exposes them on window, then dispatches a 'lofi:ready' event. The
existing inline <script> is wrapped in a window.addEventListener for that
event so it doesn't run until the module is loaded.

The inline script is otherwise unchanged in this commit — the duplicate
definitions of VOICINGS, FORMS, etc. still take precedence inside the
wrapper. Subsequent commits remove the duplicates one at a time."
```

---

## Sequential duplicate removals

Each of the next six tasks removes one duplicate inline declaration. After each, the rest of the inline script's bare references to that name resolve to `window.<name>` (set by the bridge). Each task is a separate commit so any regression is easy to bisect.

### Task 3: Remove inline `const VOICINGS`

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Find the current line range**

```bash
grep -n "const VOICINGS = {" index.html
```

Expected: single match around line 1133.

- [ ] **Step 2: Remove the declaration**

Use Edit. Find:
```
      const VOICINGS = {
        min7: [0, 3, 7, 10],
        maj7: [0, 4, 7, 11],
        dom7: [0, 4, 7, 10],
        min7b5: [0, 3, 6, 10],
        maj6: [0, 4, 7, 9],
        min9: [0, 3, 7, 10, 14],
        dom9: [0, 4, 7, 10, 14],
        maj9: [0, 4, 7, 11, 14],
      };
```

Replace with: *(nothing — empty replacement string)*

(Use the Edit tool with `new_string` as an empty string, OR replace with a single blank line if the editor requires non-empty new_string. The intent is to delete the block entirely.)

- [ ] **Step 3: Verify no other `VOICINGS` declarations exist**

```bash
grep -nE "(const|let|var) VOICINGS" index.html
```

Expected: empty output (zero matches).

- [ ] **Step 4: Run checks**

```bash
export PATH="$HOME/.deno/bin:$PATH"
deno task check
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "refactor(index): remove inline VOICINGS in favour of window.VOICINGS

Bare VOICINGS references inside the lofi:ready wrapper now resolve to
the module-set window.VOICINGS via the standard scope chain."
```

---

### Task 4: Remove inline `const FORMS`

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Find the line range**

```bash
grep -n "const FORMS = {" index.html
```

Expected: single match around line 1153 (pre-Task-3) or thereabouts after the previous removal.

- [ ] **Step 2: Remove the declaration**

The block runs from `const FORMS = {` through its terminating `};` (originally around line 1355). Use Edit to remove the entire block.

To get the exact text to match, read the relevant chunk first:
```bash
awk '/^      const FORMS = \{/,/^      \};/' index.html > /tmp/forms-block.txt
wc -l /tmp/forms-block.txt
head -3 /tmp/forms-block.txt
tail -3 /tmp/forms-block.txt
```

Then use Edit with `old_string` = the contents of `/tmp/forms-block.txt` and `new_string` = empty.

- [ ] **Step 3: Verify removal**

```bash
grep -nE "(const|let|var) FORMS" index.html
```

Expected: empty.

- [ ] **Step 4: Run checks**

```bash
deno task check
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "refactor(index): remove inline FORMS in favour of window.FORMS"
```

---

### Task 5: Remove inline `const MOOD_META`

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Find and read the block**

```bash
grep -n "const MOOD_META = {" index.html
awk '/^      const MOOD_META = \{/,/^      \};/' index.html > /tmp/moodmeta-block.txt
wc -l /tmp/moodmeta-block.txt
```

- [ ] **Step 2: Remove the declaration**

Use Edit with `old_string` = contents of `/tmp/moodmeta-block.txt`, `new_string` = empty.

- [ ] **Step 3: Verify**

```bash
grep -nE "(const|let|var) MOOD_META" index.html
```

Expected: empty.

- [ ] **Step 4: Run checks**

```bash
deno task check
```

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "refactor(index): remove inline MOOD_META in favour of window.MOOD_META"
```

---

### Task 6: Remove inline `const DEFAULT_SETTINGS`

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Find and read the block**

```bash
grep -n "const DEFAULT_SETTINGS = {" index.html
awk '/^      const DEFAULT_SETTINGS = \{/,/^      \};/' index.html > /tmp/defaults-block.txt
wc -l /tmp/defaults-block.txt
```

- [ ] **Step 2: Remove the declaration**

Use Edit with `old_string` = contents of `/tmp/defaults-block.txt`, `new_string` = empty.

- [ ] **Step 3: Verify**

```bash
grep -nE "(const|let|var) DEFAULT_SETTINGS" index.html
```

Expected: empty.

Note: the line `for (const m of Object.keys(DEFAULT_SETTINGS))` (originally around line 2920) is INSIDE the `lofi:ready` wrapper, so it runs after the module loads. The bare `DEFAULT_SETTINGS` reference now resolves to `window.DEFAULT_SETTINGS`. ✓

- [ ] **Step 4: Run checks**

```bash
deno task check
```

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "refactor(index): remove inline DEFAULT_SETTINGS in favour of window.DEFAULT_SETTINGS"
```

---

### Task 7: Remove inline `function melodyOct`

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Confirm the inline function**

```bash
grep -n "^      function melodyOct" index.html
```

Expected: single match (originally around line 2299).

- [ ] **Step 2: Remove the function**

Use Edit. Find:
```
      function melodyOct(m) {
        let n = m;
        while (n > 79) n -= 12;
        while (n < 60) n += 12;
        return n;
      }
```

Replace with: *(empty)*

- [ ] **Step 3: Verify**

```bash
grep -nE "function melodyOct|const melodyOct|let melodyOct" index.html
```

Expected: empty.

- [ ] **Step 4: Run checks**

```bash
deno task check
```

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "refactor(index): remove inline melodyOct in favour of window.melodyOct"
```

---

### Task 8: Remove inline `function walkingBassNotes`

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Confirm**

```bash
grep -n "^      function walkingBassNotes" index.html
```

- [ ] **Step 2: Remove the function**

Use Edit. Find:
```
      function walkingBassNotes(rootMidi, voicing, nextRootMidi) {
        // All notes in bass register (octave 2, MIDI 36--47)
        const bassOct = (m) => {
          let n = m;
          while (n > 47) n -= 12;
          while (n < 36) n += 12;
          return n;
        };
        const root = bassOct(rootMidi);
        // chord tones available
        const chordTones = voicing.map((iv) => bassOct(rootMidi + iv));
        // beat2: 3rd or 5th
        const beat2 = chordTones[1] || chordTones[0];
        // beat3: 5th or 7th — aim slightly toward next root
        const beat3 = chordTones[2] || chordTones[1];
        // beat4: chromatic approach to next root (semitone above or below)
        const nextRoot = bassOct(nextRootMidi);
        const diff = nextRoot - beat3;
        // approach from a semitone below or above next root
        const approach = diff > 0 ? nextRoot - 1 : nextRoot + 1;
        return [root, beat2, beat3, approach];
      }
```

Replace with: *(empty)*

- [ ] **Step 3: Verify**

```bash
grep -nE "function walkingBassNotes|const walkingBassNotes|let walkingBassNotes" index.html
```

Expected: empty.

- [ ] **Step 4: Run checks**

```bash
deno task check
```

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "refactor(index): remove inline walkingBassNotes in favour of window.walkingBassNotes"
```

---

## Refactor stateful inline functions

### Task 9: Refactor inline `advanceFormPlayhead` to delegate to module's `nextFormPosition`

**Files:**
- Modify: `index.html`

The inline `advanceFormPlayhead()` mutates module-scope state directly. We keep its no-arg signature (callers don't need to change) but rewrite its body to use the pure `window.nextFormPosition` from the module.

- [ ] **Step 1: Find the current function**

```bash
grep -n "^      function advanceFormPlayhead" index.html
```

- [ ] **Step 2: Replace the function body**

Use Edit. Find:
```
      function advanceFormPlayhead() {
        formBarInProg++;
        const section = currentForm[formSectionIdx % currentForm.length];
        // Reset chord cycle each bar (prog cycles within the bar in scheduleBar)
        // Actually: scheduleBar calls currentSectionProg() and uses currentProgIdx
        // We advance the section when we've done enough bars
        formBarInSection++;
        if (formBarInSection >= section.bars) {
          formBarInSection = 0;
          formSectionIdx = (formSectionIdx + 1) % currentForm.length;
          // Regenerate phrase on section change for melodic variety
          currentPhrase = [];
          phraseBarIdx = 0;
        }
      }
```

Replace with:
```
      function advanceFormPlayhead() {
        // Delegate the position-state transition to the pure module helper,
        // then mirror the result into the inline mutable state. Side effects
        // on a section change (clearing the phrase cache for melodic variety)
        // stay here because they touch inline-only variables.
        formBarInProg++;
        const { position, sectionChanged } = window.nextFormPosition(
          currentForm,
          { sectionIdx: formSectionIdx, barInSection: formBarInSection },
        );
        formSectionIdx = position.sectionIdx;
        formBarInSection = position.barInSection;
        if (sectionChanged) {
          currentPhrase = [];
          phraseBarIdx = 0;
        }
      }
```

- [ ] **Step 3: Run checks**

```bash
deno task check
```

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "refactor(index): advanceFormPlayhead delegates to window.nextFormPosition

The pure module helper handles the position-state transition; inline code
mirrors the result into the existing module-scope variables and handles the
phrase-cache side effects (which still need inline-only state)."
```

---

### Task 10: Refactor inline `currentSectionProg` to delegate to `window.currentSectionProgPure`

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Find the current function**

```bash
grep -n "^      function currentSectionProg" index.html
```

- [ ] **Step 2: Replace the function body**

Use Edit. Find:
```
      function currentSectionProg() {
        if (!currentForm.length)
          return [
            [0, "min7"],
            [5, "min7"],
            [8, "maj7"],
            [3, "min7"],
          ];
        return currentForm[formSectionIdx % currentForm.length].prog;
      }
```

Replace with:
```
      function currentSectionProg() {
        // Delegate to the pure module helper; supply the inline mutable
        // playhead state as the position argument.
        return window.currentSectionProgPure(currentForm, {
          sectionIdx: formSectionIdx,
          barInSection: formBarInSection,
        });
      }
```

- [ ] **Step 3: Run checks**

```bash
deno task check
```

- [ ] **Step 4: Smoke test the bundle end-to-end**

```bash
export PATH="$HOME/.deno/bin:$PATH"
deno task build
deno task dev &
DEV_PID=$!
sleep 2
echo "index: $(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/index.html)"
echo "dist: $(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/dist/main.js)"
# Verify the bridge module's exports are reachable
curl -s http://localhost:8000/dist/main.js | grep -c "walkingBassNotes\|nextFormPosition" || echo "could not find expected exports in bundle"
kill $DEV_PID 2>/dev/null
wait $DEV_PID 2>/dev/null
```

Expected: both endpoints 200, grep finds the expected export names in the bundle.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "refactor(index): currentSectionProg delegates to window.currentSectionProgPure

The pure module version takes (form, position) explicitly. The inline
thin wrapper preserves the no-arg signature so existing callers don't
need updating."
```

---

## Update docs to reflect the file:// breakage

### Task 11: Update README and CONTRIBUTING

**Files:**
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`

After Phase 4, opening `index.html` via `file://` no longer works: browsers refuse to load native ES modules from the filesystem. The README and CONTRIBUTING currently say "open `index.html` directly in a browser"; that needs to change to "run `deno task dev`".

- [ ] **Step 1: Update README**

Read `/Users/petethorne/Documents/Projects/lofi-stream/README.md`. Find the "Running locally" section, which currently looks like:

```markdown
## Running locally

1. Install [Deno](https://deno.com)
2. Clone this repo
3. _Until Phase 2 of the migration lands:_ open `index.html` directly in a browser
4. _After Phase 2:_ `deno task dev`, then open http://localhost:8000
```

Replace with:

```markdown
## Running locally

1. Install [Deno](https://deno.com)
2. Clone this repo
3. `deno task dev`, then open <http://localhost:8000>

The app uses native ES modules and is served from the build output in `dist/`. Opening `index.html` directly from the filesystem (`file://`) will not work in modern browsers; use the dev server or the deployed GH Pages URL.
```

- [ ] **Step 2: Update CONTRIBUTING**

Read `/Users/petethorne/Documents/Projects/lofi-stream/CONTRIBUTING.md`. Find the setup step that mentions `index.html` directly, currently:

```markdown
4. Run the app:
   - Until Phase 2 lands: open `index.html` directly in a browser
   - From Phase 2: `deno task dev`, then open http://localhost:8000
```

Replace with:

```markdown
4. Run the app: `deno task dev`, then open <http://localhost:8000>
```

- [ ] **Step 3: Run checks**

```bash
export PATH="$HOME/.deno/bin:$PATH"
deno task check
```

Note: README and CONTRIBUTING are scanned by the unicode scanner but excluded from `deno fmt` (see `deno.json`'s `fmt.exclude`), so they're only checked for the contamination scanner — no formatting changes triggered.

Wait — `README.md` and `CONTRIBUTING.md` are NOT in the `fmt.exclude` list. Only `index.html`, `CLAUDE.md`, and `docs/`. So `deno fmt` will check these. If your edits don't match Deno's markdown formatting (lines >100 chars, etc.), the check will fail.

If `deno fmt --check` fails on these files, run:
```bash
deno fmt README.md CONTRIBUTING.md
```
and re-run `deno task check`.

- [ ] **Step 4: Commit**

```bash
git add README.md CONTRIBUTING.md
git commit -m "docs: drop file:// usage instructions (Phase 4 needs dev server)

Native ES modules cannot be loaded over file://. Opening index.html
directly stopped working in Phase 4. Both README and CONTRIBUTING now
direct contributors to deno task dev instead."
```

---

## Ship

### Task 12: Push, open PR, wait for CI, merge

- [ ] **Step 1: Final local sanity**

```bash
export PATH="$HOME/.deno/bin:$PATH"
deno task check
deno task test
deno task build
```

All three must pass.

- [ ] **Step 2: Push**

```bash
git push -u origin feat/phase-4-wire-modules
```

- [ ] **Step 3: Open the PR**

```bash
gh pr create --title "Phase 4: Wire index.html to the modules" --body "$(cat <<'EOF'
## What this changes

\`index.html\` now loads and uses the modules built in Phases 2 and 3. The
duplicate inline definitions of \`VOICINGS\`, \`FORMS\`, \`MOOD_META\`,
\`DEFAULT_SETTINGS\`, \`melodyOct\`, and \`walkingBassNotes\` are removed.
The inline \`advanceFormPlayhead\` and \`currentSectionProg\` now delegate
to the pure module helpers.

**How it works:**
- A new \`<script type="module">\` at the top of \`<body>\` imports the
  module surface from \`./dist/main.js\` and assigns it to \`window\`,
  then dispatches a \`lofi:ready\` event.
- The existing inline \`<script>\` is wrapped in a
  \`window.addEventListener("lofi:ready", () => { ... })\` so it only
  runs once the module has loaded.

**Breaking change:** opening \`index.html\` directly from the filesystem
(\`file://\`) no longer works — browsers refuse to load native ES modules
from \`file://\`. Use \`deno task dev\` or the deployed GH Pages URL.
README and CONTRIBUTING are updated.

## How to test

- \`deno task check\` passes
- \`deno task test\` passes (79 tests, unchanged)
- \`deno task build\` produces \`dist/main.js\`
- \`deno task dev\` then open <http://localhost:8000>
- Click play. Music should play. Switch moods. Adjust sliders. Verify the
  app behaves exactly as before — Phase 4 should be a pure refactor.

## Anything to watch for

This is the first phase that touches the runtime path of \`index.html\`. The
PR is split into separate commits per duplicate removal so any regression
is easy to bisect. If the app behaves differently after merge, the
offending commit is likely one of: Task 9 (advanceFormPlayhead refactor)
or Task 10 (currentSectionProg refactor) — these are the only places
where logic CHANGED rather than just being relocated.

\`generatePhrase\` is still inline and still uses \`Math.random\` — that's
left for a future phase alongside the scheduler caller.
EOF
)"
```

- [ ] **Step 4: Wait for CI**

```bash
gh pr checks --watch
```

If checks fail, STOP and report.

- [ ] **Step 5: Merge**

```bash
gh pr merge --squash --delete-branch
git checkout main
git pull origin main
git log --oneline -10
```

- [ ] **Step 6: Post-merge sanity**

```bash
deno task check && deno task test && deno task build
```

All three must pass on main.

---

## Done

After this phase:

- `index.html` is genuinely using the modules; no duplication remains for the data + pure helpers
- The integration approach is settled (`<script type="module">` bridge + `lofi:ready` event wrapper) — future phases can extract more inline behaviour into modules using the same pattern
- The app no longer works via `file://`; this matches the README/CONTRIBUTING which now require `deno task dev`
- 79 tests on main, all green
- The repo is ready for Phase 5: extract `generatePhrase` and its scheduler caller, refactoring the random source so the function becomes testable
