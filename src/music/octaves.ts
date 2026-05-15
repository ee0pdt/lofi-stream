/** Clamp a MIDI note into the melody register [60, 79]. */
export function melodyOct(midi: number): number {
  let note = midi;
  while (note > 79) note -= 12;
  while (note < 60) note += 12;
  return note;
}

/** Clamp a MIDI note into the bass register [36, 47]. */
export function bassOct(midi: number): number {
  let note = midi;
  while (note > 47) note -= 12;
  while (note < 36) note += 12;
  return note;
}

/** Clamp a MIDI note into the comp register [48, 71]. */
export function compOct(midi: number): number {
  let note = midi;
  while (note > 71) note -= 12;
  while (note < 48) note += 12;
  return note;
}
