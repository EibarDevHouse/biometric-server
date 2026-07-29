import { allAsync, initDb } from "@/lib/db";

export const revalidate = 3;

async function getData(searchParams: Record<string, string>) {
  await initDb();

  const devId = searchParams.dev_id || "";
  const dateFrom = searchParams.date_from || "";

  let query = `SELECT * FROM attendance_logs`;
  const params: any[] = [];

  const conditions = [];
  if (devId) {
    conditions.push("dev_id = ?");
    params.push(devId);
  }
  if (dateFrom) {
    conditions.push("io_time >= ?");
    params.push(dateFrom);
  }

  if (conditions.length > 0) {
    query += " WHERE " + conditions.join(" AND ");
  }

  query += " ORDER BY received_at DESC LIMIT 200";

  const logs = await allAsync<any>(query, params);

  const devices = await allAsync<{ dev_id: string }>(
    `SELECT DISTINCT dev_id FROM devices ORDER BY dev_id`
  );

  return { logs, devices };
}

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Record<string, string>;
}) {
  const { logs, devices } = await getData(searchParams);

  return (
    <div className="space-y-8">
      {/* Filters */}
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Filters</h2>
        <form className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Device
            </label>
            <select
              name="dev_id"
              defaultValue={searchParams.dev_id || ""}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All devices</option>
              {devices.map(d => (
                <option key={d.dev_id} value={d.dev_id}>
                  {d.dev_id}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              From Date (YYYYMMDD)
            </label>
            <input
              type="text"
              name="date_from"
              defaultValue={searchParams.date_from || ""}
              placeholder="20260101"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              Search
            </button>
          </div>
        </form>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-lg border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">
            Attendance Logs ({logs.length})
          </h2>
        </div>
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600">
                Device
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600">
                User ID
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600">
                Verify Mode
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600">
                Time
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600">
                Image
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600">
                Received
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                  No logs found
                </td>
              </tr>
            ) : (
              logs.map((log, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-6 py-4 font-mono text-sm text-slate-600">
                    {log.dev_id}
                  </td>
                  <td className="px-6 py-4 text-slate-900">{log.user_id}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {typeof log.verify_mode === "string" &&
                    log.verify_mode.startsWith("[")
                      ? JSON.parse(log.verify_mode).join(", ")
                      : log.verify_mode || "—"}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600 font-mono">
                    {log.io_time || "—"}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {log.log_image ? "✓" : "—"}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {log.received_at
                      ? new Date(log.received_at).toLocaleString()
                      : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
