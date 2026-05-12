import { assertEquals } from "jsr:@std/assert@^1";
import { scanContent } from "./check-unicode.ts";

Deno.test("scanContent: clean content has no violations", () => {
  const violations = scanContent(":root { --warm: red; }", "test.css");
  assertEquals(violations.length, 0);
});

Deno.test("scanContent: en-dash in CSS property is flagged", () => {
  const violations = scanContent(":root { –warm: red; }", "test.css");
  assertEquals(violations.length, 1);
  assertEquals(violations[0].char, "–");
  assertEquals(violations[0].suggest, "--");
  assertEquals(violations[0].line, 1);
});

Deno.test("scanContent: smart single quotes are flagged", () => {
  const left = scanContent("font: ‘DM Mono’;", "test.css");
  assertEquals(left.length, 2);
  assertEquals(left[0].suggest, "'");
});

Deno.test("scanContent: smart double quotes are flagged", () => {
  const v = scanContent("foo “bar” baz", "test.html");
  assertEquals(v.length, 2);
  assertEquals(v[0].suggest, '"');
});

Deno.test("scanContent: em-dash in // comment is allowed", () => {
  const v = scanContent("// section — audio — here\nconst x = 1;", "test.ts");
  assertEquals(v.length, 0);
});

Deno.test("scanContent: em-dash in /* */ comment is allowed", () => {
  const v = scanContent("/* — banner — */\nconst x = 1;", "test.ts");
  assertEquals(v.length, 0);
});

Deno.test("scanContent: em-dash in multi-line /* */ comment is allowed", () => {
  const src = "/* line one\n line two with — dash\n line three */\nconst x = 1;";
  const v = scanContent(src, "test.ts");
  assertEquals(v.length, 0);
});

Deno.test("scanContent: em-dash outside any comment is flagged", () => {
  const v = scanContent("const s = 'hello — world';", "test.ts");
  assertEquals(v.length, 1);
  assertEquals(v[0].char, "—");
});

Deno.test("scanContent: em-dash in HTML <!-- --> comment is allowed", () => {
  const v = scanContent("<!-- — banner — -->", "test.html");
  assertEquals(v.length, 0);
});

Deno.test("scanContent: reports correct line and column for multi-line input", () => {
  const src = "line one\nline two\nline three with –dash";
  const v = scanContent(src, "test.css");
  assertEquals(v.length, 1);
  assertEquals(v[0].line, 3);
  assertEquals(v[0].col, 17);
});

Deno.test("scanContent: multiple violations on one line are all reported", () => {
  const v = scanContent("–one and –two", "test.css");
  assertEquals(v.length, 2);
});
