# Melody trading + piano-roll viz — design

**Status:** drafted 2026-05-18
**Branch:** `feat/improv-mode`
**Supersedes (in part):** `2026-05-18-improv-mode-design.md` — replaces the multi-lane voice model.

## Problem

Improv mode currently runs three melodic layers in parallel: an always-on `basePhrase` (mood `melTimbre`), a `primary` lane, and an optional `secondary` lane. In most moods two of these three layers share a timbre — rainy/sleepy don't even define a secondary — so the listener can't hear "two instruments trading 8s". The intended duet character never emerges.

There is also no in-app way to verify what each voice is actually playing, which makes tuning trading behavior a guessing game.

## Goal

Replace the three-layer melodic stack with exactly **two melodic voices** per mood (`voice 1`, `voice 2`), always playing distinct timbres in improv mode, with shifting `lead`/`support` roles to deliver a conversational duet. Add a piano-roll visualisation in place of the current waveform, colour-coded by voice, so the listener (and future debugging) can see what each voice is contributing.

## Non-goals

- No strict 8-bar alternation (jazz "trading 8s"). The duet is conversational, not turn-based.
- No new audio timbres. Reuse what's in `src/audio/timbres/`.
- No change to drums, bass scheduling, chord-comp scheduling, ambience, or the form/section sequencer.
- No new mixer features beyond the rename and the melody split.

## Architecture

### Voice model

Two voices per mood, declared in `MOOD_META[mood].improv.voices: readonly [Timbre, Timbre]`. The `lanes` subkey and the scheduler's `basePhrase`/`basePhraseBarIdx`/`baseLastMidi` tracking are removed.

**Non-improv mode:** voice 1 plays the form on the mood's existing `melTimbre`; voice 2 is silent. (Preserves today's "ambient" feel.)

**Improv mode:** both voices always present, distinct timbres. At any instant one voice is `lead` and the other is `support` — never both `lead`, never both `support`.

### Voice state

```ts
type VoiceRole = "lead" | "support";

interface VoiceState {
  readonly id: 1 | 2;
  readonly timbre: Timbre;
  readonly role: VoiceRole;
  readonly phrase: Phrase | null;
  readonly phraseBarIdx: number;
  readonly mode: "structured" | "improv";  // lead can break out; support stays structured
  readonly barsInMode: number;
  readonly lastMidi: number | null;
}
```

Two `VoiceState` instances live in the scheduler (`voice1`, `voice2`). They never converge on the same role — role assignment is a single bit at the scheduler level, evaluated at phrase boundaries.

### Lead behavior

- Generates structured phrases following the form (`formProg`).
- Can break out into a dense improv run gated by `energyState.energies.melody > breakoutThreshold` and an RNG roll (current primary-lane breakout logic — preserved verbatim).
- During break-out, runs for ≥2 phrase cycles (8 bars) before settling.

### Support behavior

- Always `structured` (never breaks out).
- Generates sparse-style phrases (`phraseStyle: "sparse"`) anchored to the same form chord as the lead.
- Velocity scaled to ~0.6× of the lead's velocity baseline.
- Phrase generation seeded with the lead's last note via the existing `seedNote` mechanism so the support's contour relates to the lead's.
- **Soloist breathing rule:** when the lead enters `improv` mode (break-out), support goes silent for that phrase. Resumes the following phrase.

### Trading mechanics

At each phrase boundary (every 4 bars), roll an RNG against a section-dependent swap probability:

| Section type | Swap probability |
|---|---|
| `normal` | 0.10 |
| `buildup`, `peak` | 0.35 |
| `break`, `bridge` | 0.15 |

If the roll succeeds, voice 1 and voice 2 swap roles. Both `mode` fields reset to `structured` and `barsInMode` to 0. The new lead generates a fresh structured phrase. This is the only mutation that flips the role bit — there's no time-based force-swap.

### Per-mood timbre matrix

| Mood | Voice 1 | Voice 2 |
|---|---|---|
| rainy | `rhodes` | `vibraphone` |
| late | `vibraphone` | `bell` |
| cafe | `rhodes` | `vibraphone` |
| sleepy | `celesta` | `bell` |
| transit | `bell` | `vibraphone` |

All timbres listed exist in `src/audio/timbres/` today.

### Mood config schema change

```ts
// Before
improv: {
  peakDensityCap: number;
  bridgeSubstitutions: readonly [Chord, Chord, Chord, Chord];
  lanes: {
    primary: LaneDef;
    secondary?: LaneDef;
  };
}

// After
improv: {
  peakDensityCap: number;
  bridgeSubstitutions: readonly [Chord, Chord, Chord, Chord];
  voices: readonly [Timbre, Timbre];
  breakoutThreshold: number;  // moved up from per-lane; applies to whichever voice has the lead
}
```

`LaneDef` (in `src/types.ts`) is removed. `voice-lane.ts` is replaced with `voice.ts` exposing `VoiceState`, `initVoice`, `startNextPhrase`, `advanceVoiceBar`, `swapRoles`.

### Mixer / track buses

- `index.html`: change the comp knob label "piano" → "chords". Keep `data-track="comp"` and `id="mx-comp"` unchanged (audio routing is unaffected; `playComp` still uses `MOOD_META[mood].compTimbre`).
- Remove the existing `mx-melody` cell. Add two new cells: `mx-melody1` (`data-track="melody1"`, label "mel 1", default 0.75) and `mx-melody2` (`data-track="melody2"`, label "mel 2", default 0.65).
- `src/audio/graph.ts`: in `trackKeys`/`defaultGains`, drop `melody`, add `melody1: 0.75` and `melody2: 0.65`. Two new `GainNode`s in `trackGains`.
- `src/audio/voices.ts`: `playMelodyTimbre` gains a `voice: 1 | 2` parameter and routes its output to `audio.trackGains.melody1` or `melody2`. `playMelody` (used in non-improv mode) defaults to voice 1.

### Piano-roll viz

Replaces the waveform render currently drawn into `#vis` (400×56 canvas). Same DOM element, same footprint; only the renderer changes.

**Data flow:**

1. Every place the scheduler calls `playMelodyTimbre`, `playComp`, or `playBass`, it also calls a new `recordNote({ time, midi, dur, voice })` function in a new module `src/visual/piano-roll.ts`.
2. `recordNote` pushes into a ring buffer (capacity ~256 notes, prune by `time + dur < now - window`).
3. A `requestAnimationFrame` loop reads the buffer and renders rectangles onto the `#vis` canvas.

**Layout:**

- Time on x-axis. Window width = 4 bars at current BPM. Playhead at right edge; notes slide right-to-left.
- MIDI pitch on y-axis, clamped to range 36–84 (4 octaves; covers bass low to vibes high).
- A note's rectangle: `x = canvasWidth * (1 - (time - now) / windowSec)`, `y = canvasHeight * (1 - (midi - 36) / 48)`, width = `dur / windowSec * canvasWidth`, height = ~3px.

**Voice colour scheme (fixed across all moods):**

| Voice | Hex |
|---|---|
| chords | `#d4a456` (warm amber) |
| bass | `#7a5fb8` (deep purple) |
| mel 1 | `#e87a6b` (coral) |
| mel 2 | `#5fb8a8` (teal) |

Rectangles drawn with 1.5px corner radius and ~0.7 alpha. No glow effect — keep the lofi aesthetic.

**Background:** clear to `rgba(0,0,0,0.08)` each frame so older notes fade as they scroll, rather than a hard cut.

**Module boundary:** `src/visual/piano-roll.ts` owns the ring buffer, the public `recordNote`, and `startPianoRoll(canvas)`. The scheduler doesn't import the viz module directly — it imports `recordNote` only. The old waveform renderer (analyser-driven) is removed.

## Components

| File | Change |
|---|---|
| `src/types.ts` | Remove `LaneDef`. Update `MoodMeta.improv` shape. |
| `src/music/moods.ts` | Replace `lanes` block with `voices: [Timbre, Timbre]` and top-level `breakoutThreshold` in each mood's `improv` block. Use the timbre matrix above. |
| `src/music/voice-lane.ts` | Delete. |
| `src/music/voice.ts` | New. `VoiceState`, `initVoice`, `startNextPhrase`, `advanceVoiceBar`, `swapRoles`. |
| `src/audio/scheduler.ts` | Remove `basePhrase`/`basePhraseBarIdx`/`baseLastMidi`. Replace `primaryLane`/`secondaryLane` with `voice1`/`voice2`. Add the trading roll at phrase boundaries. Call `recordNote` for every scheduled note. |
| `src/audio/voices.ts` | Add `voice: 1 \| 2` parameter to `playMelodyTimbre`; route to `melody1`/`melody2` buses. Update `playMelody` to default to voice 1. |
| `src/audio/graph.ts` | `trackKeys`: drop `melody`, add `melody1`, `melody2`. Update `defaultGains`. |
| `src/visual/piano-roll.ts` | New module. Ring buffer + canvas renderer. |
| `src/visual/analyser.ts` | Keep — `canvas2d.ts` still consumes `getAmp()` for background blob pulsing. Only stop drawing the waveform into `#vis`. |
| `index.html` | Knob label "piano" → "chords". Replace `mx-melody` cell with `mx-melody1` and `mx-melody2`. |
| `src/ui/controls.ts` | Update mixer track selector map: drop `melody`, add `melody1`, `melody2`. |
| `tests/` | New unit tests for `voice.ts` and `piano-roll.ts` ring buffer. Update or remove `voice-lane` tests. |

## Data flow

```
Scheduler.scheduleBar(barStart)
├── For each beat / chord position:
│     playComp(...)   ──► trackGains.comp     ──► master
│     playBass(...)   ──► trackGains.bass     ──► master
│     ↳ recordNote({ voice: "chords", ... })
│     ↳ recordNote({ voice: "bass", ... })
│
├── If isImprov:
│     [voice1, voice2] = swap_check_at_phrase_boundary(voice1, voice2)
│     For each voice in [lead, support]:
│       generate or continue phrase
│       playMelodyTimbre(..., voice: voice.id)
│         ──► trackGains.melody{1,2} ──► master
│       ↳ recordNote({ voice: "mel1"|"mel2", ... })
│
└── If not isImprov:
      voice1.role = "lead", voice2.role = "support" (silent)
      playMelodyTimbre(..., voice: 1, timbre: melTimbre)
      ↳ recordNote({ voice: "mel1", ... })
```

## Error / edge handling

- Voice2 silent in non-improv mode: don't push events to the ring buffer for the silent voice. The viz simply shows no teal notes — clear visual signal that improv is off.
- BPM change mid-playback: the viz's 4-bar window reads `currentBPM` each frame, so the time scale adjusts smoothly.
- Mood change: existing reset path already re-inits lanes; replace with `initVoice` calls. Ring buffer drains naturally as old notes scroll off — no need to flush.
- Canvas resize: same logic the waveform already uses (`devicePixelRatio` aware).
- Hidden tab restore: `flushScheduler` schedules backlog notes with timestamps in the recent past. The viz prunes them on next frame without drawing — correct behavior.

## Testing

- **Unit tests** (`tests/voice_test.ts`):
  - `startNextPhrase` for `lead` returns structured phrase from `formProg`.
  - `startNextPhrase` for `lead` with high energy + favourable rng returns improv phrase.
  - `startNextPhrase` for `support` always returns structured, sparse phrase.
  - `swapRoles` flips both voice roles and resets `mode`/`barsInMode`.

- **Unit tests** (`tests/piano_roll_test.ts`):
  - `recordNote` rejects past notes outside window.
  - Ring buffer wraps at capacity.
  - Pruning removes notes whose `time + dur < now - window`.

- **Manual / listening verification:**
  - In each mood, with improv on, the viz shows two distinct colours (coral + teal) playing at different rhythms.
  - Role swap visible: which colour plays the busier/more-structured line shifts every few phrases.
  - Soloist break-out: during a peak section, one colour briefly fills with dense notes while the other goes silent for a phrase.
  - Non-improv mode: only coral notes visible in the melody range; teal absent.

## Phase / delivery order

Three phases, each ships independently behind the existing `isImprov` toggle:

1. **Phase 1 — Piano-roll viz.** Add `src/visual/piano-roll.ts`. Hook `recordNote` into the existing 3-layer scheduler with this temporary mapping: base melody → `mel1` colour (coral), primary lane → `mel2` colour (teal), secondary lane → also `mel2` colour (acceptable since secondary is sparse and rarely overlaps primary). Chords + bass record under their own colours. Replace `#vis` renderer with the piano roll. *Outcome:* viz works against today's audio, so phase 2 is verifiable as we build it.
2. **Phase 2 — Voice model refactor.** Replace `voice-lane.ts` with `voice.ts`. Update `MOOD_META` schema. Rewrite the scheduler's melody section. Update viz `recordNote` calls to use new voice ids. *Outcome:* listener hears two distinct timbres in every mood; viz confirms it.
3. **Phase 3 — Mixer split + rename.** Add `melody1`/`melody2` track buses. Update `playMelodyTimbre` signature. Update `index.html` mixer grid and `controls.ts` selector map. Rename "piano" → "chords". *Outcome:* independent mix control per voice.

## Open questions

None blocking. Phase 2's role-swap probability values may need tuning after listening — they're starting points, not load-bearing.
