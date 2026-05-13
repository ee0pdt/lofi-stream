/** Random number in [a, b). */
export function randRange(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

/** Random integer in [a, b], inclusive. */
export function randInt(a: number, b: number): number {
  return a + Math.floor(Math.random() * (b - a + 1));
}

/** Random element from a non-empty array. */
export function pickFrom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
