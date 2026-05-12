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
