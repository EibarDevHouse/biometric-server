import { allAsync, runAsync, getAsync } from '@/lib/db';
import { initDb } from '@/lib/db';

export const revalidate = 3;

const COMMAND_TEMPLATES: Record<
  string,
  { label: string; params?: Record<string, string> }
> = {
  // Gestión de dispositivos
  GET_DEVICE_STATUS: { label: 'Get Device Status' },
  // Leave params empty to sync to the server clock at delivery time — more
  // accurate than pinning a timestamp when the command is queued.
  SET_TIME: { label: 'Set Device Time (sync to server)' },
  SET_FK_NAME: {
    label: 'Set Device Name',
    params: { fk_name: 'device_name' },
  },
  SET_WEB_SERVER_INFO: {
    label: 'Set Web Server Info',
    params: { server_ip: 'x.x.x.x', server_port: '3000' },
  },

  // Gestión de usuarios
  GET_USER_ID_LIST: { label: 'Get User List' },
  GET_USER_INFO: { label: 'Get User Info', params: { user_id: 'user_id' } },
  SET_USER_INFO: {
    label: 'Set User Info',
    params: { user_id: 'user_id', user_name: 'name', user_privilege: 'USER' },
  },
  SET_USER_NAME: {
    label: 'Set User Name',
    params: { user_id: 'user_id', user_name: 'new_name' },
  },
  SET_USER_PRIVILEGE: {
    label: 'Set User Privilege',
    params: {
      user_id: 'user_id',
      user_privilege: 'MANAGER|REGISTER|OPERATOR|USER',
    },
  },
  DELETE_USER: { label: 'Delete User', params: { user_id: 'user_id_string' } },

  // Gestión de datos biométricos
  GET_ENROLL_DATA: {
    label: 'Get Enroll Data',
    params: { user_id: 'user_id', backup_number: '0-12' },
  },
  SET_ENROLL_DATA: {
    label: 'Set Enroll Data',
    params: { user_id: 'user_id', backup_number: '0-12' },
  },

  // Gestión de logs
  GET_LOG_DATA: {
    label: 'Get Log Data',
    params: { begin_time: '', end_time: '' },
  },
  CLEAR_LOG_DATA: { label: 'Clear All Logs' },
  CLEAR_ENROLL_DATA: { label: 'Clear Enrollment Data' },
};

async function queueCommand(formData: FormData): Promise<void> {
  'use server';

  const devId = formData.get('dev_id') as string;
  const cmdCode = formData.get('cmd_code') as string;
  const params = formData.get('params') as string;

  if (!devId || !cmdCode) {
    throw new Error('Missing device or command');
  }

  await initDb();

  try {
    const parsedParams = params ? JSON.parse(params) : {};
    await runAsync(
      `INSERT INTO commands (dev_id, cmd_code, cmd_param, status)
       VALUES (?, ?, ?, 'WAIT')`,
      [devId, cmdCode, JSON.stringify(parsedParams)],
    );
  } catch (err) {
    throw new Error(String(err));
  }
}

async function getData() {
  await initDb();

  const devices = await allAsync<{ dev_id: string }>(
    `SELECT DISTINCT dev_id FROM devices ORDER BY dev_id`,
  );

  const commands = await allAsync<any>(
    `SELECT * FROM commands ORDER BY created_at DESC LIMIT 50`,
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
          <h2 className="text-lg font-semibold text-slate-900">
            Queue Command
          </h2>
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
              {devices.map((d) => (
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
          <h2 className="text-lg font-semibold text-slate-900">
            Command Queue
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Haz clic en cualquier fila para ver detalles y respuesta
          </p>
        </div>
        <div className="divide-y divide-slate-200">
          {commands.length === 0 ? (
            <div className="px-6 py-8 text-center text-slate-500">
              No hay comandos
            </div>
          ) : (
            commands.map((cmd, idx) => {
              const resultJson = cmd.result_json
                ? JSON.parse(cmd.result_json)
                : null;
              const cmdParams = cmd.cmd_param
                ? JSON.parse(cmd.cmd_param)
                : null;

              return (
                <details key={cmd.trans_id} className="group">
                  <summary className="px-6 py-5 cursor-pointer hover:bg-slate-50 flex items-center justify-between min-h-16">
                    <div className="flex items-center gap-6 flex-1 min-w-0">
                      <span className="font-mono text-sm text-slate-600 font-semibold flex-shrink-0 w-16">
                        ID: {cmd.trans_id}
                      </span>
                      <span className="font-mono text-sm text-slate-700 font-semibold flex-shrink-0">
                        {cmd.dev_id}
                      </span>
                      <span className="font-mono text-sm text-slate-900 font-semibold truncate">
                        {cmd.cmd_code}
                      </span>
                      <span
                        className={`inline-block px-3 py-1 rounded text-xs font-bold flex-shrink-0 ${
                          cmd.status === 'WAIT'
                            ? 'bg-yellow-100 text-yellow-900'
                            : cmd.status === 'RUN'
                              ? 'bg-blue-100 text-blue-900'
                              : cmd.status === 'RESULT'
                                ? 'bg-green-100 text-green-900'
                                : 'bg-red-100 text-red-900'
                        }`}
                      >
                        {cmd.status}
                      </span>
                    </div>
                    <span className="text-slate-500 group-open:rotate-180 transition-transform ml-4 flex-shrink-0">
                      ▼
                    </span>
                  </summary>

                  <div className="px-6 py-4 bg-white border-t border-slate-200 space-y-4">
                    <div className="grid grid-cols-2 gap-8">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 mb-4">
                          Información General
                        </h4>
                        <div className="space-y-3 text-sm leading-relaxed">
                          <div className="flex flex-col">
                            <span className="text-slate-700 font-medium">
                              ID:
                            </span>
                            <span className="font-mono text-slate-900 font-semibold ml-2">
                              {cmd.trans_id}
                            </span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-slate-700 font-medium">
                              Dispositivo:
                            </span>
                            <span className="font-mono text-slate-900 font-semibold ml-2">
                              {cmd.dev_id}
                            </span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-slate-700 font-medium">
                              Comando:
                            </span>
                            <span className="font-mono text-slate-900 font-semibold ml-2">
                              {cmd.cmd_code}
                            </span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-slate-700 font-medium">
                              Estado:
                            </span>
                            <span
                              className={`inline-block mt-1 px-2 py-1 rounded text-xs font-bold w-fit ${
                                cmd.status === 'WAIT'
                                  ? 'bg-yellow-100 text-yellow-900'
                                  : cmd.status === 'RUN'
                                    ? 'bg-blue-100 text-blue-900'
                                    : cmd.status === 'RESULT'
                                      ? 'bg-green-100 text-green-900'
                                      : 'bg-red-100 text-red-900'
                              }`}
                            >
                              {cmd.status}
                            </span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-slate-700 font-medium">
                              Código retorno:
                            </span>
                            <span className="font-mono text-slate-900 font-semibold ml-2">
                              {cmd.cmd_return_code || '—'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 className="text-sm font-bold text-slate-900 mb-4">
                          Timestamps
                        </h4>
                        <div className="space-y-3 text-sm leading-relaxed">
                          <div className="flex flex-col">
                            <span className="text-slate-700 font-medium">
                              Creado:
                            </span>
                            <span className="text-xs text-slate-800 font-mono ml-2">
                              {new Date(cmd.created_at).toLocaleString()}
                            </span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-slate-700 font-medium">
                              Actualizado:
                            </span>
                            <span className="text-xs text-slate-800 font-mono ml-2">
                              {new Date(cmd.updated_at).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {cmdParams && (
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 mb-3">
                          Parámetros enviados al dispositivo
                        </h4>
                        <pre className="bg-slate-100 border border-slate-300 rounded p-4 text-xs overflow-x-auto text-slate-900 font-mono leading-relaxed">
                          {JSON.stringify(cmdParams, null, 2)}
                        </pre>
                      </div>
                    )}

                    {resultJson && (
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 mb-3">
                          ✓ Respuesta del dispositivo
                        </h4>
                        <pre className="bg-green-100 border border-green-400 rounded p-4 text-xs overflow-x-auto text-green-950 font-mono leading-relaxed">
                          {JSON.stringify(resultJson, null, 2)}
                        </pre>
                      </div>
                    )}

                    {cmd.status === 'WAIT' && (
                      <div className="text-sm text-slate-700 italic font-medium">
                        ⏳ Esperando que el dispositivo ejecute el comando...
                      </div>
                    )}

                    {cmd.status === 'RUN' && (
                      <div className="text-sm text-blue-800 italic font-medium">
                        ⚙️ Comando enviado al dispositivo, esperando
                        resultado...
                      </div>
                    )}

                    {cmd.status === 'ERROR' && (
                      <div className="bg-red-100 border border-red-400 rounded p-3 text-sm text-red-950 font-medium">
                        ❌ <strong>Error:</strong>{' '}
                        {cmd.cmd_return_code || 'Unknown error'}
                      </div>
                    )}
                  </div>
                </details>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
