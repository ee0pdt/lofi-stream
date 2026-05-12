import { serveDir } from "jsr:@std/http@^1/file-server";

const buildCmd = new Deno.Command(Deno.execPath(), {
  args: ["run", "-A", "scripts/build.ts"],
  stdout: "inherit",
  stderr: "inherit",
});
const buildResult = await buildCmd.output();
if (!buildResult.success) {
  console.error("dev: initial build failed");
  Deno.exit(1);
}

const port = 8000;
console.log(`dev: serving on http://localhost:${port}`);
Deno.serve({ port }, (req) => serveDir(req, { fsRoot: "." }));
