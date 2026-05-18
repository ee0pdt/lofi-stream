/**
 * Per-note visualisation buffer + canvas renderer for the piano roll
 * shown in the player's `#vis` canvas. The scheduler calls `recordNote`
 * once for every scheduled musical event; the renderer's animation
 * frame loop reads the buffer and draws rectangles positioned by time
 * and pitch, coloured by voice.
 */

export type RollVoice = "chords" | "bass" | "mel1" | "mel2";

export interface RollNote {
  readonly time: number;
  readonly midi: number;
  readonly dur: number;
  readonly voice: RollVoice;
}

const CAPACITY = 256;
const buffer: RollNote[] = [];
let writeIdx = 0;

export function recordNote(note: RollNote): void {
  if (buffer.length < CAPACITY) {
    buffer.push(note);
  } else {
    buffer[writeIdx] = note;
    writeIdx = (writeIdx + 1) % CAPACITY;
  }
}

function snapshotInOrder(): RollNote[] {
  if (buffer.length < CAPACITY) return buffer.slice();
  const out: RollNote[] = [];
  for (let i = 0; i < CAPACITY; i++) {
    out.push(buffer[(writeIdx + i) % CAPACITY]);
  }
  return out;
}

function pruneOlderThan(cutoff: number): void {
  // Re-pack the buffer with only notes whose end-time >= cutoff.
  const kept = snapshotInOrder().filter((n) => n.time + n.dur >= cutoff);
  buffer.length = 0;
  for (const n of kept) buffer.push(n);
  writeIdx = 0;
}

// --- test-only helpers ---
export function __resetPianoRollForTest(): void {
  buffer.length = 0;
  writeIdx = 0;
}
export function __snapshotPianoRollForTest(): RollNote[] {
  return snapshotInOrder();
}
export function __pruneOlderThanForTest(cutoff: number): void {
  pruneOlderThan(cutoff);
}
