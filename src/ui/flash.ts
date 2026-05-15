const FLASH_DUR = 80;

/**
 * Fire a brief CSS flash on the given mixer-row's range input at the
 * wall-clock moment when the audio event plays. No-ops if the event is
 * already more than 50ms in the past.
 */
export function flashRow(
  actx: AudioContext,
  rowId: string,
  scheduledAudioTime: number,
  duration = FLASH_DUR,
): void {
  const delayMs = (scheduledAudioTime - actx.currentTime) * 1000;
  if (delayMs < -50) return;
  setTimeout(() => {
    const row = document.getElementById(rowId);
    if (!row) return;
    const input = row.querySelector("input[type=range]");
    if (!input) return;
    input.classList.add("flash");
    setTimeout(() => input.classList.remove("flash"), duration);
  }, Math.max(0, delayMs));
}
