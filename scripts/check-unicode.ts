export type Violation = {
  file: string;
  line: number;
  col: number;
  char: string;
  name: string;
  suggest: string;
};

type Rule = {
  char: string;
  name: string;
  suggest: string;
  allowInComments?: boolean;
};

// Characters are written as Unicode escapes so this source file itself
// stays clean of contamination (and can be self-scanned if needed).
const RULES: Rule[] = [
  { char: "–", name: "en-dash (U+2013)", suggest: "--" },
  { char: "—", name: "em-dash (U+2014)", suggest: "--", allowInComments: true },
  { char: "‘", name: "left smart quote (U+2018)", suggest: "'" },
  { char: "’", name: "right smart quote (U+2019)", suggest: "'" },
  { char: "“", name: "left smart double quote (U+201C)", suggest: '"' },
  { char: "”", name: "right smart double quote (U+201D)", suggest: '"' },
];

const RULE_BY_CHAR = new Map(RULES.map((r) => [r.char, r]));

function record(
  out: Violation[],
  filename: string,
  line: number,
  col: number,
  ch: string,
  rule: Rule,
) {
  out.push({ file: filename, line, col, char: ch, name: rule.name, suggest: rule.suggest });
}

/**
 * Scan a single content string for forbidden characters.
 * Tracks block comments and line comments. Em-dashes inside any comment are
 * allowed; smart quotes are flagged regardless of comment context.
 */
export function scanContent(text: string, filename: string): Violation[] {
  const violations: Violation[] = [];
  let inBlockC = false;
  let inBlockHtml = false;
  let line = 1;
  let lineStart = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === "\n") {
      line++;
      lineStart = i + 1;
      continue;
    }

    if (!inBlockC && !inBlockHtml && text.startsWith("/*", i)) {
      inBlockC = true;
      i++;
      continue;
    }
    if (inBlockC && text.startsWith("*/", i)) {
      inBlockC = false;
      i++;
      continue;
    }
    if (!inBlockC && !inBlockHtml && text.startsWith("<!--", i)) {
      inBlockHtml = true;
      i += 3;
      continue;
    }
    if (inBlockHtml && text.startsWith("-->", i)) {
      inBlockHtml = false;
      i += 2;
      continue;
    }

    if (!inBlockC && !inBlockHtml && text.startsWith("//", i)) {
      const nl = text.indexOf("\n", i);
      const end = nl === -1 ? text.length : nl;
      for (let j = i; j < end; j++) {
        const rule = RULE_BY_CHAR.get(text[j]);
        if (rule && !rule.allowInComments) {
          record(violations, filename, line, j - lineStart + 1, text[j], rule);
        }
      }
      i = end - 1;
      continue;
    }

    const rule = RULE_BY_CHAR.get(ch);
    if (!rule) continue;
    const inComment = inBlockC || inBlockHtml;
    if (rule.allowInComments && inComment) continue;
    record(violations, filename, line, i - lineStart + 1, ch, rule);
  }

  return violations;
}

/**
 * Scan one or more files on disk, returning all violations.
 */
export async function scanFiles(paths: string[]): Promise<Violation[]> {
  const all: Violation[] = [];
  for (const path of paths) {
    const text = await Deno.readTextFile(path);
    all.push(...scanContent(text, path));
  }
  return all;
}

async function defaultPaths(): Promise<string[]> {
  const paths: string[] = [];
  try {
    await Deno.stat("index.html");
    paths.push("index.html");
  } catch { /* missing is fine */ }
  for await (const entry of expandGlob("src/**/*.{ts,css}")) {
    paths.push(entry.path);
  }
  return paths;
}

async function* expandGlob(pattern: string): AsyncIterable<{ path: string }> {
  const m = pattern.match(/^(.+)\/\*\*\/\*\.\{(.+)\}$/);
  if (!m) return;
  const root = m[1];
  const exts = m[2].split(",");
  try {
    await Deno.stat(root);
  } catch {
    return;
  }
  for await (const entry of Deno.readDir(root)) {
    const path = `${root}/${entry.name}`;
    if (entry.isDirectory) {
      yield* expandGlob(`${path}/**/*.{${exts.join(",")}}`);
    } else if (exts.some((e) => entry.name.endsWith(`.${e}`))) {
      yield { path };
    }
  }
}

if (import.meta.main) {
  const paths = await defaultPaths();
  const violations = await scanFiles(paths);
  if (violations.length === 0) {
    console.log(`check-unicode: clean (${paths.length} file(s) scanned)`);
    Deno.exit(0);
  }
  for (const v of violations) {
    console.error(
      `${v.file}:${v.line}:${v.col}  ${v.name}  -> suggest: ${JSON.stringify(v.suggest)}`,
    );
  }
  console.error(`\ncheck-unicode: ${violations.length} violation(s)`);
  Deno.exit(1);
}
