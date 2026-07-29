import { allAsync, getAsync } from "@/lib/db";
import { initDb } from "@/lib/db";

export const revalidate = 3;

async function getData() {
  await initDb();

  const devices = await allAsync<any>(
    `SELECT dev_id, fk_name, firmware, last_seen_at FROM devices ORDER BY dev_id`
  );

  const totalLogs = await getAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM attendance_logs`
  );

  const pendingCommands = await getAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM commands WHERE status = 'WAIT'`
  );

  const processedCommands = await getAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM commands WHERE status = 'RESULT'`
  );

  return {
    devices: devices.map(d => ({
      ...d,
      isOnline: d.last_seen_at && Date.now() - d.last_seen_at < 30000,
    })),
    stats: {
      totalLogs: totalLogs?.count || 0,
      pendingCommands: pendingCommands?.count || 0,
      processedCommands: processedCommands?.count || 0,
    },
  };
}

export default async function AdminDashboard() {
  const { devices, stats } = await getData();

  return (
    <div className="space-y-8">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-lg border border-slate-200">
          <div className="text-sm text-slate-600">Devices</div>
          <div className="text-3xl font-bold text-slate-900">{devices.length}</div>
          <div className="text-xs text-slate-500 mt-2">
            {devices.filter(d => d.isOnline).length} online
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg border border-slate-200">
          <div className="text-sm text-slate-600">Pending Commands</div>
          <div className="text-3xl font-bold text-blue-600">{stats.pendingCommands}</div>
        </div>

        <div className="bg-white p-6 rounded-lg border border-slate-200">
          <div className="text-sm text-slate-600">Total Logs</div>
          <div className="text-3xl font-bold text-slate-900">{stats.totalLogs}</div>
          <div className="text-xs text-slate-500 mt-2">
            {stats.processedCommands} commands processed
          </div>
        </div>
      </div>

      {/* Devices Table */}
      <div className="bg-white rounded-lg border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Connected Devices</h2>
        </div>
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600">
                Device ID
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600">
                Name
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600">
                Firmware
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600">
                Status
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600">
                Last Seen
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {devices.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                  No devices connected
                </td>
              </tr>
            ) : (
              devices.map(device => (
                <tr key={device.dev_id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 font-mono text-sm text-slate-900">
                    {device.dev_id}
                  </td>
                  <td className="px-6 py-4 text-slate-900">
                    {device.fk_name || "—"}
                  </td>
                  <td className="px-6 py-4 text-slate-600 text-sm">
                    {device.firmware || "—"}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                        device.isOnline
                          ? "bg-green-100 text-green-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {device.isOnline ? "● Online" : "○ Offline"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-500 text-sm">
                    {device.last_seen_at
                      ? new Date(device.last_seen_at).toLocaleString()
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
