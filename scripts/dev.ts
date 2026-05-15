import { serveDir } from "jsr:@std/http@^1/file-server";
import * as esbuild from "npm:esbuild@^0.24";

const RELOAD_PATH = "/__livereload";
const RELOAD_CLIENT = `
<script>
  (function() {
    var es = new EventSource("${RELOAD_PATH}");
    es.onmessage = function() { location.reload(); };
    es.onerror = function() { es.close(); };
  })();
</script>
`;

// SSE clients waiting for a reload signal
const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();

function broadcast() {
  for (const ctrl of clients) {
    try {
      ctrl.enqueue(new TextEncoder().encode("data: reload\n\n"));
    } catch {
      clients.delete(ctrl);
    }
  }
}

// esbuild watch context — rebuilds on src changes and calls broadcast
const ctx = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  outfile: "dist/main.js",
  format: "esm",
  target: "es2022",
  sourcemap: "inline",
  logLevel: "info",
  plugins: [
    {
      name: "livereload",
      setup(build) {
        build.onEnd((result) => {
          if (result.errors.length === 0) {
            console.log("dev: rebuilt dist/main.js");
            broadcast();
          }
        });
      },
    },
  ],
});

// Trigger an initial build and start watching
await ctx.rebuild();
await ctx.watch();
console.log("dev: watching src/ for changes");

// Also watch index.html directly (esbuild only watches src/)
(async () => {
  const watcher = Deno.watchFs(["index.html"]);
  for await (const event of watcher) {
    if (event.kind === "modify" || event.kind === "create") {
      console.log("dev: index.html changed");
      broadcast();
    }
  }
})();

const port = 8000;
console.log(`dev: serving on http://localhost:${port}`);

Deno.serve({ port }, async (req) => {
  const url = new URL(req.url);

  // SSE endpoint
  if (url.pathname === RELOAD_PATH) {
    let ctrl!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        ctrl = c;
        clients.add(ctrl);
      },
      cancel() {
        clients.delete(ctrl);
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  }

  // Serve static files; inject reload client into HTML responses
  const res = await serveDir(req, { fsRoot: "." });
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("text/html")) {
    const original = await res.text();
    const patched = original.replace("</body>", `${RELOAD_CLIENT}</body>`);
    return new Response(patched, {
      status: res.status,
      headers: res.headers,
    });
  }
  return res;
});
