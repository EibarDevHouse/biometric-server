"use server";

import { allAsync, runAsync, getAsync } from "@/lib/db";
import { initDb } from "@/lib/db";

export const revalidate = 3;

const COMMAND_TEMPLATES: Record<string, { label: string; params?: Record<string, string> }> = {
  GET_DEVICE_STATUS: { label: "Get Device Status" },
  SET_TIME: { label: "Set Device Time", params: { time: "YYYYMMDDhhmmss" } },
  GET_USER_ID_LIST: { label: "Get User List" },
  GET_LOG_DATA: { label: "Get Log Data" },
  DELETE_USER: { label: "Delete User", params: { user_id: "user_id_string" } },
  SET_USER_NAME: { label: "Set User Name", params: { user_id: "user_id", user_name: "new_name" } },
  SET_USER_PRIVILEGE: { label: "Set User Privilege", params: { user_id: "user_id", user_privilege: "MANAGER|REGISTER|OPERATOR|USER" } },
  CLEAR_LOG_DATA: { label: "Clear All Logs" },
  CLEAR_ENROLL_DATA: { label: "Clear Enrollment Data" },
};

async function queueCommand(formData: FormData) {
  "use server";

  const devId = formData.get("dev_id") as string;
  const cmdCode = formData.get("cmd_code") as string;
  const params = formData.get("params") as string;

  if (!devId || !cmdCode) {
    return { error: "Missing device or command" };
  }

  await initDb();

  try {
    const parsedParams = params ? JSON.parse(params) : {};
    await runAsync(
      `INSERT INTO commands (dev_id, cmd_code, cmd_param, status)
       VALUES (?, ?, ?, 'WAIT')`,
      [devId, cmdCode, JSON.stringify(parsedParams)]
    );
    return { success: true };
  } catch (err) {
    return { error: String(err) };
  }
}

async function getData() {
  await initDb();

  const devices = await allAsync<{ dev_id: string }>(
    `SELECT DISTINCT dev_id FROM devices ORDER BY dev_id`
  );

  const commands = await allAsync<any>(
    `SELECT * FROM commands ORDER BY created_at DESC LIMIT 50`
  );

  return { devices, commands };
}

export default async function CommandsPage() {
  const { devices, commands } = await getData();

  return (
    <div className="space-y-8">
      {/* Queue Command Form */}
      <div className="bg-white rounded-lg border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Queue Command</h2>
        </div>

        <form action={queueCommand} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Device
            </label>
            <select
              name="dev_id"
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select device...</option>
              {devices.map(d => (
                <option key={d.dev_id} value={d.dev_id}>
                  {d.dev_id}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Command
            </label>
            <select
              name="cmd_code"
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select command...</option>
              {Object.entries(COMMAND_TEMPLATES).map(([code, { label }]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Parameters (JSON)
            </label>
            <textarea
              name="params"
              rows={4}
              placeholder='{"key": "value"}'
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 font-medium"
          >
            Queue Command
          </button>
        </form>
      </div>

      {/* Commands Table */}
      <div className="bg-white rounded-lg border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Command Queue</h2>
        </div>
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600">
                ID
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600">
                Device
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600">
                Command
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600">
                Status
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600">
                Result
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {commands.map(cmd => (
              <tr key={cmd.trans_id} className="hover:bg-slate-50">
                <td className="px-6 py-4 font-mono text-sm text-slate-600">
                  {cmd.trans_id}
                </td>
                <td className="px-6 py-4 font-mono text-sm text-slate-900">
                  {cmd.dev_id}
                </td>
                <td className="px-6 py-4 font-mono text-sm text-slate-900">
                  {cmd.cmd_code}
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                      cmd.status === "WAIT"
                        ? "bg-yellow-100 text-yellow-700"
                        : cmd.status === "RUN"
                        ? "bg-blue-100 text-blue-700"
                        : cmd.status === "RESULT"
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {cmd.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-slate-600 font-mono max-w-xs truncate">
                  {cmd.cmd_return_code || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
