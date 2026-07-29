import { NextRequest, NextResponse } from "next/server";
import { parseBody, buildResponse, toDeviceTime } from "@/lib/protocol";
import {
  runAsync,
  getAsync,
  allAsync,
} from "@/lib/db";
import {
  handleReceiveCmd,
  handleSendCmdResult,
  handleRealtimeGlog,
  handleRealtimeEnrollData,
} from "./protocol-handlers";

export async function logRawTraffic(
  direction: "in" | "out",
  devId: string | null,
  requestCode: string | null,
  headers: Record<string, string>,
  body: Buffer
) {
  const bodyPreview = body.subarray(0, 2000).toString("utf-8", 0, 2000);
  const bodySize = body.length;
  const binaryStart = findJsonEnd(body);
  const binarySize = binaryStart !== -1 ? body.length - binaryStart : 0;

  await runAsync(
    `INSERT INTO raw_traffic (direction, dev_id, request_code, headers_json, body_preview, body_size, binary_size)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      direction,
      devId,
      requestCode,
      JSON.stringify(headers),
      bodyPreview,
      bodySize,
      binarySize,
    ]
  );
}

function findJsonEnd(buf: Buffer): number {
  let braceDepth = 0;
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
    }
  }

  return -1;
}

export async function handleBiometricRequest(
  request: NextRequest,
  requestBody: Buffer
) {
  const requestCode = request.headers.get("request_code");
  const devId = request.headers.get("dev_id");

  const headersRecord: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headersRecord[key] = value;
  });

  try {
    // Log incoming request (temporarily disabled for debugging)
    // await logRawTraffic("in", devId, requestCode, headersRecord, requestBody);

    // Dispatch based on request_code
    switch (requestCode) {
      case "receive_cmd":
        return await handleReceiveCmd(request, requestBody, devId);

      case "send_cmd_result":
        return await handleSendCmdResult(request, requestBody, devId);

      case "realtime_glog":
        return await handleRealtimeGlog(request, requestBody, devId);

      case "realtime_enroll_data":
        return await handleRealtimeEnrollData(request, requestBody, devId);

      default:
        // Unknown request code
        const errorHeaders = buildResponse({ responseCode: "ERROR" });
        await logRawTraffic(
          "out",
          devId,
          requestCode,
          errorHeaders.headers,
          errorHeaders.body
        );
        return new NextResponse(errorHeaders.body, {
          status: 400,
          headers: errorHeaders.headers,
        });
    }
  } catch (err) {
    console.error("Error processing request:", err);

    const errorHeaders = buildResponse({ responseCode: "ERROR" });
    await logRawTraffic(
      "out",
      devId,
      requestCode,
      errorHeaders.headers,
      errorHeaders.body
    );

    return new NextResponse(errorHeaders.body, {
      status: 500,
      headers: errorHeaders.headers,
    });
  }
}
