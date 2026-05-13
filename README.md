# lofi forever

Low-key lofi beats for chilling or concentration while you vibe-code (or raw-code) your latest and
greatest.

→ **[Try it](https://ee0pdt.github.io/lofi-stream/)**

![lofi forever, rainy mood](./docs/screenshots/hero.png)

You know the vibe. Headphones on, a rainy window somewhere in your peripheral vision, a cup of
something warm, the deadline somewhere out of frame. _lofi forever_ is that — generated note by note
in the browser, fresh every bar.

## Four moods

- **rainy** — grey afternoon, window seat, soft rain
- **late night** — 3am brew, city lights, last bus
- **café** — warm espresso, cosy corner, notebook
- **sleepy** — almost asleep, blanket hour, dim lamp

Pick one and the player improvises forever. Fresh chord voicings every bar, warm rhodes and vibes, a
little tape wobble, optional rain or café murmur. It never repeats.

![café mood](./docs/screenshots/cafe.png)

## What it is, what it isn't

One browser tab that plays forever. No account, no ads, no algorithm picking the next track. Just
open it.

## For developers

Vanilla TypeScript on top of the Web Audio API — no frameworks, no runtime dependencies.
[Deno](https://deno.com) is the only tool you need.

```bash
git clone git@github.com:ee0pdt/lofi-stream.git
cd lofi-stream
deno task dev          # http://localhost:8000
```

Other tasks:

- `deno task check` — fmt, lint, unicode scan, type-check
- `deno task test` — run the test suite
- `deno task build` — bundle to `dist/main.js` (what Pages serves)

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the full contributor flow (pre-commit hook, PR
checklist, adding a new mood) and [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for how the audio
engine, scheduler, and modules fit together.

## Licence

MIT — see [`LICENSE`](./LICENSE).
