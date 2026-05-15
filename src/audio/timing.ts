export function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export function beatDur(bpm: number): number {
  return 60 / bpm;
}

export function swungTime(
  i: number,
  barStart: number,
  bpm: number,
  swingAmount: number,
): number {
  const sd = beatDur(bpm) / 4;
  return barStart + i * sd + (i % 2 === 1 ? swingAmount * sd : 0);
}
