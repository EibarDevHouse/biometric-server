import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  parseBody,
  buildResponse,
  toDeviceTime,
  parseDeviceTime,
} from "@/lib/protocol";

test("parseBody - JSON only", () => {
  const json = { test: "value" };
  const buf = Buffer.from(JSON.stringify(json), "utf-8");
  const result = parseBody(buf);
  assert.deepEqual(result.json, json);
  assert.equal(result.binaries.length, 0);
});

test("parseBody - JSON with trailing binary", () => {
  const json = { test: "value" };
  const jsonStr = JSON.stringify(json);
  const binaryData = Buffer.from("binary content");
  const buf = Buffer.concat([Buffer.from(jsonStr, "utf-8"), binaryData]);

  const result = parseBody(buf);
  assert.deepEqual(result.json, json);
  assert.equal(result.binaries.length, 1);
  assert.deepEqual(result.binaries[0], binaryData);
});

test("parseBody - JSON with escaped quotes in string", () => {
  const jsonStr = '{"message":"He said \\"hello\\""}';
  const binaryData = Buffer.from("binary");
  const buf = Buffer.concat([Buffer.from(jsonStr, "utf-8"), binaryData]);

  const result = parseBody(buf);
  assert.deepEqual(result.json, { message: 'He said "hello"' });
  assert.equal(result.binaries.length, 1);
  assert.deepEqual(result.binaries[0], binaryData);
});

test("parseBody - Nested JSON with braces in strings", () => {
  const json = { template: "{hello: world}", nested: { key: "value" } };
  const jsonStr = JSON.stringify(json);
  const binaryData = Buffer.from("xyz");
  const buf = Buffer.concat([Buffer.from(jsonStr, "utf-8"), binaryData]);

  const result = parseBody(buf);
  assert.deepEqual(result.json, json);
  assert.deepEqual(result.binaries[0], binaryData);
});

test("parseBody - Empty buffer", () => {
  const result = parseBody(Buffer.alloc(0));
  assert.equal(result.json, null);
  assert.equal(result.binaries.length, 0);
});

test("parseBody - Malformed JSON", () => {
  const buf = Buffer.from('{"incomplete": ', "utf-8");
  const result = parseBody(buf);
  assert.equal(result.json, null);
});

test("parseBody - No JSON, only binary", () => {
  const buf = Buffer.from("not json at all");
  const result = parseBody(buf);
  assert.equal(result.json, null);
});

test("buildResponse - OK with no trans_id", () => {
  const { headers, body } = buildResponse({ responseCode: "OK" });
  assert.equal(headers["response_code"], "OK");
  assert.equal(body.length, 0);
});

test("buildResponse - OK with trans_id and cmd_code", () => {
  const { headers, body } = buildResponse({
    responseCode: "OK",
    transId: 42,
    cmdCode: "SET_TIME",
    bodyJson: { time: "20260729120000" },
  });
  assert.equal(headers["response_code"], "OK");
  assert.equal(headers["trans_id"], "42");
  assert.equal(headers["cmd_code"], "SET_TIME");
  assert(body.includes(Buffer.from("20260729120000")));
});

test("buildResponse - RESET_FK special case", () => {
  const { headers, body } = buildResponse({ responseCode: "RESET_FK" });
  assert.equal(headers["response_code"], "RESET_FK");
  assert.equal(body.length, 0);
});

test("buildResponse - With binary", () => {
  const binary = Buffer.from("binary data");
  const { headers, body } = buildResponse({
    responseCode: "OK",
    bodyJson: { type: "data" },
    binary,
  });
  assert(body.includes(Buffer.from("type")));
  assert(body.includes(binary));
});

test("toDeviceTime - Current date", () => {
  const date = new Date("2026-07-29T14:30:45Z");
  const result = toDeviceTime(date);
  assert.match(result, /^\d{14}$/);
  assert(result.startsWith("20260729"));
});

test("parseDeviceTime - Valid format", () => {
  const result = parseDeviceTime("20260729143045");
  assert(result !== null);
  assert.equal(result.getFullYear(), 2026);
  assert.equal(result.getMonth(), 6); // 0-indexed
  assert.equal(result.getDate(), 29);
  assert.equal(result.getHours(), 14);
  assert.equal(result.getMinutes(), 30);
  assert.equal(result.getSeconds(), 45);
});

test("parseDeviceTime - Invalid format", () => {
  assert.equal(parseDeviceTime("not-a-time"), null);
  assert.equal(parseDeviceTime("2026072"), null);
  assert.equal(parseDeviceTime("202607291430459"), null);
});

test("toDeviceTime and parseDeviceTime round-trip", () => {
  const originalDate = new Date("2025-12-31T23:59:59Z");
  const timeStr = toDeviceTime(originalDate);
  const parsedDate = parseDeviceTime(timeStr);
  assert(parsedDate !== null);
  assert.equal(parsedDate.getFullYear(), originalDate.getFullYear());
  assert.equal(parsedDate.getMonth(), originalDate.getMonth());
  assert.equal(parsedDate.getDate(), originalDate.getDate());
});

// --- Real-device body framing (device 2023081158, firmware WS535BW1_BSCS_v1.5.31) ---

/** Prefix a payload with its length as a little-endian uint32, like the firmware does. */
function withLengthPrefix(payload: Buffer): Buffer {
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32LE(payload.length, 0);
  return Buffer.concat([prefix, payload]);
}

test("parseBody - strips the device's uint32 LE length prefix", () => {
  const json = {
    fk_name: "",
    fk_time: "20000101024026",
    fk_info: { firmware: "WS535BW1_BSCS_v1.5.31" },
  };
  const buf = withLengthPrefix(Buffer.from(JSON.stringify(json), "utf-8"));

  const result = parseBody(buf);
  assert.deepEqual(result.json, json);
  assert.equal(result.binaries.length, 0);
});

test("parseBody - length-prefixed blocks: JSON block plus BIN_1", () => {
  // Byte-for-byte the GET_USER_ID_LIST result captured from the real device.
  const jsonBlock = Buffer.concat([
    Buffer.from(
      '{"user_id_count":3,"one_user_id_size":8,"user_id_array":"BIN_1"}',
      "utf-8",
    ),
    Buffer.from([0x00]), // firmware NUL-terminates the JSON block
  ]);
  const bin1 = Buffer.from(
    "010000000101080002000000020108000300000001010800",
    "hex",
  );
  const buf = Buffer.concat([
    withLengthPrefix(jsonBlock),
    withLengthPrefix(bin1),
  ]);

  const result = parseBody(buf);
  assert.deepEqual(result.json, {
    user_id_count: 3,
    one_user_id_size: 8,
    user_id_array: "BIN_1",
  });
  assert.equal(result.binaries.length, 1);
  assert.deepEqual(result.binaries[0], bin1);
  // 3 users x one_user_id_size
  assert.equal(result.binaries[0].length, 24);
});

test("parseBody - length-prefixed blocks: several binaries stay separate", () => {
  // The old parser lumped every trailing byte into binaries[0], which made
  // BIN_1 vs BIN_2 impossible to tell apart.
  const jsonBlock = Buffer.from('{"a":"BIN_1","b":"BIN_2"}', "utf-8");
  const bin1 = Buffer.from([0x11, 0x22, 0x33]);
  const bin2 = Buffer.from([0xaa, 0xbb]);
  const buf = Buffer.concat([
    withLengthPrefix(jsonBlock),
    withLengthPrefix(bin1),
    withLengthPrefix(bin2),
  ]);

  const result = parseBody(buf);
  assert.deepEqual(result.json, { a: "BIN_1", b: "BIN_2" });
  assert.equal(result.binaries.length, 2);
  assert.deepEqual(result.binaries[0], bin1);
  assert.deepEqual(result.binaries[1], bin2);
});

test("parseBody - trailing NUL/newline padding is not treated as binary", () => {
  // The firmware pads realtime_glog bodies with bytes like 00 0a; storing those
  // as binaries[0] would persist 2 bytes of junk as a fingerprint or photo.
  const json = { user_id: "1", verify_mode: "33", io_time: "20000101025023" };
  const buf = Buffer.concat([
    Buffer.from(JSON.stringify(json), "utf-8"),
    Buffer.from([0x00, 0x0a]),
  ]);

  const result = parseBody(buf);
  assert.deepEqual(result.json, json);
  assert.equal(result.binaries.length, 0);
});

test("parseBody - a 4-byte value that is not a length prefix is left alone", () => {
  // Bodies that already start with `{` must never be reinterpreted.
  const json = { a: 1 };
  const result = parseBody(Buffer.from(JSON.stringify(json), "utf-8"));
  assert.deepEqual(result.json, json);
});
