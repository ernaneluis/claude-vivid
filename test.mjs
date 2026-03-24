#!/usr/bin/env node
/**
 * Test suite for _CC_ colorizer patterns.
 * Run: npm test
 *
 * Tests the regex patterns in isolation (no ANSI codes, no chalk)
 * to verify they match the expected text and nothing else.
 */

// Extract patterns from color-patcher.mjs (same regexes, no chalk)
const patterns = [
  { name: "URLs", re: /(https?:\/\/[^\s,;)\]>]+)/g },
  { name: "File paths (prefix)", re: /((?:~\/|\.\/|\.\.\/)[\/\w.@-]+)/g },
  { name: "File paths (multi-seg)", re: /(\b[\w-]+(?:\/[\w.@-]+){2,})/g },
  { name: "Env vars", re: /(\$[A-Z_][A-Z0-9_]*)/g },
  { name: "Hex numbers", re: /(\b0x[0-9a-fA-F]+\b)/g },
  { name: "CLI flags", re: /(--[a-zA-Z][\w-]*)/g },
  { name: "Git refs", re: /(\b(?:main|master|HEAD)\b)/g },
  { name: "Commit hashes", re: /(\b[a-f0-9]{7,12}\b)/g },
  { name: "Function calls", re: /(\b\w+\(\))/g },
  { name: "Packages", re: /(@[\w-]+\/[\w.-]+|\b(?:express|react|vue|svelte|next|vite|webpack|typescript|eslint|prettier|jest|vitest|puppeteer|playwright|tailwind|prisma|drizzle|zod|chalk|lodash|axios|fastify|bun|deno|node|npm|npx|pnpm|yarn|docker|redis|postgres|mongodb|sqlite)\b)/g },
  { name: "Versions", re: /(\bv\d+\.\d+(?:\.\d+)?\b|[\^~]\d+\.\d+(?:\.\d+)?)/g },
  { name: "Localhost/IPs", re: /(\blocalhost:\d+|\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?::\d+)?\b)/g },
  { name: "Filenames w/ ext", re: /(\b[\w-]+\.(?:jsx|tsx|ts|js|mjs|cjs|json|md|py|go|rs|rb|java|css|scss|html|yaml|yml|toml|sql|sh|bash|env|lock|log|txt|xml|svg|png|jpg|gif)\b)/g },
  { name: "Error codes", re: /(\b(?:ENOENT|ECONNREFUSED|EACCES|EPERM|EEXIST|EISDIR|ENOTDIR|EADDRINUSE|ETIMEDOUT|ERR_MODULE_NOT_FOUND|ERR_REQUIRE_ESM|ENOMEM|SIGKILL|SIGTERM|SIGSEGV)\b)/g },
  { name: "HTTP methods", re: /(\b(?:GET|POST|PUT|DELETE|PATCH|OPTIONS)\b)/g },
  { name: "Booleans/nulls", re: /(\b(?:true|false|null|undefined|nil|NaN|Infinity)\b)/g },
  { name: "Type names", re: /(\b(?:string|number|boolean|bigint|symbol|void|any|never|unknown|Array|Object|Map|Set|Promise|Record|Partial|Required|Readonly)\b)/g },
  { name: "Durations/sizes", re: /(\b\d+(?:\.\d+)?\s*(?:ms|[smhd]|fps|KB|MB|GB|TB|px|rem|em|vh|vw|%|kB|sec|min|hr)\b)/g },
  { name: "Regex patterns", re: /(\/[^\/\s]{2,}\/[gimsuy]*)/g },
  { name: "Double-quoted", re: /("(?:[^"\\]|\\.){1,80}")/g },
  { name: "Single-quoted", re: /('(?:[^'\\]|\\.){1,80}')/g },
  { name: "Parenthesized", re: /(\([^()]{1,60}\))/g },
  { name: "Bracketed", re: /(\[[^\[\]]{1,60}\])/g },
  { name: "Curly-braced", re: /(\{[^{}]{1,60}\})/g },
  { name: "JSX/Components", re: /(<[A-Z][\w.]*\s*\/?>|<\/[A-Z][\w.]*>)/g },
  { name: "camelCase (3+ parts)", re: /(\b[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*){2,}\b)/g },
  { name: "snake_case", re: /(\b[a-z]+(?:_[a-z0-9]+)+\b)/g },
  { name: "PascalCase", re: /(\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b)/g },
  { name: "Annotations", re: /(\b(?:TODO|FIXME|HACK|NOTE|WARNING|DEPRECATED|IMPORTANT|BUG|XXX|REVIEW)\b)/g },
  { name: "Decimals", re: /(\b\d+\.\d+\b)/g },
];

// Test cases: [input, patternName, expectedMatches[]]
const tests = [
  // File paths (prefix)
  ["~/Developer/dale-carousel/src/app.tsx", "File paths (prefix)", ["~/Developer/dale-carousel/src/app.tsx"]],
  ["./server/index.js", "File paths (prefix)", ["./server/index.js"]],
  ["../config/base.json", "File paths (prefix)", ["../config/base.json"]],
  ["~/.claude/settings.json", "File paths (prefix)", ["~/.claude/settings.json"]],
  // Paths should NOT swallow commas
  ["~/foo/bar, ./baz/qux", "File paths (prefix)", ["~/foo/bar", "./baz/qux"]],

  // File paths (multi-segment)
  ["src/components/App.tsx", "File paths (multi-seg)", ["src/components/App.tsx"]],
  ["node_modules/@types/node", "File paths (multi-seg)", ["node_modules/@types/node"]],

  // URLs
  ["https://github.com/anthropics/claude-code", "URLs", ["https://github.com/anthropics/claude-code"]],
  ["http://localhost:3000/api/v1", "URLs", ["http://localhost:3000/api/v1"]],
  // URLs should NOT swallow commas
  ["https://a.com, https://b.com", "URLs", ["https://a.com", "https://b.com"]],
  // URLs should NOT swallow closing parens/brackets
  ["(https://example.com)", "URLs", ["https://example.com"]],

  // Env vars
  [": $NODE_ENV, $HOME, $DATABASE_URL", "Env vars", ["$NODE_ENV", "$HOME", "$DATABASE_URL"]],
  // Should not match lowercase
  [": $foo, $bar", "Env vars", []],

  // Hex
  [": 0xFF00AA, 0x1a2b3c", "Hex numbers", ["0xFF00AA", "0x1a2b3c"]],

  // Flags
  [": --verbose, --no-verify, --output-dir", "CLI flags", ["--verbose", "--no-verify", "--output-dir"]],
  // Should not match single dash
  [": -v, -h", "CLI flags", []],

  // Git refs
  [": main, master, HEAD", "Git refs", ["main", "master", "HEAD"]],
  // Should not match inside words
  [": maintain, headless", "Git refs", []],

  // Commit hashes
  [": a1b2c3d, 178a362e5f01", "Commit hashes", ["a1b2c3d", "178a362e5f01"]],
  // Should not match short strings
  [": abc123", "Commit hashes", []],
  // Should not match strings with uppercase
  [": A1B2C3D", "Commit hashes", []],

  // Function calls
  [": fetchData(), console.log(), Array.from()", "Function calls", ["fetchData()", "log()", "from()"]],

  // Packages
  [": express, react, docker, postgres", "Packages", ["express", "react", "docker", "postgres"]],
  [": @anthropic-ai/sdk, @types/node", "Packages", ["@anthropic-ai/sdk", "@types/node"]],

  // Versions
  [": v2.1.81, ^4.0.0, ~1.2.3", "Versions", ["v2.1.81", "^4.0.0", "~1.2.3"]],

  // Localhost/IPs
  [": localhost:3000, 192.168.1.1:8080", "Localhost/IPs", ["localhost:3000", "192.168.1.1:8080"]],
  [": 10.0.0.1", "Localhost/IPs", ["10.0.0.1"]],

  // Filenames with extensions
  [": index.js, app.tsx, package.json, README.md", "Filenames w/ ext", ["index.js", "app.tsx", "package.json", "README.md"]],
  [": config.yaml, setup.py, main.go, Cargo.toml", "Filenames w/ ext", ["config.yaml", "setup.py", "main.go", "Cargo.toml"]],
  // Bare extensions should NOT match
  [": .jsx, .ts, .json", "Filenames w/ ext", []],

  // Error codes
  [": ENOENT, ECONNREFUSED, SIGKILL, SIGTERM", "Error codes", ["ENOENT", "ECONNREFUSED", "SIGKILL", "SIGTERM"]],

  // HTTP methods
  [": GET, POST, PUT, DELETE, PATCH, OPTIONS", "HTTP methods", ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]],

  // Booleans
  [": true, false, null, undefined, NaN", "Booleans/nulls", ["true", "false", "null", "undefined", "NaN"]],

  // Type names
  [": string, number, Array, Promise, Record", "Type names", ["string", "number", "Array", "Promise", "Record"]],

  // Durations/sizes
  [": 30ms, 2.5s, 4KB, 500MB, 16px", "Durations/sizes", ["30ms", "2.5s", "4KB", "500MB", "16px"]],

  // Regex patterns
  [": /^test.*$/gi, /\\d+/", "Regex patterns", ["/^test.*$/gi", "/\\d+/"]],

  // Double-quoted strings
  ['say "hello world" now', "Double-quoted", ['"hello world"']],
  ['use "foo" and "bar"', "Double-quoted", ['"foo"', '"bar"']],
  // Should handle escaped quotes
  ['say "it\\"s fine"', "Double-quoted", ['"it\\"s fine"']],

  // Single-quoted strings
  ["use 'my_value' here", "Single-quoted", ["'my_value'"]],
  ["try 'foo' and 'bar'", "Single-quoted", ["'foo'", "'bar'"]],

  // Parenthesized text
  ["see (important note) here", "Parenthesized", ["(important note)"]],
  ["call (with args) now", "Parenthesized", ["(with args)"]],
  // Should not match empty parens
  ["fn()", "Parenthesized", []],

  // Bracketed text
  ["see [this section] for info", "Bracketed", ["[this section]"]],
  ["use [default] value", "Bracketed", ["[default]"]],

  // Curly-braced text
  ["returns {status: ok}", "Curly-braced", ["{status: ok}"]],
  ["set {name, age}", "Curly-braced", ["{name, age}"]],

  // JSX/Components
  ["render <App /> here", "JSX/Components", ["<App />"]],
  ["use <MyComponent> and </MyComponent>", "JSX/Components", ["<MyComponent>", "</MyComponent>"]],
  ["wrap in <Router.Provider>", "JSX/Components", ["<Router.Provider>"]],
  // Should NOT match HTML lowercase tags
  ["use <div> tag", "JSX/Components", []],

  // camelCase (3+ humps)
  ["call fetchUserData from getUserProfile", "camelCase (3+ parts)", ["fetchUserData", "getUserProfile"]],
  // 2-part camelCase should NOT match (too common)
  ["use myVar", "camelCase (3+ parts)", []],

  // snake_case
  ["set my_variable and max_retry_count", "snake_case", ["my_variable", "max_retry_count"]],
  // Single word should NOT match
  ["just hello", "snake_case", []],

  // PascalCase
  ["use SlideRenderer and TemplateCanvas", "PascalCase", ["SlideRenderer", "TemplateCanvas"]],
  // Single word should NOT match
  ["just Hello", "PascalCase", []],

  // Annotations
  ["TODO fix this, FIXME later, NOTE important", "Annotations", ["TODO", "FIXME", "NOTE"]],
  ["HACK around it, DEPRECATED now", "Annotations", ["HACK", "DEPRECATED"]],

  // Decimals
  [": 3.14, 99.99, 0.5", "Decimals", ["3.14", "99.99", "0.5"]],
];

// Run non-overlap single-pass algorithm (same as _CC_)
function singlePassMatch(input, pats) {
  const matches = [];
  for (let i = 0; i < pats.length; i++) {
    const re = new RegExp(pats[i].re.source, pats[i].re.flags);
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(input)) !== null) {
      const s = m.index, e = s + m[0].length;
      let ok = true;
      for (const p of matches) {
        if (s < p.e && e > p.s) { ok = false; break; }
      }
      if (ok) matches.push({ s, e, t: m[0], pat: pats[i].name, i });
    }
  }
  return matches;
}

// ── Run tests ──
let passed = 0, failed = 0;

for (const [input, patName, expected] of tests) {
  const pat = patterns.find(p => p.name === patName);
  if (!pat) {
    console.log(`  ✗ Unknown pattern: ${patName}`);
    failed++;
    continue;
  }

  const re = new RegExp(pat.re.source, pat.re.flags);
  re.lastIndex = 0;
  const actual = [...input.matchAll(re)].map(m => m[1]);

  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (pass) {
    passed++;
  } else {
    console.log(`  ✗ ${patName}`);
    console.log(`    Input:    ${JSON.stringify(input)}`);
    console.log(`    Expected: ${JSON.stringify(expected)}`);
    console.log(`    Actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ── Overlap test: verify single-pass prevents collisions ──
console.log("\n── Overlap tests ──");
const overlapTests = [
  // URL contains path-like segments — URL should win (earlier pattern)
  "see https://github.com/anthropics/claude-code for details",
  // Version inside a path — path should win
  "check ~/app/v2.1.0/config.json for settings",
  // Env var next to a flag
  "use $HOME with --verbose flag",
  // Error code followed by a boolean
  "got ENOENT, retry=true",
  // Extension inside a path — path wins
  "open ./src/index.ts now",
  // IP address with port (should not conflict with decimals)
  "connect to 192.168.1.1:8080",
];

let overlapPassed = 0;
for (const input of overlapTests) {
  const matches = singlePassMatch(input, patterns);
  // Check no overlaps
  const sorted = [...matches].sort((a, b) => a.s - b.s);
  let hasOverlap = false;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].s < sorted[i - 1].e) {
      console.log(`  ✗ Overlap in "${input}"`);
      console.log(`    "${sorted[i-1].t}" [${sorted[i-1].s}-${sorted[i-1].e}] vs "${sorted[i].t}" [${sorted[i].s}-${sorted[i].e}]`);
      hasOverlap = true;
      failed++;
    }
  }
  if (!hasOverlap) {
    overlapPassed++;
    // Show what matched
    const matchStr = sorted.map(m => `"${m.t}" (${m.pat})`).join(", ");
    console.log(`  ✓ "${input}" → ${matchStr}`);
  }
}

// ── ANSI immunity test (informational) ──
// _CC_ only receives clean text (no ANSI codes) since we removed
// the paragraph-level wrapper. These tests are informational only.
console.log("\n── ANSI immunity tests (informational — _CC_ never receives ANSI) ──");
const ansiTests = [
  "\x1b[38;2;40;220;90m",
  "\x1b[38;2;255;150;30m",
  "\x1b[1m\x1b[22m",
  "\x1b[39m",
  "\x1b[38;2;40;220;90mhello\x1b[39m",
];

for (const input of ansiTests) {
  const matches = singlePassMatch(input, patterns);
  if (matches.length === 0) {
    console.log(`  ✓ Clean: ${JSON.stringify(input)}`);
  } else {
    const matchStr = matches.map(m => `"${m.t}" (${m.pat})`).join(", ");
    console.log(`  ⚠ Would match (harmless): ${JSON.stringify(input)} → ${matchStr}`);
  }
  // Don't count these as failures
}

console.log(`\n${"═".repeat(50)}`);
console.log(`Results: ${passed + overlapPassed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
