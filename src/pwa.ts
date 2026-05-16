import type { AudioRefs, Mood } from "./types.ts";

interface MediaStore {
  get(): { currentMood: Mood; isPlaying: boolean };
}

const MOOD_LABELS: Record<Mood, string> = {
  rainy: "rainy day",
  late: "late night",
  cafe: "café",
  sleepy: "sleepy",
  transit: "transit",
};

// ---- Service worker ----

export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js").catch(() => {
    // Non-fatal — app works without SW, just no offline support.
  });
}

// ---- Media Session ----

export function setupMediaSession(
  audio: AudioRefs,
  store: MediaStore,
  callbacks: { onPlay: () => void; onPause: () => void; onNext: () => void },
): void {
  if (!("mediaSession" in navigator)) return;

  updateMediaSessionMood(store.get().currentMood);
  navigator.mediaSession.setActionHandler("play", callbacks.onPlay);
  navigator.mediaSession.setActionHandler("pause", callbacks.onPause);
  navigator.mediaSession.setActionHandler("nexttrack", callbacks.onNext);
  navigator.mediaSession.playbackState = "playing";

  // On iOS, a phone call or notification suspends the AudioContext.
  // Resume automatically when the interruption ends.
  audio.actx.addEventListener("statechange", () => {
    if (audio.actx.state === "suspended" && store.get().isPlaying) {
      audio.actx.resume().catch(() => {});
    }
  });

  // Near-silent keepalive oscillator (~-100 dB). iOS will suspend the
  // AudioContext if it detects no audio output — this prevents that
  // without being audible.
  const osc = audio.actx.createOscillator();
  const gain = audio.actx.createGain();
  gain.gain.value = 1e-5;
  osc.connect(gain);
  gain.connect(audio.actx.destination);
  osc.start();
}

export function updateMediaSessionMood(mood: Mood): void {
  if (!("mediaSession" in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: "lofi forever",
    artist: MOOD_LABELS[mood],
    album: "generative lofi",
  });
}

export function setMediaSessionPlaybackState(playing: boolean): void {
  if (!("mediaSession" in navigator)) return;
  navigator.mediaSession.playbackState = playing ? "playing" : "paused";
}

// ---- iOS install banner ----

const DISMISSED_KEY = "lofi-ios-banner-v1";

function isIOSSafari(): boolean {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) &&
    !(window as Window & { MSStream?: unknown }).MSStream;
  // Exclude Chrome and other non-Safari browsers on iOS
  const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua);
  return isIOS && isSafari;
}

function isStandalone(): boolean {
  return (
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches
  );
}

export function maybeShowIOSBanner(): void {
  if (!isIOSSafari() || isStandalone()) return;
  if (localStorage.getItem(DISMISSED_KEY)) return;

  const banner = document.getElementById("iosBanner");
  if (!banner) return;
  banner.style.display = "flex";

  document.getElementById("iosBannerDismiss")?.addEventListener("click", () => {
    banner.style.display = "none";
    localStorage.setItem(DISMISSED_KEY, "1");
  });
}
