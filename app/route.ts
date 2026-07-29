export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/lib/db";
import { handleBiometricRequest } from "@/lib/handlers";

let dbInitialized = false;

async function ensureDbInit() {
  if (!dbInitialized) {
    await initDb();
    dbInitialized = true;
  }
}

export async function GET(request: NextRequest) {
  await ensureDbInit();
  return new NextResponse("Biometric server OK", { status: 200 });
}

export async function POST(request: NextRequest) {
  await ensureDbInit();

  // Read body as raw bytes, never as JSON
  const arrayBuffer = await request.arrayBuffer();
  const requestBody = Buffer.from(arrayBuffer);

  return handleBiometricRequest(request, requestBody);
}
