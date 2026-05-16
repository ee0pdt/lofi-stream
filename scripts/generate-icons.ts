// Generates icons/icon.svg, icons/icon-192.png, icons/icon-512.png.
// Pure Deno — no external dependencies. Uses built-in CompressionStream for PNG DEFLATE.

const ICONS_DIR = new URL("../icons/", import.meta.url).pathname;

await Deno.mkdir(ICONS_DIR, { recursive: true });

// ---- PNG encoder (CRC-32 + zlib-wrapped DEFLATE) ----

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of buf) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function u32be(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0);
  return b;
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const crcBytes = u32be(crc32(concat(typeBytes, data)));
  return concat(u32be(data.length), typeBytes, data, crcBytes);
}

async function zlibCompress(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("deflate");
  const writer = cs.writable.getWriter();
  const reader = cs.readable.getReader();
  await writer.write(
    data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
  );
  await writer.close();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return concat(...chunks);
}

async function encodePNG(width: number, height: number, rgba: Uint8Array): Promise<Uint8Array> {
  const stride = width * 4;
  // Prepend filter-type byte 0 (None) to each row
  const filtered = new Uint8Array(height * (stride + 1));
  for (let row = 0; row < height; row++) {
    filtered[row * (stride + 1)] = 0;
    filtered.set(rgba.subarray(row * stride, (row + 1) * stride), row * (stride + 1) + 1);
  }

  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA

  return concat(
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", await zlibCompress(filtered)),
    pngChunk("IEND", new Uint8Array(0)),
  );
}

// ---- Icon rasterizer ----

function inRoundedRect(px: number, py: number, size: number, r: number): boolean {
  const left = r, right = size - r, top = r, bottom = size - r;
  const dx = px < left ? left - px : px > right ? px - right : 0;
  const dy = py < top ? top - py : py > bottom ? py - bottom : 0;
  return dx * dx + dy * dy <= r * r;
}

function rasterize(size: number): Uint8Array {
  const rgba = new Uint8Array(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const circleR = size * 0.36;
  const cornerR = size * 0.22;
  const barH = Math.max(2, Math.round(size * 0.035));
  const barSpacing = size * 0.08;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const idx = (py * size + px) * 4;
      if (!inRoundedRect(px, py, size, cornerR)) continue; // transparent corner

      const dx = px - cx;
      const dy = py - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= circleR) {
        // Orange fill with subtle radial gradient (#c97d40 → slightly darker at edge)
        const t = dist / circleR;
        rgba[idx] = Math.round(201 - t * 20);
        rgba[idx + 1] = Math.round(125 - t * 15);
        rgba[idx + 2] = Math.round(64 + t * 10);
        rgba[idx + 3] = 255;

        // Three horizontal bars — EQ / lofi waveform aesthetic
        for (let bi = -1; bi <= 1; bi++) {
          const barCy = cy + bi * barSpacing;
          const halfW = circleR * (0.65 - Math.abs(bi) * 0.12);
          if (Math.abs(py - barCy) < barH && Math.abs(px - cx) < halfW) {
            rgba[idx] = 17;
            rgba[idx + 1] = 17;
            rgba[idx + 2] = 17;
            rgba[idx + 3] = 210;
          }
        }
      } else {
        // Dark background #111111
        rgba[idx] = 17;
        rgba[idx + 1] = 17;
        rgba[idx + 2] = 17;
        rgba[idx + 3] = 255;
      }
    }
  }
  return rgba;
}

// ---- Write files ----

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="#111"/>
  <circle cx="50" cy="50" r="28" fill="#c97d40"/>
  <rect x="35" y="43" width="30" height="3.5" rx="1.75" fill="#111" opacity="0.55"/>
  <rect x="37" y="50" width="26" height="3.5" rx="1.75" fill="#111" opacity="0.55"/>
  <rect x="35" y="57" width="30" height="3.5" rx="1.75" fill="#111" opacity="0.55"/>
</svg>
`;

await Deno.writeTextFile(`${ICONS_DIR}icon.svg`, SVG);
console.log("icons/icon.svg");

for (const size of [192, 512]) {
  const pixels = rasterize(size);
  const png = await encodePNG(size, size, pixels);
  await Deno.writeFile(`${ICONS_DIR}icon-${size}.png`, png);
  console.log(`icons/icon-${size}.png`);
}
