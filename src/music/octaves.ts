/**
 * Clamp a MIDI note number into the melody register [60, 79] (octaves 4-5)
 * by adding or subtracting 12 until it fits. Preserves pitch class.
 *
 * Mirrors the `melodyOct` function inline in `index.html`.
 */
export function melodyOct(midi: number): number {
  let n = midi;
  while (n > 79) n -= 12;
  while (n < 60) n += 12;
  return n;
}

/**
 * Clamp a MIDI note number into the bass register [36, 47] (octave 2)
 * by adding or subtracting 12 until it fits. Preserves pitch class.
 *
 * Mirrors the `bassOct` closure inside `walkingBassNotes` in `index.html`.
 */
export function bassOct(midi: number): number {
  let n = midi;
  while (n > 47) n -= 12;
  while (n < 36) n += 12;
  return n;
}
