# CLAUDE.md

This file is read by Claude Code (and other AI assistants) when working on this repository.

## Project

`lofi forever` — a single-page, zero-runtime-dependency generative lofi music player. The system design is documented in [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## Running

- `deno task dev` for local development, then open <http://localhost:8000>. Opening `index.html` directly from the filesystem does not work (native ES modules cannot load over `file://`).
- See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for setup and contribution workflow.

## Required of any assistant working here

- **Never commit directly to `main`.** All work — code, docs, plans, specs, even one-line fixes — goes on a feature branch and is merged via PR after CI passes. No exceptions without explicit confirmation from the user.
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
