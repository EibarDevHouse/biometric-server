import { parseBody } from "@/lib/protocol";

const enrollJson = {
  user_id: "U002",
  user_name: "Test User",
  user_privilege: "USER",
  enroll_data_array: [
    { backup_number: 0 },
    { backup_number: 1 },
  ],
};

const enrollBinary1 = Buffer.from("fake_fingerprint_1");
const enrollBinary2 = Buffer.from("fake_fingerprint_2");
const enrollBody = Buffer.concat([
  Buffer.from(JSON.stringify(enrollJson)),
  enrollBinary1,
  enrollBinary2,
]);

console.log("Total body size:", enrollBody.length);
console.log("JSON size:", JSON.stringify(enrollJson).length);
console.log("Binary size:", enrollBinary1.length + enrollBinary2.length);

const result = parseBody(enrollBody);

console.log("Parsed JSON:", result.json);
console.log("Binaries count:", result.binaries.length);
if (result.binaries.length > 0) {
  console.log("Binary 0 size:", result.binaries[0].length);
  console.log("Binary 0 content:", result.binaries[0].toString("utf-8"));
}
