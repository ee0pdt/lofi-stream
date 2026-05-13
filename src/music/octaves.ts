/** Clamp a MIDI note into the melody register [60, 79]. */
export function melodyOct(midi: number): number {
  let n = midi;
  while (n > 79) n -= 12;
  while (n < 60) n += 12;
  return n;
}

/** Clamp a MIDI note into the bass register [36, 47]. */
export function bassOct(midi: number): number {
  let n = midi;
  while (n > 47) n -= 12;
  while (n < 36) n += 12;
  return n;
}

/** Clamp a MIDI note into the comp register [48, 71]. */
export function compOct(midi: number): number {
  let n = midi;
  while (n > 71) n -= 12;
  while (n < 48) n += 12;
  return n;
}
