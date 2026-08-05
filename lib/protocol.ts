// Protocol parser for biometric device HTTP push communication
// Devices use custom HTTP headers for protocol fields, with optional binary data after JSON body

export interface ParsedBody {
  json: Record<string, any> | null;
  binaries: Buffer[];
}

/**
 * Parse request body into JSON and binary parts.
 * Device protocol: JSON payload followed by optional binary data concatenated.
 * Respects string boundaries and escape sequences when locating JSON end.
 *
 * AMBIGUO: When multiple binary blocks are referenced (BIN_1, BIN_2, etc) but not
 * delimited in the body, returns entire binary data as binaries[0]. Parsing multiple
 * distinct binaries requires explicit size hints in JSON or known command structure.
 */
export function parseBody(buf: Buffer): ParsedBody {
  if (buf.length === 0) {
    return { json: null, binaries: [] };
  }

  // A body starting with `{` is the flat shape: JSON followed by raw binary.
  // Our simulator, the e2e suite and hand-rolled curl calls all use it.
  if (buf[0] === 0x7b) {
    return parseFlatBody(buf);
  }

  const blocks = readLengthPrefixedBlocks(buf);
  if (!blocks || blocks.length === 0) {
    // Not the block shape after all — try to read it flat before giving up.
    return parseFlatBody(buf);
  }

  let json: Record<string, any> | null = null;
  try {
    json = JSON.parse(stripTrailingNul(blocks[0]).toString("utf-8"));
  } catch {
    return { json: null, binaries: [] };
  }

  return { json, binaries: blocks.slice(1) };
}

/**
 * Real devices frame the body as a sequence of length-prefixed blocks, each
 * prefix a little-endian uint32. Block 0 is the NUL-terminated JSON; the blocks
 * after it are the `BIN_1`, `BIN_2`… the JSON refers to. Verified against
 * firmware WS535BW1_BSCS_v1.5.31:
 *
 *   41 00 00 00                                            (65)
 *   {"user_id_count":3,"one_user_id_size":8,
 *    "user_id_array":"BIN_1"} 00                            64 bytes + NUL
 *   18 00 00 00                                            (24)
 *   01 00 00 00 01 01 08 00  …                              3 users x 8 bytes
 *
 * Returns null when the framing does not hold, so callers can fall back.
 */
function readLengthPrefixedBlocks(buf: Buffer): Buffer[] | null {
  const blocks: Buffer[] = [];
  let offset = 0;

  while (offset + 4 <= buf.length) {
    const len = buf.readUInt32LE(offset);
    offset += 4;

    if (len === 0 || offset + len > buf.length) return null;
    blocks.push(buf.subarray(offset, offset + len));
    offset += len;

    // Trailing padding after the last block is fine; anything longer than a
    // stray byte or two means we misread the framing.
    const left = buf.length - offset;
    if (left > 0 && left < 4) {
      if (!isPadding(buf.subarray(offset))) return null;
      break;
    }
  }

  return blocks.length > 0 ? blocks : null;
}

/** JSON at byte 0, optional binary appended directly after the closing brace. */
function parseFlatBody(buf: Buffer): ParsedBody {
  const jsonEnd = findJsonEnd(buf);
  if (jsonEnd === -1) {
    return { json: null, binaries: [] };
  }

  let json: Record<string, any> | null = null;
  try {
    json = JSON.parse(buf.subarray(0, jsonEnd).toString("utf-8"));
  } catch {
    return { json: null, binaries: [] };
  }

  const binaries: Buffer[] = [];
  const trailing = buf.subarray(jsonEnd);
  if (trailing.length > 0 && !isPadding(trailing)) {
    binaries.push(trailing);
  }

  return { json, binaries };
}

function stripTrailingNul(buf: Buffer): Buffer {
  let end = buf.length;
  while (end > 0 && buf[end - 1] === 0x00) end--;
  return buf.subarray(0, end);
}

/**
 * Trailing NUL / CR / LF / space the firmware pads bodies with. Treating it as
 * a binary block would store a couple of junk bytes as a fingerprint or photo.
 */
function isPadding(buf: Buffer): boolean {
  for (const b of buf) {
    if (b !== 0x00 && b !== 0x0a && b !== 0x0d && b !== 0x20) return false;
  }
  return true;
}

/**
 * Find the end position of valid JSON in a buffer.
 * Handles escaped characters and strings correctly.
 * Returns the position immediately after the closing brace, or -1 if not found.
 */
function findJsonEnd(buf: Buffer): number {
  let braceDepth = 0;
  let bracketDepth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < buf.length; i++) {
    const char = String.fromCharCode(buf[i]);

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === "\\") {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      braceDepth++;
    } else if (char === "}") {
      braceDepth--;
      if (braceDepth === 0) {
        return i + 1;
      }
    } else if (char === "[") {
      bracketDepth++;
    } else if (char === "]") {
      bracketDepth--;
    }
  }

  return -1;
}

export interface ResponseOptions {
  responseCode: "OK" | "ERROR" | "RESET_FK";
  transId?: string | number;
  cmdCode?: string;
  bodyJson?: Record<string, any> | null;
  binary?: Buffer | null;
}

/**
 * Build HTTP response with protocol headers and body.
 * Returns headers object and concatenated body (JSON + binary).
 */
export function buildResponse(opts: ResponseOptions) {
  const headers: Record<string, string> = {
    "response_code": opts.responseCode,
    "Content-Type": "application/octet-stream",
  };

  let body = Buffer.alloc(0);

  if (opts.responseCode === "RESET_FK") {
    // Special case: RESET_FK is purely header-based
    return { headers, body };
  }

  if (opts.transId !== undefined) {
    headers["trans_id"] = String(opts.transId);
  }

  if (opts.cmdCode) {
    headers["cmd_code"] = opts.cmdCode;
  }

  // Frame the body the same way the device frames its own: a length-prefixed
  // NUL-terminated JSON block, then one length-prefixed block per binary.
  //
  // Commands that take no parameters worked with raw JSON because the firmware
  // never reads their body. SET_TIME does read it, and rejected unframed JSON
  // with cmd_return_code=Error until the framing matched.
  const blocks: Buffer[] = [];

  if (opts.bodyJson) {
    blocks.push(
      Buffer.concat([
        Buffer.from(JSON.stringify(opts.bodyJson), "utf-8"),
        Buffer.from([0x00]),
      ]),
    );
  }

  if (opts.binary && opts.binary.length > 0) {
    blocks.push(opts.binary);
  }

  if (blocks.length > 0) {
    body = Buffer.concat(blocks.map(withLengthPrefix));
  }

  // The device sends blk_no/blk_len on its own requests; mirror them back.
  headers["blk_no"] = "0";
  headers["blk_len"] = String(body.length);
  headers["Content-Length"] = String(body.length);

  return { headers, body };
}

/** Prepend a block's length as a little-endian uint32. */
function withLengthPrefix(block: Buffer): Buffer {
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32LE(block.length, 0);
  return Buffer.concat([prefix, block]);
}

/**
 * Convert Date to device time format: "YYYYMMDDhhmmss"
 */
export function toDeviceTime(date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const MM = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");

  return `${yyyy}${MM}${dd}${hh}${mm}${ss}`;
}

/**
 * Parse device time format "YYYYMMDDhhmmss" to Date.
 * Returns null if format is invalid.
 */
export function parseDeviceTime(timeStr: string): Date | null {
  if (!/^\d{14}$/.test(timeStr)) {
    return null;
  }

  const yyyy = parseInt(timeStr.substring(0, 4), 10);
  const MM = parseInt(timeStr.substring(4, 6), 10);
  const dd = parseInt(timeStr.substring(6, 8), 10);
  const hh = parseInt(timeStr.substring(8, 10), 10);
  const mm = parseInt(timeStr.substring(10, 12), 10);
  const ss = parseInt(timeStr.substring(12, 14), 10);

  const date = new Date(yyyy, MM - 1, dd, hh, mm, ss);

  if (isNaN(date.getTime())) {
    return null;
  }

  return date;
}
