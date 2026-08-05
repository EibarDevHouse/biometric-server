// Raw TCP proxy that sits between a device and the Next.js server so we can see
// the exact bytes on the wire — including requests Node's HTTP parser rejects
// before they ever reach app/route.ts.
//
// Usage:
//   npx tsx scripts/sniffer.ts            # listen 3001 -> forward to 3000
//   SNIFF_PORT=4000 UPSTREAM_PORT=3000 npx tsx scripts/sniffer.ts
//
// Then point the device's Server Port at 3001 instead of 3000.

import net from "net";

const SNIFF_PORT = parseInt(process.env.SNIFF_PORT || "3001", 10);
const UPSTREAM_HOST = process.env.UPSTREAM_HOST || "127.0.0.1";
const UPSTREAM_PORT = parseInt(process.env.UPSTREAM_PORT || "3000", 10);

let connSeq = 0;

function stamp(): string {
  const d = new Date();
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

/**
 * Render a chunk as printable text, falling back to a hex dump for the parts
 * that are not valid utf-8 (fingerprint templates, photos).
 */
function render(chunk: Buffer): string {
  const text = chunk.toString("utf-8");
  if (Buffer.from(text, "utf-8").equals(chunk)) {
    return text.replace(/\r\n/g, "\\r\\n\n");
  }
  const head = chunk.subarray(0, 512);
  return `<${chunk.length} bytes, not utf-8>\n${head.toString("hex").replace(/(.{64})/g, "$1\n")}`;
}

function log(id: number, tag: string, chunk: Buffer) {
  console.log(
    `\n${"=".repeat(70)}\n[${stamp()}] conn#${id} ${tag} — ${chunk.length} bytes\n${"-".repeat(70)}\n${render(chunk)}`,
  );
}

const server = net.createServer((device) => {
  const id = ++connSeq;
  const from = `${device.remoteAddress}:${device.remotePort}`;
  console.log(`\n[${stamp()}] conn#${id} OPEN from ${from}`);

  const upstream = net.connect(UPSTREAM_PORT, UPSTREAM_HOST);

  // Buffer device bytes until upstream is ready, otherwise early writes are lost.
  const pending: Buffer[] = [];
  let upstreamReady = false;

  upstream.on("connect", () => {
    upstreamReady = true;
    for (const c of pending) upstream.write(c);
    pending.length = 0;
  });

  device.on("data", (chunk) => {
    log(id, `DEVICE -> SERVER`, chunk);
    if (upstreamReady) upstream.write(chunk);
    else pending.push(chunk);
  });

  upstream.on("data", (chunk) => {
    log(id, `SERVER -> DEVICE`, chunk);
    device.write(chunk);
  });

  device.on("end", () => {
    console.log(`[${stamp()}] conn#${id} device sent FIN`);
    upstream.end();
  });
  upstream.on("end", () => {
    console.log(`[${stamp()}] conn#${id} server sent FIN`);
    device.end();
  });

  device.on("close", () => console.log(`[${stamp()}] conn#${id} CLOSED (device side)`));
  upstream.on("close", () => console.log(`[${stamp()}] conn#${id} CLOSED (server side)`));

  device.on("error", (e) => {
    console.log(`[${stamp()}] conn#${id} device error: ${e.message}`);
    upstream.destroy();
  });
  upstream.on("error", (e) => {
    console.log(`[${stamp()}] conn#${id} upstream error: ${e.message}`);
    device.destroy();
  });
});

server.listen(SNIFF_PORT, "0.0.0.0", () => {
  console.log(
    `Sniffer listening on 0.0.0.0:${SNIFF_PORT} -> ${UPSTREAM_HOST}:${UPSTREAM_PORT}`,
  );
  console.log(`Point the device's Server Port at ${SNIFF_PORT}, then watch here.`);
});
