/**
 * Bottom-sheet drag handler. Supports both mouse and touch. Snaps to
 * collapsed (220px) or expanded (75vh) on release.
 */

export function mountSheet(): void {
  const sheet = document.getElementById("sheet");
  if (!sheet) return;
  const handle = sheet.querySelector(".handle") as HTMLElement | null;
  if (!handle) return;

  let dragging = false;
  let startY = 0;
  let startH = 0;
  const minH = 180;
  const maxH = () => globalThis.innerHeight * 0.88;

  const clamp = (v: number) => Math.max(minH, Math.min(maxH(), v));

  const onMove = (e: MouseEvent | TouchEvent) => {
    if (!dragging) return;
    e.preventDefault();
    const y = "touches" in e ? e.touches[0].clientY : e.clientY;
    const delta = startY - y;
    sheet.style.height = clamp(startH + delta) + "px";
  };

  const onEnd = () => {
    if (!dragging) return;
    dragging = false;
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onEnd);
    document.removeEventListener("touchmove", onMove);
    document.removeEventListener("touchend", onEnd);
    const h = sheet.offsetHeight;
    const mid = globalThis.innerHeight * 0.45;
    sheet.classList.add("settling");
    sheet.style.height = (h < mid ? 220 : globalThis.innerHeight * 0.75) + "px";
  };

  const onStart = (e: MouseEvent | TouchEvent) => {
    dragging = true;
    startY = "touches" in e ? e.touches[0].clientY : e.clientY;
    startH = sheet.offsetHeight;
    sheet.classList.remove("settling");
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onEnd);
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
  };

  handle.addEventListener("mousedown", onStart);
  handle.addEventListener("touchstart", onStart, { passive: true });
}
