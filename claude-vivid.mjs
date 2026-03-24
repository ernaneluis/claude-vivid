#!/usr/bin/env node
/**
 * claude-vivid — Rich syntax highlighting for Claude Code CLI
 * https://github.com/ernaneluis/claude-vivid
 *
 * Patches Claude Code's minified JS to add 30 regex-based color patterns,
 * vivid dark theme overrides, and markdown renderer enhancements.
 *
 * Usage:
 *   npx claude-vivid [--native | --npm] [--restore]
 *
 * Zero external dependencies — includes Bun SEA binary unpack/repack.
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import { resolve, join } from "path";
import { extractJS, repackJS } from "./lib/bun-sea.mjs";

// ── Configuration: Your custom colors ──────────────────────────────────────
// Only override the colors you want to change. Others keep their defaults.
const DARK_MODE_OVERRIDES = {
  // Core text — warm off-white, easy to read
  text: "rgb(220,225,240)",
  // Prompt border — vivid blue
  promptBorder: "rgb(60,160,255)",
  promptBorderShimmer: "rgb(100,190,255)",
  // User message bg — strong teal tint
  userMessageBackground: "rgb(15,55,60)",
  userMessageBackgroundHover: "rgb(25,70,75)",
  // Bash/shell output — rich purple tint
  bashMessageBackgroundColor: "rgb(50,20,60)",
  // Memory messages — deep ocean blue
  memoryBackgroundColor: "rgb(15,35,65)",
  // Message actions
  messageActionsBackground: "rgb(25,35,60)",
  // Vivid success/error/warning
  success: "rgb(50,230,100)",
  error: "rgb(255,90,110)",
  warning: "rgb(255,210,30)",
  // Subagent colors — FULL saturation, high brightness
  red_FOR_SUBAGENTS_ONLY: "rgb(255,70,70)",
  blue_FOR_SUBAGENTS_ONLY: "rgb(70,150,255)",
  green_FOR_SUBAGENTS_ONLY: "rgb(40,220,90)",
  yellow_FOR_SUBAGENTS_ONLY: "rgb(255,220,40)",
  purple_FOR_SUBAGENTS_ONLY: "rgb(190,100,255)",
  orange_FOR_SUBAGENTS_ONLY: "rgb(255,150,30)",
  pink_FOR_SUBAGENTS_ONLY: "rgb(255,90,170)",
  cyan_FOR_SUBAGENTS_ONLY: "rgb(30,220,240)",
  // Brief labels — punchy
  briefLabelYou: "rgb(50,220,240)",
  briefLabelClaude: "rgb(255,150,80)",
  // Inactive — brighter
  inactive: "rgb(180,185,200)",
  inactiveShimmer: "rgb(210,215,230)",
  // Suggestion — vivid blue-lavender
  suggestion: "rgb(140,170,255)",
  remember: "rgb(140,170,255)",
  // Plan mode — vivid teal
  planMode: "rgb(30,200,180)",
};

const DARK_COLORBLIND_OVERRIDES = {
  text: "rgb(192,202,245)",
  userMessageBackground: "rgb(20,50,55)",
  userMessageBackgroundHover: "rgb(30,60,65)",
  bashMessageBackgroundColor: "rgb(45,25,50)",
  memoryBackgroundColor: "rgb(20,40,60)",
  messageActionsBackground: "rgb(30,40,55)",
  briefLabelYou: "rgb(100,200,220)",
  inactive: "rgb(170,170,180)",
};

// ── Helpers ────────────────────────────────────────────────────────────────

function findNativeBinary() {
  // Find the Claude Code native binary
  const claudeVersionsDir = join(process.env.HOME, ".local", "share", "claude", "versions");
  try {
    const entries = execSync(`ls "${claudeVersionsDir}" 2>/dev/null`, { encoding: "utf8" }).trim().split("\n").filter(Boolean);
    if (entries.length > 0) {
      const latest = entries.sort().pop();
      const bin = join(claudeVersionsDir, latest);
      if (existsSync(bin)) return bin;
    }
  } catch {}
  // Try which claude
  try {
    const claudeBin = execSync("which claude 2>/dev/null", { encoding: "utf8" }).trim();
    if (claudeBin && existsSync(claudeBin)) return claudeBin;
  } catch {}
  return null;
}

function findNativeSource() {
  const home = process.env.HOME;
  const dataDir = join(home, ".claude-vivid");
  const freshJs = join(dataDir, "native-claudejs-fresh.js");
  if (existsSync(freshJs)) return freshJs;

  // Extract from native binary
  const nativeBin = findNativeBinary();
  if (nativeBin) {
    try {
      execSync(`mkdir -p "${dataDir}"`, { stdio: "ignore" });
      console.log(`Extracting JS from native binary: ${nativeBin}`);
      const js = extractJS(nativeBin);
      writeFileSync(freshJs, js);
      console.log(`Extracted to: ${freshJs}`);
      return freshJs;
    } catch (e) {
      console.error(`Extraction failed: ${e.message}`);
    }
  }
  return null;
}

function findNpmSource() {
  try {
    const root = execSync("npm root -g", { encoding: "utf8" }).trim();
    const cliJs = join(root, "@anthropic-ai", "claude-code", "cli.js");
    if (existsSync(cliJs)) return cliJs;
  } catch {}
  return null;
}

function applyOverrides(source, varName, overrides) {
  // Find the theme object: varName={...}
  const startMarker = `${varName}={autoAccept:`;
  const idx = source.indexOf(startMarker);
  if (idx === -1) {
    console.error(`  Could not find theme object: ${varName}`);
    return source;
  }

  // Find the end of this object
  let braceCount = 0;
  let objStart = source.indexOf("{", idx);
  let objEnd = objStart;
  for (let i = objStart; i < source.length; i++) {
    if (source[i] === "{") braceCount++;
    if (source[i] === "}") braceCount--;
    if (braceCount === 0) {
      objEnd = i + 1;
      break;
    }
  }

  let objStr = source.substring(objStart, objEnd);
  let changeCount = 0;

  for (const [key, newValue] of Object.entries(overrides)) {
    // Match key:"value" pattern (handles both rgb and ansi values, with or without spaces)
    const keyPattern = new RegExp(
      `(${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:)"([^"]*)"`,
    );
    const match = objStr.match(keyPattern);
    if (match) {
      const oldValue = match[2];
      if (oldValue !== newValue) {
        objStr = objStr.replace(keyPattern, `$1"${newValue}"`);
        changeCount++;
      }
    }
  }

  if (changeCount > 0) {
    source = source.substring(0, objStart) + objStr + source.substring(objEnd);
    console.log(`  ${varName}: ${changeCount} color(s) patched`);
  } else {
    console.log(`  ${varName}: no changes needed`);
  }

  return source;
}

// ── Theme variable discovery ───────────────────────────────────────────────

function discoverThemeVars(source) {
  // Find all variable assignments that contain autoAccept and bashBorder
  const pattern = /([A-Za-z0-9_$]+)=\{autoAccept:"[^"]+",bashBorder:"[^"]+"/g;
  const vars = [];
  let match;
  while ((match = pattern.exec(source)) !== null) {
    vars.push(match[1]);
  }
  return vars;
}

function identifyThemeType(source, varName) {
  const startMarker = `${varName}={autoAccept:`;
  const idx = source.indexOf(startMarker);
  if (idx === -1) return "unknown";

  // Extract a snippet to identify (needs ~600 chars to reach the text: key)
  const snippet = source.substring(idx, idx + 800);

  // Check if it's dark or light based on text color
  if (snippet.includes('text:"rgb(255,255,255)"') || snippet.includes('text:"ansi:whiteBright"')) {
    // Dark mode (white text on dark bg)
    if (snippet.includes('bashBorder:"rgb(51,153,255)"') || snippet.includes('bashBorder:"rgb(0,102,204)"')) {
      return "dark-colorblind";
    }
    if (snippet.includes('text:"ansi:whiteBright"')) {
      return "dark-ansi";
    }
    return "dark";
  }
  if (snippet.includes('text:"rgb(0,0,0)"') || snippet.includes('text:"ansi:black"')) {
    return "light";
  }
  return "unknown";
}

// ── Main ───────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const useNative = args.includes("--native");
const useNpm = args.includes("--npm");
const restore = args.includes("--restore");

let sourceFile;
let backupFile;

if (useNpm || (!useNative && !useNpm)) {
  // Default to native, fall back to npm
  sourceFile = findNativeSource();
  if (!sourceFile) sourceFile = findNpmSource();
} else if (useNative) {
  sourceFile = findNativeSource();
} else {
  sourceFile = findNpmSource();
}

if (!sourceFile) {
  console.error("Could not find Claude Code source. Install CC or unpack the native binary first.");
  process.exit(1);
}

backupFile = sourceFile + ".colorbackup";

if (restore) {
  if (existsSync(backupFile)) {
    copyFileSync(backupFile, sourceFile);
    console.log(`Restored from ${backupFile}`);

    // Repack if native
    if (sourceFile.includes("native-claudejs")) {
      const nativeBin = findNativeBinary();
      if (nativeBin) {
        console.log(`Repacking into: ${nativeBin}`);
        const restoredJS = readFileSync(sourceFile, "utf8");
        repackJS(nativeBin, restoredJS);
        console.log("Restored and repacked. Restart Claude Code.");
      } else {
        console.error("Could not find native binary to repack.");
      }
    }
  } else {
    console.error("No backup found to restore from.");
  }
  process.exit(0);
}

console.log(`\n🎨 claude-vivid — Rich syntax highlighting for Claude Code`);
console.log(`Source: ${sourceFile}\n`);

let source = readFileSync(sourceFile, "utf8");

// Create backup
if (!existsSync(backupFile)) {
  copyFileSync(sourceFile, backupFile);
  console.log(`Backup created: ${backupFile}\n`);
} else {
  // Restore from backup first so we patch a clean copy
  source = readFileSync(backupFile, "utf8");
  console.log(`Restoring clean copy from backup before patching\n`);
}

// Discover theme variables
const themeVars = discoverThemeVars(source);
console.log(`Found ${themeVars.length} theme objects: ${themeVars.join(", ")}\n`);

// Apply overrides to each theme
for (const varName of themeVars) {
  const type = identifyThemeType(source, varName);
  console.log(`Theme ${varName} → ${type}`);

  switch (type) {
    case "dark":
      source = applyOverrides(source, varName, DARK_MODE_OVERRIDES);
      break;
    case "dark-colorblind":
      source = applyOverrides(source, varName, DARK_COLORBLIND_OVERRIDES);
      break;
    case "dark-ansi":
      // ANSI themes use ansi: prefix, skip for now
      console.log("  Skipping ANSI theme (uses terminal colors)");
      break;
    case "light":
      console.log("  Skipping light theme (not modified)");
      break;
    default:
      console.log("  Skipping unknown theme type");
  }
}

// ── Patch 2: Markdown renderer colors ────────────────────────────────────
console.log("\n--- Markdown Renderer Patches ---\n");

let mdPatches = 0;

// Heading depth 1: vivid cyan
const h1Old = 'case"heading":switch(_.depth){case 1:return KT.bold.italic.underline((_.tokens??[]).map((O)=>mD(O,T,0,null,null,$)).join(""))+$J+$J';
const h1New = 'case"heading":switch(_.depth){case 1:return KT.rgb(30,220,240)(KT.bold.italic.underline((_.tokens??[]).map((O)=>mD(O,T,0,null,null,$)).join("")))+$J+$J';
if (source.includes(h1Old)) {
  source = source.replace(h1Old, h1New);
  console.log("  H1 headings: vivid cyan + bold italic underline");
  mdPatches++;
}

// Heading depth 2: bright blue, depth 3+: vivid purple
const h2Old = ';case 2:return KT.bold((_.tokens??[]).map((O)=>mD(O,T,0,null,null,$)).join(""))+$J+$J;default:return KT.bold((_.tokens??[]).map((O)=>mD(O,T,0,null,null,$)).join(""))+$J+$J}';
const h2New = ';case 2:return KT.rgb(70,150,255)(KT.bold((_.tokens??[]).map((O)=>mD(O,T,0,null,null,$)).join("")))+$J+$J;default:return KT.rgb(190,100,255)(KT.bold((_.tokens??[]).map((O)=>mD(O,T,0,null,null,$)).join("")))+$J+$J}';
if (source.includes(h2Old)) {
  source = source.replace(h2Old, h2New);
  console.log("  H2 headings: bright blue + bold");
  console.log("  H3+ headings: vivid purple + bold");
  mdPatches++;
}

// Strong/bold: bright warm white-gold
const strongOld = 'case"strong":return KT.bold((_.tokens??[]).map((O)=>mD(O,T,0,null,R,$)).join(""))';
const strongNew = 'case"strong":return KT.rgb(255,230,150)(KT.bold((_.tokens??[]).map((O)=>mD(O,T,0,null,R,$)).join("")))';
if (source.includes(strongOld)) {
  source = source.replace(strongOld, strongNew);
  console.log("  Bold text: warm gold (255,230,150)");
  mdPatches++;
}

// Italic/em: vivid teal
const emOld = 'case"em":return KT.italic((_.tokens??[]).map((O)=>mD(O,T,0,null,R,$)).join(""))';
const emNew = 'case"em":return KT.rgb(30,200,180)(KT.italic((_.tokens??[]).map((O)=>mD(O,T,0,null,R,$)).join("")))';
if (source.includes(emOld)) {
  source = source.replace(emOld, emNew);
  console.log("  Italic text: vivid teal (30,200,180)");
  mdPatches++;
}

// List bullet: bright green
const listOld = 'K===null?"-"';
const listNew = 'K===null?KT.rgb(40,220,90)("-")';
if (source.includes(listOld)) {
  source = source.replace(listOld, listNew);
  console.log("  List bullets: bright green (40,220,90)");
  mdPatches++;
}

// Blockquote: vivid teal bar
const bqOld = 'KT.dim(M76)';
const bqNew = 'KT.rgb(30,200,180)(M76)';
if (source.includes(bqOld)) {
  source = source.replace(bqOld, bqNew);
  console.log("  Blockquote bar: vivid teal (30,200,180)");
  mdPatches++;
}

// HR: colored unicode line
const hrOld = 'case"hr":return"---"';
const hrNew = 'case"hr":return KT.rgb(100,110,140)("───────────────────")';
if (source.includes(hrOld)) {
  source = source.replace(hrOld, hrNew);
  console.log("  Horizontal rule: muted blue-gray line");
  mdPatches++;
}

// Links: vivid blue + underline — ALWAYS colored, even without hyperlink support
const linkOld = 'function UX_(_,T,q){if(!(q?.supportsHyperlinks??tM()))return _;let R=T??_,$=KT.blue(R)';
const linkNew = 'function UX_(_,T,q){if(!(q?.supportsHyperlinks??tM()))return KT.rgb(70,150,255)(KT.underline(T??_));let R=T??_,$=KT.rgb(70,150,255)(KT.underline(R))';
if (source.includes(linkOld)) {
  source = source.replace(linkOld, linkNew);
  console.log("  Links: vivid blue (70,150,255) + underline (always colored)");
  mdPatches++;
}

console.log(`\n  Total markdown patches: ${mdPatches}`);

// ── Patch 2b: Output text colorizer (regex highlighting in response prose) ──
console.log("\n--- Output Text Colorizer Patches ---\n");

let outPatches = 0;

// Inject a colorizer function right after T97
const t97End = 'function BgK(_,T){switch(_)';
const colorizerFn = `function _CC_(_){try{let T=[
[/(https?:\\/\\/[^\\s,;)\\]>]+)/g,(m)=>KT.rgb(70,150,255)(KT.underline(m))],
[/((?:~\\/|\\.\\/|\\.\\.\\/)[\\/\\w.@-]+)/g,(m)=>KT.rgb(40,220,90)(m)],
[/(\\b[\\w-]+(?:\\/[\\w.@-]+){2,})/g,(m)=>KT.rgb(40,220,90)(m)],
[/(\\$[A-Z_][A-Z0-9_]*)/g,(m)=>KT.rgb(255,150,30)(m)],
[/(\\b0x[0-9a-fA-F]+\\b)/g,(m)=>KT.rgb(255,220,40)(m)],
[/(--[a-zA-Z][\\w-]*)/g,(m)=>KT.rgb(130,200,255)(m)],
[/(\\b(?:main|master|HEAD)\\b)/g,(m)=>KT.rgb(255,90,170)(KT.bold(m))],
[/(\\b[a-f0-9]{7,12}\\b)/g,(m)=>KT.rgb(255,120,180)(m)],
[/(\\b\\w+\\(\\))/g,(m)=>KT.rgb(220,180,100)(m)],
[/(@[\\w-]+\\/[\\w.-]+|\\b(?:express|react|vue|svelte|next|vite|webpack|typescript|eslint|prettier|jest|vitest|puppeteer|playwright|tailwind|prisma|drizzle|zod|chalk|lodash|axios|fastify|bun|deno|node|npm|npx|pnpm|yarn|docker|redis|postgres|mongodb|sqlite)\\b)/g,(m)=>KT.rgb(200,140,255)(m)],
[/(\\bv\\d+\\.\\d+(?:\\.\\d+)?\\b|[\\^~]\\d+\\.\\d+(?:\\.\\d+)?)/g,(m)=>KT.rgb(255,220,40)(m)],
[/(\\blocalhost:\\d+|\\b\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}(?::\\d+)?\\b)/g,(m)=>KT.rgb(100,180,255)(m)],
[/(\\b[\\w-]+\\.(?:jsx|tsx|ts|js|mjs|cjs|json|md|py|go|rs|rb|java|css|scss|html|yaml|yml|toml|sql|sh|bash|env|lock|log|txt|xml|svg|png|jpg|gif)\\b)/g,(m)=>KT.rgb(140,220,170)(m)],
[/(\\b(?:ENOENT|ECONNREFUSED|EACCES|EPERM|EEXIST|EISDIR|ENOTDIR|EADDRINUSE|ETIMEDOUT|ERR_MODULE_NOT_FOUND|ERR_REQUIRE_ESM|ENOMEM|SIGKILL|SIGTERM|SIGSEGV)\\b)/g,(m)=>KT.rgb(255,70,70)(KT.bold(m))],
[/(\\b(?:GET|POST|PUT|DELETE|PATCH|OPTIONS)\\b)/g,(m)=>{let c={GET:KT.rgb(40,220,90),POST:KT.rgb(255,180,60),PUT:KT.rgb(70,150,255),DELETE:KT.rgb(255,70,70),PATCH:KT.rgb(255,220,40),OPTIONS:KT.rgb(180,185,200)};return(c[m]||KT.rgb(180,185,200))(KT.bold(m))}],
[/(\\b(?:true|false|null|undefined|nil|NaN|Infinity)\\b)/g,(m)=>KT.rgb(190,100,255)(m)],
[/(\\b(?:string|number|boolean|bigint|symbol|void|any|never|unknown|Array|Object|Map|Set|Promise|Record|Partial|Required|Readonly)\\b)/g,(m)=>KT.rgb(30,200,180)(m)],
[/(\\b\\d+(?:\\.\\d+)?\\s*(?:ms|[smhd]|fps|KB|MB|GB|TB|px|rem|em|vh|vw|%|kB|sec|min|hr)\\b)/g,(m)=>KT.rgb(255,220,40)(m)],
[/(\\/[^\\/\\s]{2,}\\/[gimsuy]*)/g,(m)=>KT.rgb(255,220,40)(KT.dim(m))],
[/("(?:[^"\\\\\\\\]|\\\\\\\\.){1,80}")/g,(m)=>KT.rgb(150,220,130)(m)],
[/('(?:[^'\\\\\\\\]|\\\\\\\\.){1,80}')/g,(m)=>KT.rgb(150,220,130)(m)],
[/(\\([^()]{1,60}\\))/g,(m)=>KT.rgb(180,190,210)(m)],
[/(\\[[^\\[\\]]{1,60}\\])/g,(m)=>KT.rgb(130,185,230)(m)],
[/(\\{[^{}]{1,60}\\})/g,(m)=>KT.rgb(220,175,130)(m)],
[/(<[A-Z][\\w.]*\\s*\\/?>|<\\/[A-Z][\\w.]*>)/g,(m)=>KT.rgb(80,200,220)(m)],
[/(\\b[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*){2,}\\b)/g,(m)=>KT.rgb(180,200,140)(m)],
[/(\\b[a-z]+(?:_[a-z0-9]+)+\\b)/g,(m)=>KT.rgb(170,190,160)(m)],
[/(\\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\\b)/g,(m)=>KT.rgb(200,180,220)(m)],
[/(\\b(?:TODO|FIXME|HACK|NOTE|WARNING|DEPRECATED|IMPORTANT|BUG|XXX|REVIEW)\\b)/g,(m)=>KT.rgb(255,180,40)(KT.bold(m))],
[/(\\b\\d+\\.\\d+\\b)/g,(m)=>KT.rgb(255,220,40)(m)]
];let M=[];for(let i=0;i<T.length;i++){let[q,K]=T[i];q.lastIndex=0;let R;while((R=q.exec(_))!==null){let s=R.index,e=s+R[0].length,ok=true;for(let p of M){if(s<p.e&&e>p.s){ok=false;break}}if(ok)M.push({s,e,f:K,t:R[0],i})}}M.sort((a,b)=>b.s-a.s);for(let p of M)_=_.slice(0,p.s)+p.f(p.t)+_.slice(p.e);return _}catch{return _}}` + t97End;

if (source.includes(t97End)) {
  source = source.replace(t97End, colorizerFn);
  console.log("  Injected _CC_ colorizer function (30 patterns)");
  outPatches++;
}

// Wrap the final T97(_.text) return in the text case with colorizer
const textRetOld = 'return T97(_.text);case"table"';
const textRetNew = 'return _CC_(T97(_.text));case"table"';
if (source.includes(textRetOld)) {
  source = source.replace(textRetOld, textRetNew);
  console.log("  Wrapped text case return with _CC_ colorizer");
  outPatches++;
}

// Also wrap the text inside list items
const listTextOld = '_.tokens?_.tokens.map((O)=>mD(O,T,q,K,_,$)).join(""):T97(_.text)}';
const listTextNew = '_.tokens?_.tokens.map((O)=>mD(O,T,q,K,_,$)).join(""):_CC_(T97(_.text))}';
if (source.includes(listTextOld)) {
  source = source.replace(listTextOld, listTextNew);
  console.log("  Wrapped list item text with _CC_ colorizer");
  outPatches++;
}

// Also wrap codespan (backtick content) with _CC_
const codespanOld = 'case"codespan":return v8("permission",T)(_.text)';
const codespanNew = 'case"codespan":return v8("permission",T)(_CC_(_.text))';
if (source.includes(codespanOld)) {
  source = source.replace(codespanOld, codespanNew);
  console.log("  Wrapped codespan (backtick) content with _CC_ colorizer");
  outPatches++;
} else {
  console.log("  Could not find codespan target");
}


console.log(`\n  Output colorizer: 30 patterns (single-pass, non-overlapping)`);
console.log(`  Total output patches: ${outPatches}`);

// ── Patch 3: Input pattern highlighters ──────────────────────────────────
console.log("\n--- Input Pattern Highlighter Patches ---\n");

let inputPatches = 0;

// Replace the empty e7 memo with a regex-based highlighter
const e7Old = 'e7=d6.useMemo(()=>[],[W8])';
const e7New = `e7=d6.useMemo(()=>{let _P=[
{r:/(~\\/|\\.\\/|\\.\\.\\/)\\S+|\\b[\\w-]+(?:\\/[\\w.-]+)+\\.\\w+\\b/g,c:"green_FOR_SUBAGENTS_ONLY"},
{r:/(?:^|\\s)\\/[a-zA-Z][a-zA-Z0-9_:-]*/g,c:"yellow_FOR_SUBAGENTS_ONLY"},
{r:/https?:\\/\\/\\S+/g,c:"blue_FOR_SUBAGENTS_ONLY"},
{r:/\`[^\`]+\`/g,c:"purple_FOR_SUBAGENTS_ONLY"},
{r:/\\$[A-Z_][A-Z0-9_]*/g,c:"orange_FOR_SUBAGENTS_ONLY"},
{r:/\\b0x[0-9a-fA-F]+\\b|\\b\\d+\\.\\d+\\b/g,c:"yellow_FOR_SUBAGENTS_ONLY"},
{r:/"[^"]{1,80}"|'[^']{1,80}'/g,c:"green_FOR_SUBAGENTS_ONLY"},
{r:/\\s--?[a-zA-Z][a-zA-Z0-9-]*/g,c:"cyan_FOR_SUBAGENTS_ONLY"},
{r:/\\b(?:main|master|HEAD|origin\\/\\S+)\\b|\\b[a-f0-9]{7,40}\\b/g,c:"pink_FOR_SUBAGENTS_ONLY"}
],_R=[];for(let _p of _P){let _m;_p.r.lastIndex=0;while((_m=_p.r.exec(W8))!==null){let _s=_m.index,_e=_s+_m[0].length;_R.push({start:_s,end:_e,themeColor:_p.c})}}return _R},[W8])`;

if (source.includes(e7Old)) {
  source = source.replace(e7Old, e7New);
  console.log("  Replaced empty e7 memo with regex pattern highlighter");
  console.log("    - File paths (green)");
  console.log("    - Slash commands (yellow)");
  console.log("    - URLs (blue)");
  console.log("    - Backtick code (purple)");
  console.log("    - Env variables (orange)");
  console.log("    - Numbers/hex (yellow)");
  console.log("    - Quoted strings (green)");
  console.log("    - CLI flags (cyan)");
  console.log("    - Git refs (pink)");
  inputPatches++;
} else {
  console.log("  Could not find e7 empty memo target");
}

// Update the jK accumulator to use themeColor from e7 instead of hardcoded "suggestion"
const e7UsageOld = 'for(let G8 of e7)LT.push({start:G8.start,end:G8.end,color:"suggestion",priority:5})';
const e7UsageNew = 'for(let G8 of e7)LT.push({start:G8.start,end:G8.end,color:G8.themeColor||"suggestion",priority:5})';

if (source.includes(e7UsageOld)) {
  source = source.replace(e7UsageOld, e7UsageNew);
  console.log("  Updated jK to use per-pattern themeColor");
  inputPatches++;
} else {
  console.log("  Could not find e7 usage in jK");
}

console.log(`\n  Total input patches: ${inputPatches}`);

// Write patched source
writeFileSync(sourceFile, source);
console.log(`\nPatched source written to: ${sourceFile}`);

// Repack if this is the native binary
if (sourceFile.includes("native-claudejs")) {
  const nativeBin = findNativeBinary();
  if (nativeBin) {
    console.log(`\nRepacking into native binary: ${nativeBin}`);
    try {
      repackJS(nativeBin, source);
      console.log("\nDone! Restart Claude Code to see the new colors.");
    } catch (e) {
      console.error(`Repack failed: ${e.message}`);
    }
  } else {
    console.log("\nCould not find native binary. Patched source saved.");
  }
} else {
  console.log("\nDone! Restart Claude Code to see the new colors.");
}
