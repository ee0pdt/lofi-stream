/**
 * Frequency-band visualiser — 32 bars with peak followers, drawn into
 * a small 2D canvas under the controls. Idle state pulses gently while
 * the analyser is null (before play has been pressed).
 */

const NUM_BARS = 32;

export function mountAnalyserVisualiser(
  canvas: HTMLCanvasElement,
  getAnalyser: () => AnalyserNode | null,
  getAccent: () => readonly [number, number, number],
): void {
  const visCtx = canvas.getContext("2d");
  if (!visCtx) return;

  const barPeaks = new Float32Array(NUM_BARS);
  const barFalls = new Float32Array(NUM_BARS);
  let visW = 0;
  let visH = 0;

  function syncSize() {
    const dpr = globalThis.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    let cssW = rect.width;
    if (cssW < 2 && canvas.parentElement) {
      cssW = canvas.parentElement.getBoundingClientRect().width;
    }
    if (cssW < 2) cssW = globalThis.innerWidth - 40;
    const cssH = 56;
    const newW = Math.max(4, Math.round(cssW * dpr));
    const newH = Math.max(4, Math.round(cssH * dpr));
    if (canvas.width !== newW) canvas.width = newW;
    if (canvas.height !== newH) canvas.height = newH;
    visW = newW;
    visH = newH;
  }

  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(syncSize).observe(canvas);
  }
  [0, 100, 300, 800, 2000].forEach((t) => setTimeout(syncSize, t));
  globalThis.addEventListener("resize", syncSize);
  globalThis.addEventListener("orientationchange", () => setTimeout(syncSize, 250));
  if (globalThis.visualViewport) {
    globalThis.visualViewport.addEventListener("resize", syncSize);
  }

  function frame() {
    requestAnimationFrame(frame);
    if (visW < 4 || visH < 4) {
      syncSize();
      if (visW < 4) return;
    }
    const W = visW;
    const H = visH;
    const [ar, ag, ab] = getAccent();
    const lar = Math.min(255, ar + 31);
    const lag = Math.min(255, ag + 51);
    const lab = Math.min(255, ab + 58);

    const bg = visCtx!.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "rgba(0,0,0,0.0)");
    bg.addColorStop(1, "rgba(0,0,0,0.35)");
    visCtx!.fillStyle = bg;
    visCtx!.fillRect(0, 0, W, H);

    const analyser = getAnalyser();
    if (!analyser) {
      const t = performance.now() * 0.001;
      const pulse = 0.2 + 0.15 * Math.sin(t * 1.2);
      visCtx!.fillStyle = `rgba(${ar},${ag},${ab},${pulse})`;
      const barW = W / NUM_BARS;
      for (let i = 0; i < NUM_BARS; i++) {
        const idleH = (1 + Math.sin(t * 0.8 + i * 0.4)) * 2 + 1;
        const x = i * barW;
        visCtx!.fillRect(
          x + barW * 0.2,
          H / 2 - idleH / 2,
          barW * 0.6,
          idleH,
        );
      }
      return;
    }

    const binCount = analyser.frequencyBinCount;
    const buf = new Uint8Array(binCount);
    analyser.getByteFrequencyData(buf);

    const barW = W / NUM_BARS;
    const dpr = globalThis.devicePixelRatio || 1;

    for (let i = 0; i < NUM_BARS; i++) {
      const fLo = Math.pow(i / NUM_BARS, 2);
      const fHi = Math.pow((i + 1) / NUM_BARS, 2);
      const binLo = Math.floor(fLo * binCount);
      const binHi = Math.max(binLo + 1, Math.floor(fHi * binCount));
      let sum = 0;
      for (let b = binLo; b < binHi; b++) sum += buf[b];
      const avg = sum / (binHi - binLo) / 255;

      if (avg > barPeaks[i]) barPeaks[i] = barPeaks[i] * 0.3 + avg * 0.7;
      else barPeaks[i] = barPeaks[i] * 0.86 + avg * 0.14;

      if (barPeaks[i] > barFalls[i]) barFalls[i] = barPeaks[i];
      else barFalls[i] = Math.max(barPeaks[i], barFalls[i] - 0.012);

      const v = barPeaks[i];
      const barH = v * H * 0.95;
      const x = i * barW;
      const padX = Math.max(1, barW * 0.18);

      const grad = visCtx!.createLinearGradient(0, H - barH, 0, H);
      grad.addColorStop(0, `rgba(${lar},${lag},${lab},${0.4 + v * 0.6})`);
      grad.addColorStop(1, `rgba(${ar},${ag},${ab},${0.7 + v * 0.3})`);
      visCtx!.fillStyle = grad;
      visCtx!.fillRect(x + padX, H - barH, barW - padX * 2, barH);

      if (barFalls[i] > 0.05) {
        const peakY = H - barFalls[i] * H * 0.95;
        visCtx!.fillStyle = `rgba(${lar},${lag},${lab},${0.6 + v * 0.4})`;
        visCtx!.fillRect(x + padX, peakY, barW - padX * 2, Math.max(1, dpr));
      }
    }
  }

  frame();
}

/** Parse the current `--warm` CSS custom property into an [r,g,b] triple. */
export function readAccentRgb(): readonly [number, number, number] {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue("--warm")
    .trim();
  if (v.startsWith("#")) {
    const r = parseInt(v.slice(1, 3), 16);
    const g = parseInt(v.slice(3, 5), 16);
    const b = parseInt(v.slice(5, 7), 16);
    return [r, g, b];
  }
  const m = v.match(/(\d+(?:\.\d+)?)/g);
  if (m && m.length >= 3) return [+m[0], +m[1], +m[2]];
  return [201, 125, 64];
}
