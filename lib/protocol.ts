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

  const jsonEnd = findJsonEnd(buf);
  if (jsonEnd === -1) {
    // No valid JSON found
    return { json: null, binaries: [] };
  }

  let json: Record<string, any> | null = null;
  try {
    const jsonStr = buf.subarray(0, jsonEnd).toString("utf-8");
    json = JSON.parse(jsonStr);
  } catch {
    return { json: null, binaries: [] };
  }

  const binaries: Buffer[] = [];
  if (jsonEnd < buf.length) {
    binaries.push(buf.subarray(jsonEnd));
  }

  return { json, binaries };
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

  if (opts.bodyJson) {
    const jsonStr = JSON.stringify(opts.bodyJson);
    body = Buffer.concat([body, Buffer.from(jsonStr, "utf-8")]);
  }

  if (opts.binary && opts.binary.length > 0) {
    body = Buffer.concat([body, opts.binary]);
  }

  headers["Content-Length"] = String(body.length);

  return { headers, body };
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
