import * as esbuild from "npm:esbuild@^0.24";

const result = await esbuild.build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  outfile: "dist/main.js",
  format: "esm",
  target: "es2022",
  sourcemap: "inline",
  logLevel: "info",
});

if (result.errors.length > 0) {
  console.error(result.errors);
  Deno.exit(1);
}

console.log("build: dist/main.js produced");
esbuild.stop();
