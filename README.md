# lofi forever

A single-page, zero-runtime-dependency generative lofi music player. Plays forever in your browser.

→ **Try it:** https://ee0pdt.github.io/lofi-stream/ _(activates once Phase 8 of the migration
lands)_

## What it is

- 4-bar phrases over fixed per-mood chord progressions, with fresh voicings each bar
- Per-mood timbres: rhodes, vibraphone, guitar, pad, celesta
- Tape colour, wow/flutter, optional rain / traffic / room / wind ambience
- WebGPU background (Canvas2D fallback)
- No frameworks, no npm packages, no analytics

## Running locally

1. Install [Deno](https://deno.com)
2. Clone this repo
3. _Until Phase 2 of the migration lands:_ open `index.html` directly in a browser
4. _After Phase 2:_ `deno task dev`, then open http://localhost:8000

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Architecture

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## Licence

MIT — see [`LICENSE`](./LICENSE).
