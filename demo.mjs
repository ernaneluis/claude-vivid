#!/usr/bin/env node
/**
 * demo.mjs — Print a showcase block of all claude-vivid color patterns.
 * Run: node demo.mjs
 * Take a screenshot of the output for the README.
 */

// Minimal chalk-like ANSI helper
const esc = (r, g, b) => `\x1b[38;2;${r};${g};${b}m`;
const RST = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const ITALIC = "\x1b[3m";
const UNDERLINE = "\x1b[4m";

const c = (r, g, b) => (s) => `${esc(r, g, b)}${s}${RST}`;
const cb = (r, g, b) => (s) => `${BOLD}${esc(r, g, b)}${s}${RST}`;
const cu = (r, g, b) => (s) => `${UNDERLINE}${esc(r, g, b)}${s}${RST}`;
const cd = (r, g, b) => (s) => `${DIM}${esc(r, g, b)}${s}${RST}`;

// Pattern colors (matching _CC_ in claude-vivid.mjs)
const url       = cu(70, 150, 255);
const filePfx   = c(40, 220, 90);
const fileSeg   = c(40, 220, 90);
const envVar    = c(255, 150, 30);
const hex       = c(255, 220, 40);
const flag      = c(130, 200, 255);
const gitRef    = cb(255, 90, 170);
const commitHash= c(255, 120, 180);
const funcCall  = c(220, 180, 100);
const pkg       = c(200, 140, 255);
const version   = c(255, 220, 40);
const localhost  = c(100, 180, 255);
const filename  = c(140, 220, 170);
const errCode   = cb(255, 70, 70);
const httpGet   = cb(60, 200, 120);
const httpPost  = cb(255, 170, 40);
const httpDel   = cb(255, 70, 70);
const boolNull  = c(190, 100, 255);
const typeName  = c(30, 200, 180);
const duration  = c(255, 220, 40);
const regex     = cd(255, 220, 40);
const dblQuote  = c(150, 220, 130);
const sglQuote  = c(150, 220, 130);
const paren     = c(180, 190, 210);
const bracket   = c(130, 185, 230);
const curly     = c(220, 175, 130);
const jsx       = c(80, 200, 220);
const camel     = c(180, 200, 140);
const snake     = c(170, 190, 160);
const pascal    = c(200, 180, 220);
const todo      = cb(255, 180, 40);
const decimal   = c(255, 220, 40);

// Heading colors
const h1 = (s) => `${BOLD}${ITALIC}${UNDERLINE}${esc(30, 220, 240)}${s}${RST}`;
const h2 = (s) => `${BOLD}${esc(70, 150, 255)}${s}${RST}`;
const h3 = (s) => `${BOLD}${esc(190, 100, 255)}${s}${RST}`;
const strong = (s) => `${BOLD}${esc(220, 180, 100)}${s}${RST}`;
const em = (s) => `${ITALIC}${esc(30, 200, 180)}${s}${RST}`;
const bullet = c(40, 220, 90);
const blockbar = c(30, 200, 180);
const text = c(220, 225, 240);
const promptBorder = c(60, 160, 255);

// ── Build the showcase ──

const W = 72;
const line = promptBorder("─".repeat(W));
const thinLine = `${esc(60, 80, 100)}${"─".repeat(W)}${RST}`;

const lines = [
  "",
  line,
  h1("  claude-vivid — Syntax Highlighting Demo"),
  line,
  "",
  h2("  URLs & Paths"),
  `  Clone from ${url("https://github.com/ernaneluis/claude-vivid")}`,
  `  Edit ${filePfx("~/src/components/App.tsx")} or ${filePfx("./config.json")}`,
  `  Check ${fileSeg("src/lib/utils/helpers.ts")} for the implementation`,
  `  Open ${filename("package.json")} and ${filename("tsconfig.json")}`,
  "",
  h2("  Environment & Configuration"),
  `  Set ${envVar("$NODE_ENV")} to ${dblQuote('"production"')} and ${envVar("$PORT")} to ${decimal("3000")}`,
  `  Run with ${flag("--verbose")} ${flag("--no-cache")} ${flag("--output-format")} json`,
  `  Using hex color ${hex("0xFF6B2E")} for the accent`,
  "",
  h2("  Git & Versions"),
  `  Merge ${gitRef("main")} into feature branch at commit ${commitHash("a1b2c3d")}`,
  `  Upgraded from ${version("v2.0.1")} to ${version("v2.1.81")} ${paren("(breaking change)")}`,
  `  Reset to ${gitRef("HEAD")}~3 on ${gitRef("master")}`,
  "",
  h2("  Code Patterns"),
  `  Call ${funcCall("fetchUserData()")} which returns ${typeName("Promise")}<${typeName("Array")}<${typeName("User")}>>`,
  `  The ${camel("handleFormSubmit")} handler validates ${typeName("string")} | ${typeName("number")}`,
  `  Check ${pascal("SlideRenderer")} and ${pascal("PropertiesPanel")} components`,
  `  Set ${snake("max_retry_count")} = ${decimal("3.14")} if ${boolNull("null")} or ${boolNull("undefined")}`,
  `  Render ${jsx("<App />")} with ${jsx("<MyComponent>")} inside ${jsx("</Layout>")}`,
  `  Match with ${regex("/^test.*$/gi")} pattern`,
  "",
  h2("  Packages & Network"),
  `  Install ${pkg("@anthropic-ai/sdk")} and ${pkg("express")}`,
  `  ${httpGet("GET")} ${localhost("localhost:3000")}/api  ${httpPost("POST")} /users  ${httpDel("DELETE")} /sessions`,
  `  Connect to ${localhost("192.168.1.1:8080")} ${paren("(timeout 30ms)")}`,
  `  Response: ${curly("{status: 200}")} in ${duration("45ms")}, payload ${duration("2.4KB")}`,
  "",
  h2("  Status & Annotations"),
  `  ${errCode("ENOENT")}: file not found, ${errCode("ECONNREFUSED")}: server down`,
  `  ${errCode("SIGKILL")} received — process terminated with ${boolNull("false")} exit`,
  `  ${todo("TODO")}: refactor this  ${todo("FIXME")}: race condition  ${todo("HACK")}: temp workaround`,
  "",
  h3("  Strings & Delimiters"),
  `  Message: ${dblQuote('"Hello, world!"')} or ${sglQuote("'my_config_value'")}`,
  `  See ${bracket("[this section]")} and ${curly("{options: true}")} for details`,
  `  Note ${paren("(important: read carefully)")} before proceeding`,
  "",
  thinLine,
  `  ${strong("30 patterns")} ${bullet("*")} ${em("single-pass matching")} ${bullet("*")} ${text("zero dependencies")}`,
  thinLine,
  "",
];

console.log(lines.join("\n"));
