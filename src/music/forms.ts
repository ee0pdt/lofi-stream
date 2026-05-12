import type { Form, Mood } from "../types.ts";

/**
 * Per-mood compositional forms. Each form is an ordered list of sections;
 * sections play in order then the form loops.
 *
 * Each section's `prog` is exactly 4 chords as `[rootOffset, voicingName]`.
 * Values must match the inline `FORMS` definition in `index.html` until
 * the inline script is removed in a later phase.
 */
export const FORMS: Record<Mood, Form> = {
  // RAINY — 24 bars: AABBA'
  rainy: [
    {
      bars: 8,
      prog: [
        [0, "min7"],
        [5, "min7"],
        [8, "maj7"],
        [3, "min7"],
      ],
    }, // A home
    {
      bars: 8,
      prog: [
        [0, "min7"],
        [7, "dom7"],
        [5, "maj7"],
        [3, "min9"],
      ],
    }, // A variant
    {
      bars: 4,
      prog: [
        [0, "min9"],
        [8, "maj7"],
        [5, "dom9"],
        [3, "min7"],
      ],
    }, // B descend
    {
      bars: 2,
      prog: [
        [5, "min7"],
        [8, "maj7"],
        [3, "min7b5"],
        [7, "dom7"],
      ],
    }, // B' darker
    {
      bars: 2,
      prog: [
        [0, "min7"],
        [5, "min7"],
        [8, "maj7"],
        [3, "min7"],
      ],
    }, // A' return
  ],

  // LATE — 32 bars: AABCC'A
  late: [
    {
      bars: 8,
      prog: [
        [0, "min7b5"],
        [5, "min7"],
        [3, "maj7"],
        [7, "dom7"],
      ],
    },
    {
      bars: 8,
      prog: [
        [0, "min7"],
        [3, "min7b5"],
        [8, "maj7"],
        [5, "dom9"],
      ],
    },
    {
      bars: 6,
      prog: [
        [0, "min7"],
        [7, "dom9"],
        [3, "maj7"],
        [8, "maj7"],
      ],
    },
    {
      bars: 2,
      prog: [
        [5, "min7b5"],
        [8, "dom9"],
        [3, "maj7"],
        [0, "min7"],
      ],
    },
    {
      bars: 4,
      prog: [
        [8, "maj7"],
        [3, "maj9"],
        [5, "dom9"],
        [0, "min7"],
      ],
    },
    {
      bars: 4,
      prog: [
        [0, "min7b5"],
        [5, "min7"],
        [3, "maj7"],
        [7, "dom7"],
      ],
    },
  ],

  // CAFE — 16 bars: AABB'
  cafe: [
    {
      bars: 4,
      prog: [
        [0, "maj7"],
        [5, "dom7"],
        [3, "maj6"],
        [7, "dom9"],
      ],
    },
    {
      bars: 4,
      prog: [
        [0, "maj9"],
        [5, "maj7"],
        [3, "dom7"],
        [8, "maj7"],
      ],
    },
    {
      bars: 4,
      prog: [
        [0, "maj7"],
        [7, "dom9"],
        [5, "maj9"],
        [2, "min7"],
      ],
    },
    {
      bars: 4,
      prog: [
        [2, "min7"],
        [7, "dom9"],
        [0, "maj7"],
        [5, "dom7"],
      ],
    },
  ],

  // SLEEPY — 32 bars: AAAB A
  sleepy: [
    {
      bars: 8,
      prog: [
        [0, "min7"],
        [3, "maj7"],
        [5, "min9"],
        [8, "maj7"],
      ],
    },
    {
      bars: 8,
      prog: [
        [0, "min7"],
        [3, "maj7"],
        [5, "min9"],
        [8, "maj7"],
      ],
    },
    {
      bars: 8,
      prog: [
        [0, "min9"],
        [7, "min7"],
        [3, "maj9"],
        [5, "min7"],
      ],
    },
    {
      bars: 8,
      prog: [
        [0, "min7"],
        [3, "maj7"],
        [5, "min9"],
        [8, "maj7"],
      ],
    },
  ],
};
