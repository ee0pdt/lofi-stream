/**
 * Play button + status indicator. Click cycles between play/pause; the
 * handler is supplied by the caller because it needs access to audio
 * boot, scheduler, and ambience controls.
 */

export function mountPlayButton(onToggle: () => Promise<void> | void): void {
  const btn = document.getElementById("playBtn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    void onToggle();
  });
}

export function setPlayIcon(playing: boolean): void {
  const playIcon = document.getElementById("playIcon");
  if (!playIcon) return;
  if (playing) {
    playIcon.innerHTML =
      '<rect x="3" y="2" width="5" height="16" rx="1"/><rect x="12" y="2" width="5" height="16" rx="1"/>';
  } else {
    playIcon.innerHTML = '<polygon points="4,2 18,10 4,18"/>';
  }
  playIcon.setAttribute("viewBox", "0 0 20 20");
}

export function setStatusPlaying(playing: boolean): void {
  const dot = document.getElementById("dot");
  if (dot) dot.className = playing ? "dot live" : "dot";
  const statusTxt = document.getElementById("statusTxt");
  if (statusTxt) statusTxt.textContent = playing ? "playing ∞" : "paused";
}
