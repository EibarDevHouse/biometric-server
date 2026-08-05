// Raw TCP listener that speaks FIRST to a device that connects and stays silent.
//
// Some terminals open an outbound connection and wait for the server to send a
// greeting before saying anything. This cycles through candidate greetings — one
// per incoming connection — and logs whatever the device sends back, so we can
// tell which framing it actually understands.
//
// Usage:
//   npx tsx scripts/handshake-probe.ts          # listen on 3000
//   PROBE_PORT=3000 QUIET_MS=2000 npx tsx scripts/handshake-probe.ts
//
// Stop the Next.js dev server first — this needs the port the device dials.

import net from "net";

const PROBE_PORT = parseInt(process.env.PROBE_PORT || "3000", 10);
// How long to wait, after the device connects, before we speak. Lets us record
// whether it ever volunteers data on its own.
const QUIET_MS = parseInt(process.env.QUIET_MS || "2500", 10);
const USHRT_MAX = 0xffff;

function zkChecksum(buf: Buffer): number {
  let sum = 0;
  let i = 0;
  while (i + 1 < buf.length) {
    sum += buf.readUInt16LE(i);
    if (sum > USHRT_MAX) sum -= USHRT_MAX;
    i += 2;
  }
  if (i < buf.length) sum += buf[i];
  while (sum > USHRT_MAX) sum -= USHRT_MAX;
  return ~sum & 0xffff;
}

function zkPacket(command: number, data: Buffer = Buffer.alloc(0)): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt16LE(command, 0);
  head.writeUInt16LE(0, 2);
  head.writeUInt16LE(0, 4);
  head.writeUInt16LE(0, 6);
  const payload = Buffer.concat([head, data]);
  payload.writeUInt16LE(zkChecksum(payload), 2);

  const top = Buffer.alloc(8);
  top.writeUInt16LE(0x5050, 0);
  top.writeUInt16LE(0x7d82, 2);
  top.writeUInt32LE(payload.length, 4);
  return Buffer.concat([top, payload]);
}

interface Greeting {
  name: string;
  bytes: Buffer;
}

const DEV_IP = process.env.DEV_IP || "192.168.0.116";

// Ordered most-plausible first: the device dials out and stays mute, which is the
// signature of a reverse-HTTP tunnel where the SERVER issues the requests.
const GREETINGS: Greeting[] = [
  {
    name: "REVERSE-HTTP: GET / (dispositivo como servidor HTTP)",
    bytes: Buffer.from(
      `GET / HTTP/1.1\r\nHost: ${DEV_IP}\r\nUser-Agent: biometric-server\r\nConnection: keep-alive\r\n\r\n`,
    ),
  },
  {
    name: "REVERSE-HTTP: POST / con headers de nuestro protocolo",
    bytes: Buffer.from(
      `POST / HTTP/1.1\r\nHost: ${DEV_IP}\r\ncmd_code: GET_DEVICE_STATUS\r\ntrans_id: 1\r\nContent-Type: application/octet-stream\r\nContent-Length: 2\r\n\r\n{}`,
    ),
  },
  { name: "(nada — solo escuchar 20s)", bytes: Buffer.alloc(0) },
  {
    name: "HTTP 200 + response_code OK (nuestro protocolo, como respuesta)",
    bytes: Buffer.from(
      "HTTP/1.1 200 OK\r\nresponse_code: OK\r\nContent-Type: application/octet-stream\r\nContent-Length: 0\r\n\r\n",
    ),
  },
  { name: "ZKTeco CMD_CONNECT", bytes: zkPacket(1000) },
  { name: "ZKTeco CMD_DEVICE (11)", bytes: zkPacket(11) },
  { name: "0x55 0xAA framing", bytes: Buffer.from("55aa0000000000000000", "hex") },
  { name: "Anviz 0xA5", bytes: Buffer.from("a5000000300000", "hex") },
  { name: "HTTP 200 vacio", bytes: Buffer.from("HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n") },
  { name: "Texto CRLF", bytes: Buffer.from("\r\n") },
  { name: "Byte nulo", bytes: Buffer.from([0x00]) },
];

let connSeq = 0;
let greetIdx = 0;

function stamp(): string {
  const d = new Date();
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function dump(chunk: Buffer): string {
  const text = chunk.toString("utf-8");
  if (Buffer.from(text, "utf-8").equals(chunk)) return JSON.stringify(text);
  return `hex ${chunk.subarray(0, 96).toString("hex")}\n        latin1 ${JSON.stringify(chunk.subarray(0, 96).toString("latin1"))}`;
}

const server = net.createServer((sock) => {
  const id = ++connSeq;
  const greeting = GREETINGS[greetIdx % GREETINGS.length];
  greetIdx++;

  const peer = `${sock.remoteAddress}:${sock.remotePort}`;
  console.log(`\n[${stamp()}] conn#${id} desde ${peer}`);
  console.log(`         saludo a probar: ${greeting.name}`);

  let spokeFirst = false;
  let replied = false;

  sock.on("data", (chunk) => {
    const phase = spokeFirst ? "RESPUESTA AL SALUDO" : "HABLO PRIMERO (sin saludo)";
    replied = true;
    console.log(`  >>> conn#${id} ${phase} — ${chunk.length} bytes\n        ${dump(chunk)}`);
  });

  const timer = setTimeout(() => {
    if (greeting.bytes.length > 0) {
      spokeFirst = true;
      console.log(`  <<< conn#${id} enviando ${greeting.bytes.length} bytes`);
      sock.write(greeting.bytes);
    }
  }, QUIET_MS);

  const closeTimer = setTimeout(() => {
    if (!replied) console.log(`  --- conn#${id} sin respuesta a "${greeting.name}"`);
    sock.destroy();
  }, QUIET_MS + 20000);

  sock.on("close", () => {
    clearTimeout(timer);
    clearTimeout(closeTimer);
  });
  sock.on("error", (e) => console.log(`  !!! conn#${id} error: ${e.message}`));
});

server.listen(PROBE_PORT, "0.0.0.0", () => {
  console.log(
    `Sonda de handshake escuchando en 0.0.0.0:${PROBE_PORT}\n` +
      `Espera ${QUIET_MS}ms tras cada conexion, luego prueba un saludo distinto.\n` +
      `Saludos en rotacion: ${GREETINGS.length}`,
  );
});
