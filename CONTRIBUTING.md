# Contributing

Thanks for your interest in lofi-stream.

## Setup

1. Install [Deno](https://deno.com) (`brew install deno` on macOS, see Deno docs for others)
2. Clone the repo
3. One-time: enable the pre-commit hook
   ```bash
   git config core.hooksPath .githooks
   ```
4. Run the app: `deno task dev`, then open <http://localhost:8000>

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

- **Unicode contamination.** En-dashes (`–` U+2013), smart quotes (`' '`), and smart double quotes
  (`" "`), silently break CSS. The unicode scanner catches these. Do not paste from rich-text
  sources.
- **Audio timing.** All audio scheduling must use `actx.currentTime` and absolute times. Never
  `setTimeout` for note timing.
- **Global warp.** New oscillators that should respond to global wow/flutter must be wired through
  `applyWarp(osc)` after creation.
- **Per-mood config.** Mood differences belong in `MOOD_META` and `FORMS`, not in
  `if (currentMood === ...)` branches inside the scheduler.

## Filing issues

See `.github/ISSUE_TEMPLATE/`. Bugs: include mood, browser, what happened, what you expected,
console output. Features: what, why, how you would use it.
