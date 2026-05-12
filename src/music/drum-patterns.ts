/**
 * 16th-note drum pattern arrays. Each is a 16-element array of 0/1.
 * Scheduled by scheduleBar at 16 swung positions per bar.
 */
// deno-fmt-ignore
export const KICK_PAT_NORMAL: readonly number[] = [
  1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0,
];
/** Sleepy/late variant — simpler. */
// deno-fmt-ignore
export const KICK_PAT_SOFT: readonly number[] = [
  1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0,
];
// deno-fmt-ignore
export const SNARE_PAT: readonly number[] = [
  0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0,
];
// deno-fmt-ignore
export const GHOST_PAT: readonly number[] = [
  0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0,
];
// deno-fmt-ignore
export const HAT_PAT: readonly number[] = [
  1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
];
// deno-fmt-ignore
export const OPEN_PAT: readonly number[] = [
  0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0,
];
