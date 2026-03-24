/**
 * bun-sea.mjs — Extract and repack JS from Bun single-executable binaries.
 * Zero external dependencies. Supports macOS (Mach-O) and Linux (ELF overlay).
 *
 * Bun SEA format:
 *   [binary][__BUN section: [u64 size][data blob: strings + modules + offsets + trailer]]
 *   Trailer = "\n---- Bun! ----\n" (16 bytes)
 *   Offsets struct = 32 bytes before trailer
 *   Module struct = 52 bytes each (Bun >= 1.3.7) or 36 bytes (older)
 */

import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";

const BUN_TRAILER = Buffer.from("\n---- Bun! ----\n");
const SIZEOF_OFFSETS = 32;
const SIZEOF_MODULE_NEW = 52;
const SIZEOF_MODULE_OLD = 36;

// ── Mach-O constants ──
const MH_MAGIC_64 = 0xfeedfacf;
const MH_CIGAM_64 = 0xcffaedfe;
const LC_SEGMENT_64 = 0x19;

function readU32(buf, off, le) { return le ? buf.readUInt32LE(off) : buf.readUInt32BE(off); }
function readU64(buf, off, le) {
  // Read as two u32s to avoid BigInt
  const lo = le ? buf.readUInt32LE(off) : buf.readUInt32BE(off + 4);
  const hi = le ? buf.readUInt32LE(off + 4) : buf.readUInt32BE(off);
  return hi * 0x100000000 + lo;
}
function writeU32(buf, off, val, le) { le ? buf.writeUInt32LE(val, off) : buf.writeUInt32BE(val, off); }
function writeU64(buf, off, val, le) {
  const lo = val & 0xFFFFFFFF;
  const hi = (val - lo) / 0x100000000;
  if (le) { buf.writeUInt32LE(lo, off); buf.writeUInt32LE(hi, off + 4); }
  else { buf.writeUInt32BE(hi, off); buf.writeUInt32BE(lo, off + 4); }
}

/**
 * Find the __BUN section in a Mach-O binary.
 * Returns { segCmdOffset, sectOffset, fileoff, filesize } or null.
 */
function findBunSection(buf) {
  const magic = buf.readUInt32LE(0);
  let le;
  if (magic === MH_MAGIC_64) le = true;
  else if (magic === MH_CIGAM_64) le = false;
  else return null; // Not Mach-O 64

  const ncmds = readU32(buf, 16, le);
  let off = 32; // sizeof(mach_header_64)

  for (let i = 0; i < ncmds; i++) {
    const cmd = readU32(buf, off, le);
    const cmdsize = readU32(buf, off + 4, le);

    if (cmd === LC_SEGMENT_64) {
      const segname = buf.toString("ascii", off + 8, off + 24).replace(/\0+$/, "");
      if (segname === "__BUN") {
        // Segment: off+8=segname, off+24=vmaddr(8), off+32=vmsize(8), off+40=fileoff(8), off+48=filesize(8), ...
        const fileoff = readU64(buf, off + 40, le);
        const filesize = readU64(buf, off + 48, le);
        // Section header starts at off+72 (after segment fields)
        const sectOffset = off + 72;
        return { segCmdOffset: off, sectOffset, fileoff, filesize, le };
      }
    }
    off += cmdsize;
  }
  return null;
}

/**
 * Find the Bun data blob in the binary (works for both Mach-O and ELF overlay).
 * Returns { blobStart, blobEnd, blobData, sectionInfo }
 */
function findBunBlob(buf) {
  // Try Mach-O first
  const sect = findBunSection(buf);
  if (sect) {
    // Bun >= 1.3.4: first 8 bytes of section data is u64 size
    const sizeHeaderOff = sect.fileoff;
    const dataSize = readU64(buf, sizeHeaderOff, true); // always LE for blob data
    const blobStart = sizeHeaderOff + 8;
    const blobEnd = blobStart + dataSize;
    return { blobStart, blobEnd, blobData: buf.subarray(blobStart, blobEnd), sectionInfo: sect };
  }

  // Fallback: search for trailer (works for ELF overlay too)
  const trailerIdx = buf.lastIndexOf(BUN_TRAILER);
  if (trailerIdx === -1) throw new Error("Could not find Bun trailer in binary");

  // Walk backwards to find blob start — for ELF, the blob is appended after the ELF
  // We don't know the exact start, but we can use the offsets struct
  const offsetsStart = trailerIdx - SIZEOF_OFFSETS;
  const byteCount = readU64(buf, offsetsStart, true);
  const blobStart = trailerIdx + BUN_TRAILER.length - byteCount - SIZEOF_OFFSETS - BUN_TRAILER.length;
  const blobEnd = trailerIdx + BUN_TRAILER.length;
  return { blobStart, blobEnd, blobData: buf.subarray(blobStart, blobEnd), sectionInfo: null };
}

/**
 * Parse modules from the Bun data blob.
 */
function parseModules(blob) {
  const trailerIdx = blob.lastIndexOf(BUN_TRAILER);
  if (trailerIdx === -1) throw new Error("No trailer found in blob");

  const offsetsStart = trailerIdx - SIZEOF_OFFSETS;
  const byteCount = readU64(blob, offsetsStart, true);
  const modulesOff = blob.readUInt32LE(offsetsStart + 8);
  const modulesLen = blob.readUInt32LE(offsetsStart + 12);
  const entryPointId = blob.readUInt32LE(offsetsStart + 16);
  const compileExecArgvOff = blob.readUInt32LE(offsetsStart + 20);
  const compileExecArgvLen = blob.readUInt32LE(offsetsStart + 24);
  const flags = blob.readUInt32LE(offsetsStart + 28);

  // Detect module struct size: try 52 (new) and 36 (old)
  let moduleSize = SIZEOF_MODULE_NEW;
  let moduleCount = modulesLen / moduleSize;
  if (moduleCount !== Math.floor(moduleCount)) {
    moduleSize = SIZEOF_MODULE_OLD;
    moduleCount = modulesLen / moduleSize;
  }
  moduleCount = Math.floor(moduleCount);

  const modules = [];
  for (let i = 0; i < moduleCount; i++) {
    const base = modulesOff + i * moduleSize;
    const nameOff = blob.readUInt32LE(base);
    const nameLen = blob.readUInt32LE(base + 4);
    const contentsOff = blob.readUInt32LE(base + 8);
    const contentsLen = blob.readUInt32LE(base + 12);
    const sourcemapOff = blob.readUInt32LE(base + 16);
    const sourcemapLen = blob.readUInt32LE(base + 20);
    const bytecodeOff = blob.readUInt32LE(base + 24);
    const bytecodeLen = blob.readUInt32LE(base + 28);

    const name = blob.toString("utf8", nameOff, nameOff + nameLen);
    modules.push({
      index: i, name, moduleBase: base, moduleSize,
      nameOff, nameLen, contentsOff, contentsLen,
      sourcemapOff, sourcemapLen, bytecodeOff, bytecodeLen,
    });
  }

  return {
    modules, entryPointId, flags, byteCount,
    modulesOff, modulesLen, moduleSize,
    compileExecArgvOff, compileExecArgvLen,
    trailerIdx, offsetsStart,
  };
}

/**
 * Extract the main JS source from a Claude Code binary.
 * @param {string} binaryPath - Path to the Claude Code binary
 * @returns {string} The extracted JS source code
 */
export function extractJS(binaryPath) {
  const buf = readFileSync(binaryPath);
  const { blobData } = findBunBlob(buf);
  const info = parseModules(blobData);

  // Find the entry point module (cli.js)
  const entry = info.modules[info.entryPointId];
  if (!entry) throw new Error("Could not find entry point module");

  const js = blobData.toString("utf8", entry.contentsOff, entry.contentsOff + entry.contentsLen);
  return js;
}

/**
 * Repack modified JS into the Claude Code binary.
 * @param {string} binaryPath - Path to the Claude Code binary
 * @param {string} newJS - The modified JS source code
 */
export function repackJS(binaryPath, newJS) {
  const buf = readFileSync(binaryPath);
  const { blobStart, blobData, sectionInfo } = findBunBlob(buf);
  const info = parseModules(blobData);
  const entry = info.modules[info.entryPointId];
  if (!entry) throw new Error("Could not find entry point module");

  const newJSBuf = Buffer.from(newJS, "utf8");
  const oldContentsLen = entry.contentsLen;
  const sizeDiff = newJSBuf.length - oldContentsLen;

  // Build new blob: replace cli.js contents, zero out bytecode
  // Strategy: copy blob up to cli.js contents, insert new JS, copy rest, fix offsets

  // Collect all data regions that need adjustment
  const oldBlob = blobData;
  const contentsStart = entry.contentsOff;
  const contentsEnd = contentsStart + oldContentsLen;

  // New blob = [before contents][new JS][after contents adjusted]
  const beforeContents = oldBlob.subarray(0, contentsStart);
  const afterContents = oldBlob.subarray(contentsEnd);

  const newBlob = Buffer.concat([beforeContents, newJSBuf, afterContents]);

  // Fix all offsets in module structs that point past the old contents.
  // Module structs themselves may have shifted in newBlob if they were past contentsStart.
  for (const mod of info.modules) {
    const oldBase = mod.moduleBase;
    const base = oldBase > contentsStart ? oldBase + sizeDiff : oldBase;
    // For each StringPointer field, if its offset > contentsStart, adjust by sizeDiff
    const fields = [
      [0, 4],   // name
      [8, 12],  // contents
      [16, 20], // sourcemap
      [24, 28], // bytecode
    ];
    if (mod.moduleSize === SIZEOF_MODULE_NEW) {
      fields.push([32, 36]); // moduleInfo
      fields.push([40, 44]); // bytecodeOriginPath
    }

    for (const [offField] of fields) {
      const ptr = newBlob.readUInt32LE(base + offField);
      if (ptr > contentsStart) {
        newBlob.writeUInt32LE(ptr + sizeDiff, base + offField);
      }
    }

    // Zero out bytecode for the entry module (it won't match the modified JS)
    if (mod.index === info.entryPointId) {
      newBlob.writeUInt32LE(newJSBuf.length, base + 12); // contentsLen = new size
      newBlob.writeUInt32LE(0, base + 24); // bytecodeOff = 0
      newBlob.writeUInt32LE(0, base + 28); // bytecodeLen = 0
    }
  }

  // Fix offsets struct — it also shifted if past contentsStart
  const newTrailerIdx = newBlob.lastIndexOf(BUN_TRAILER);
  const newOffsetsStart = newTrailerIdx - SIZEOF_OFFSETS;

  // Fix modulesOff if it moved
  const oldModulesOff = newBlob.readUInt32LE(newOffsetsStart + 8);
  if (info.modulesOff > contentsStart) {
    newBlob.writeUInt32LE(oldModulesOff + sizeDiff, newOffsetsStart + 8);
  }
  // Fix compileExecArgv offset
  const oldExecOff = newBlob.readUInt32LE(newOffsetsStart + 20);
  if (info.compileExecArgvOff > contentsStart) {
    newBlob.writeUInt32LE(oldExecOff + sizeDiff, newOffsetsStart + 20);
  }
  // Fix byteCount
  writeU64(newBlob, newOffsetsStart, info.byteCount + sizeDiff, true);

  // Reconstruct the full binary
  const beforeBlob = buf.subarray(0, blobStart);
  const afterBlob = buf.subarray(blobStart + oldBlob.length);

  // Update u64 size header (8 bytes before blob)
  const sizeHeader = Buffer.alloc(8);
  writeU64(sizeHeader, 0, newBlob.length, true);

  // Update Mach-O segment/section sizes if applicable
  if (sectionInfo) {
    const { segCmdOffset, sectOffset, le } = sectionInfo;
    const newSectionSize = 8 + newBlob.length; // size header + blob

    // Segment vmsize (off+32) and filesize (off+48)
    writeU64(beforeBlob, segCmdOffset + 32, newSectionSize, le); // vmsize
    writeU64(beforeBlob, segCmdOffset + 48, newSectionSize, le); // filesize

    // Section size at sectOffset+32 (sect64: off+0=sectname, +16=segname, +32=addr(8), +40=size(8))
    writeU64(beforeBlob, sectOffset + 40, newSectionSize, le);

    // Write u64 size header in place
    writeU64(beforeBlob, sectionInfo.fileoff, newBlob.length, true);
  }

  const newBinary = Buffer.concat([
    beforeBlob,
    sectionInfo ? Buffer.alloc(0) : sizeHeader, // Mach-O: already updated in header
    newBlob,
    afterBlob,
  ]);

  writeFileSync(binaryPath, newBinary);

  // Re-sign on macOS (adhoc)
  try {
    execSync(`codesign --force --sign - "${binaryPath}" 2>/dev/null`, { stdio: "ignore" });
  } catch {
    // Not macOS or codesign not available — that's fine
  }
}
