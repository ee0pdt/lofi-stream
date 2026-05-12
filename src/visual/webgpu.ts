/**
 * WebGPU background renderer — five drifting Gaussian blobs over a
 * per-mood base colour, with blob radius pulsing on `amp`. Falls back
 * to the caller's responsibility (Canvas2D) if WebGPU is unavailable.
 *
 * `getMood` and `getAmp` are called per frame so the renderer always
 * reflects current state without subscribing to the store.
 */

import type { Mood } from "../types.ts";

interface MoodGpu {
  readonly base: readonly [number, number, number];
  readonly blobs: ReadonlyArray<readonly [number, number, number, number]>;
}

const MOOD_GPU: Record<Mood, MoodGpu> = {
  rainy: {
    base: [0.04, 0.07, 0.12],
    blobs: [
      [200, 55, 55, 0.45],
      [230, 40, 40, 0.4],
      [260, 30, 55, 0.3],
    ],
  },
  late: {
    base: [0.05, 0.04, 0.09],
    blobs: [
      [270, 45, 50, 0.45],
      [300, 35, 45, 0.4],
      [210, 30, 50, 0.32],
    ],
  },
  cafe: {
    base: [0.08, 0.04, 0.02],
    blobs: [
      [28, 60, 55, 0.5],
      [15, 55, 50, 0.4],
      [40, 50, 55, 0.32],
    ],
  },
  sleepy: {
    base: [0.02, 0.05, 0.07],
    blobs: [
      [190, 40, 50, 0.4],
      [210, 30, 45, 0.36],
      [170, 35, 50, 0.3],
    ],
  },
};

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(Math.min(k(n) - 3, 9 - k(n)), 1));
  return [f(0), f(8), f(4)];
}

// WebGPU types aren't in Deno's default dom lib (they live in the webgpu
// types package, which we don't pull in). The runtime path is real on
// supported browsers; declare locally what we use so type-checking passes.
// deno-lint-ignore no-explicit-any
type WebGPUAny = any;

export async function tryWebGPU(
  canvas: HTMLCanvasElement,
  getMood: () => Mood,
  getAmp: () => number,
): Promise<boolean> {
  try {
    const W = globalThis as unknown as {
      GPUBufferUsage: { UNIFORM: number; COPY_DST: number };
      GPUShaderStage: { VERTEX: number; FRAGMENT: number };
    };
    const nav = navigator as unknown as { gpu?: WebGPUAny };
    if (!nav.gpu) return false;
    const adapter = await nav.gpu.requestAdapter();
    if (!adapter) return false;
    const device: WebGPUAny = await adapter.requestDevice();
    const ctx = canvas.getContext("webgpu") as WebGPUAny;
    if (!ctx) return false;

    const format = nav.gpu.getPreferredCanvasFormat();

    const resize = () => {
      const w = globalThis.visualViewport?.width || globalThis.innerWidth;
      const h = globalThis.visualViewport?.height || globalThis.innerHeight;
      canvas.width = Math.max(2, Math.floor(w * devicePixelRatio));
      canvas.height = Math.max(2, Math.floor(h * devicePixelRatio));
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx!.configure({ device, format, alphaMode: "opaque" });
    };
    resize();
    globalThis.addEventListener("resize", resize);
    globalThis.addEventListener("orientationchange", () => setTimeout(resize, 200));
    if (globalThis.visualViewport) {
      globalThis.visualViewport.addEventListener("resize", resize);
    }

    const uniformBuf = device.createBuffer({
      size: 96,
      usage: W.GPUBufferUsage.UNIFORM | W.GPUBufferUsage.COPY_DST,
    });

    const shaderCode = `
struct Uniforms {
  time: f32, amp: f32, w: f32, h: f32,
  base: vec4f,
  blob0: vec4f,
  blob1: vec4f,
  blob2: vec4f,
}
@group(0) @binding(0) var<uniform> u: Uniforms;

struct VO { @builtin(position) pos: vec4f, @location(0) uv: vec2f }

@vertex fn vs(@builtin(vertex_index) vi: u32) -> VO {
  var positions = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f( 3.0, -1.0),
    vec2f(-1.0,  3.0),
  );
  let p = positions[vi];
  var out: VO;
  out.pos = vec4f(p, 0.0, 1.0);
  out.uv = vec2f((p.x + 1.0) * 0.5, 1.0 - (p.y + 1.0) * 0.5);
  return out;
}

fn blobField(uv: vec2f, cx: f32, cy: f32, r: f32) -> f32 {
  let d = distance(uv, vec2f(cx, cy));
  let n = d / r;
  return exp(-n * n * 2.5);
}

@fragment fn fs(in: VO) -> @location(0) vec4f {
  let uv = in.uv;
  let t = u.time;
  let amp = u.amp;

  let cx0 = 0.25 + sin(t * 0.55 + 0.1) * 0.18;
  let cy0 = 0.20 + cos(t * 0.48 + 1.3) * 0.14;
  let cx1 = 0.72 + sin(t * 0.52 + 2.1) * 0.18;
  let cy1 = 0.24 + cos(t * 0.58 + 0.7) * 0.14;
  let cx2 = 0.50 + sin(t * 0.45 + 4.2) * 0.22;
  let cy2 = 0.35 + cos(t * 0.53 + 2.9) * 0.16;
  let cx3 = 0.18 + sin(t * 0.60 + 3.3) * 0.16;
  let cy3 = 0.42 + cos(t * 0.50 + 5.1) * 0.14;
  let cx4 = 0.82 + sin(t * 0.57 + 5.7) * 0.16;
  let cy4 = 0.32 + cos(t * 0.46 + 4.4) * 0.14;

  let r0 = 0.28 * (0.88 + 0.12 * sin(t * 1.0) + amp * 0.22);
  let r1 = 0.32 * (0.90 + 0.10 * sin(t * 1.1 + 1.0) + amp * 0.20);
  let r2 = 0.40 * (0.86 + 0.14 * sin(t * 0.85 + 2.0) + amp * 0.25);
  let r3 = 0.26 * (0.89 + 0.11 * sin(t * 0.95 + 3.0) + amp * 0.22);
  let r4 = 0.30 * (0.87 + 0.13 * sin(t * 1.05 + 4.0) + amp * 0.20);

  let f0 = blobField(uv, cx0, cy0, r0);
  let f1 = blobField(uv, cx1, cy1, r1);
  let f2 = blobField(uv, cx2, cy2, r2);
  let f3 = blobField(uv, cx3, cy3, r3);
  let f4 = blobField(uv, cx4, cy4, r4);

  let col0 = u.blob0.rgb * u.blob0.a * (f0 + f3 * 0.6);
  let col1 = u.blob1.rgb * u.blob1.a * (f1 + f4 * 0.6);
  let col2 = u.blob2.rgb * u.blob2.a * f2;

  let blended = u.base.rgb + col0 + col1 + col2;

  let vignette = 1.0 - smoothstep(0.5, 1.0, uv.y) * 0.25;

  return vec4f(blended * vignette, 1.0);
}
`;

    const shader = device.createShaderModule({ code: shaderCode });

    const bgl = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: W.GPUShaderStage.VERTEX | W.GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    });

    const bindGroup = device.createBindGroup({
      layout: bgl,
      entries: [{ binding: 0, resource: { buffer: uniformBuf } }],
    });

    const pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [bgl] }),
      vertex: { module: shader, entryPoint: "vs" },
      fragment: {
        module: shader,
        entryPoint: "fs",
        targets: [{ format }],
      },
      primitive: { topology: "triangle-list" },
    });

    let t = 0;
    const frame = () => {
      requestAnimationFrame(frame);
      t += 0.018;
      const m = MOOD_GPU[getMood()] ?? MOOD_GPU.rainy;
      const blobs = m.blobs.map(([h, s, l, a]) => {
        const [r, g, b] = hslToRgb(h, s, l);
        return [r, g, b, a];
      });
      const uni = new Float32Array([
        t,
        getAmp(),
        canvas.width,
        canvas.height,
        m.base[0],
        m.base[1],
        m.base[2],
        0,
        blobs[0][0],
        blobs[0][1],
        blobs[0][2],
        blobs[0][3],
        blobs[1][0],
        blobs[1][1],
        blobs[1][2],
        blobs[1][3],
        blobs[2][0],
        blobs[2][1],
        blobs[2][2],
        blobs[2][3],
      ]);
      device.queue.writeBuffer(uniformBuf, 0, uni);

      const cmd = device.createCommandEncoder();
      const rp = cmd.beginRenderPass({
        colorAttachments: [
          {
            view: ctx!.getCurrentTexture().createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      rp.setPipeline(pipeline);
      rp.setBindGroup(0, bindGroup);
      rp.draw(3);
      rp.end();
      device.queue.submit([cmd.finish()]);
    };
    frame();
    return true;
  } catch (e) {
    console.warn("WebGPU failed, using Canvas2D fallback:", e);
    return false;
  }
}
