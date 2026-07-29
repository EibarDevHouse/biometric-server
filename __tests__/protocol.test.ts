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
