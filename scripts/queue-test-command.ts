import { initDb, runAsync, getAsync, allAsync } from "@/lib/db";

async function main() {
  await initDb();

  // First ensure device exists
  await runAsync(
    `INSERT INTO devices (dev_id, fk_name, firmware) VALUES (?, ?, ?)
     ON CONFLICT(dev_id) DO NOTHING`,
    ["SIM001", "TEST_DEVICE", "TEST_FW"]
  );

  // Queue a SET_TIME command
  const result = await getAsync<{ trans_id: number }>(
    `INSERT INTO commands (dev_id, cmd_code, cmd_param, status)
     VALUES (?, ?, ?, 'WAIT')
     RETURNING trans_id`,
    [
      "SIM001",
      "SET_TIME",
      JSON.stringify({ time: "20260729143000" }),
    ]
  );

  if (result) {
    console.log(`✓ Command queued with trans_id: ${result.trans_id}`);
    console.log(`  Run 'npm run simulator' now and watch for the command execution`);
  }

  // Show all pending commands
  const pending = await allAsync<any>(
    `SELECT * FROM commands WHERE status IN ('WAIT', 'RUN')`
  );
  console.log(`\n${pending.length} pending command(s):`);
  pending.forEach(c => {
    console.log(`  ${c.trans_id}: ${c.cmd_code} (${c.status})`);
  });
}

main().catch(console.error);
