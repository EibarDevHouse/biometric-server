import { initDb, runAsync, getAsync } from "@/lib/db";

async function test() {
  await initDb();

  const devId = "TEST_" + Date.now();
  const userId = "U_TEST";
  const binaryData = Buffer.from("fake_binary_data_" + Math.random());

  console.log(`Inserting test enrollment...`);
  console.log(`  devId: ${devId}`);
  console.log(`  userId: ${userId}`);
  console.log(`  binary size: ${binaryData.length}`);

  try {
    await runAsync(
      `INSERT INTO enroll_data (dev_id, user_id, backup_number, data)
       VALUES (?, ?, ?, ?)`,
      [devId, userId, 0, binaryData]
    );

    console.log("✓ Insertion successful");

    const result = await getAsync<any>(
      `SELECT * FROM enroll_data WHERE dev_id = ? AND user_id = ? AND backup_number = ?`,
      [devId, userId, 0]
    );

    if (result) {
      console.log("✓ Record retrieved");
      console.log(`  data size: ${result.data ? result.data.length : 'null'}`);
      console.log(`  data type: ${typeof result.data}`);
    } else {
      console.log("✗ Record not found");
    }
  } catch (err) {
    console.error("✗ Error:", err);
  }
}

test().catch(console.error);
