import { initDb, allAsync } from "@/lib/db";

async function check() {
  await initDb();

  const devices = await allAsync<any>(
    `SELECT * FROM devices`
  );

  console.log("Devices:");
  devices.forEach(d => {
    console.log(`  ${d.dev_id}: ${d.fk_name || "unnamed"} (${d.firmware})`);
  });

  const logs = await allAsync<any>(
    `SELECT * FROM raw_traffic ORDER BY created_at DESC LIMIT 5`
  );

  console.log("\nRaw traffic (last 5):");
  logs.forEach(l => {
    console.log(`  ${l.direction} ${l.request_code} from ${l.dev_id}`);
  });
}

check().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
