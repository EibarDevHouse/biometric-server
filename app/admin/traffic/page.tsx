import { allAsync, initDb } from "@/lib/db";

export const revalidate = 3;

async function getData() {
  await initDb();

  const traffic = await allAsync<any>(
    `SELECT * FROM raw_traffic ORDER BY created_at DESC LIMIT 200`
  );

  return { traffic };
}

export default async function TrafficPage() {
  const { traffic } = await getData();

  return (
    <div className="space-y-8">
      <div className="bg-white rounded-lg border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">
            Network Traffic ({traffic.length})
          </h2>
          <p className="text-sm text-slate-500 mt-1">Last 200 requests/responses</p>
        </div>

        <div className="divide-y divide-slate-200 max-h-[80vh] overflow-y-auto">
          {traffic.length === 0 ? (
            <div className="px-6 py-8 text-center text-slate-500">
              No traffic logged
            </div>
          ) : (
            traffic.map((item, i) => {
              const headers = item.headers_json ? JSON.parse(item.headers_json) : {};
              return (
                <div key={i} className="p-6 hover:bg-slate-50">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          item.direction === "in"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-green-100 text-green-700"
                        }`}
                      >
                        {item.direction === "in" ? "← IN" : "→ OUT"}
                      </span>
                      <span className="font-mono text-sm font-semibold text-slate-900">
                        {item.request_code || "—"}
                      </span>
                      {item.dev_id && (
                        <span className="text-sm text-slate-500">
                          {item.dev_id}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate-500">
                      {item.created_at
                        ? new Date(item.created_at).toLocaleTimeString()
                        : "—"}
                    </span>
                  </div>

                  <div className="bg-slate-50 rounded p-3 text-xs font-mono text-slate-700 mb-3">
                    <div className="space-y-1">
                      {Object.entries(headers).map(([key, value]) => (
                        <div key={key}>
                          <span className="text-slate-500">{key}:</span> {String(value)}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="text-xs text-slate-600">
                    <span className="text-slate-500">Body:</span>{" "}
                    {item.body_size} bytes
                    {item.binary_size > 0 && (
                      <span> ({item.binary_size} binary)</span>
                    )}
                  </div>

                  {item.body_preview && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-blue-600 hover:text-blue-700">
                        Preview ({item.body_preview.length} chars)
                      </summary>
                      <pre className="mt-2 bg-slate-100 p-2 rounded text-xs overflow-x-auto max-w-full">
                        {item.body_preview.substring(0, 500)}
                        {item.body_preview.length > 500 ? "..." : ""}
                      </pre>
                    </details>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
