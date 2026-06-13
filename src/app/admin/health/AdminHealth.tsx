"use client";

import { useCallback, useEffect, useState } from "react";

interface HealthCheck {
  at: string;
  provider: string;
  durationMs: number;
  ok: boolean;
  error?: string;
}

interface ProviderStat {
  ok: number;
  fail: number;
  uptimePct: number;
  lastOk: boolean | null;
}

interface Stats {
  totalChecks: number;
  okCount: number;
  failCount: number;
  uptimePct: number;
  duration: { min: number; max: number; avg: number; p95: number } | null;
  perProvider: Record<string, ProviderStat>;
  distribution: { label: string; count: number }[];
}

interface HealthData {
  last: HealthCheck | null;
  stats: Stats;
  history: HealthCheck[];
}

export default function AdminHealth() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/health");
      const json = await res.json();
      if (res.ok) setData(json.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(load, 8_000);
    return () => clearInterval(interval);
  }, [autoRefresh, load]);

  function durColor(ms: number): string {
    if (ms < 0) return "text-red-600";
    if (ms < 1000) return "text-green-600";
    if (ms < 5000) return "text-amber-600";
    return "text-red-600";
  }

  function fmtTime(iso: string): string {
    return new Date(iso).toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  function fmtMs(ms: number): string {
    if (ms < 0) return "fail";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }

  const stats = data?.stats;
  const maxDist = stats ? Math.max(1, ...stats.distribution.map((d) => d.count)) : 1;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="font-bold">Admin · Health Monitor</h1>
          <div className="flex gap-2">
            <a href="/admin/orders" className="btn btn-secondary text-xs">Orders</a>
            <a href="/admin/users" className="btn btn-secondary text-xs">Users</a>
            <a href="/admin/cookies" className="btn btn-secondary text-xs">Cookies</a>
            <a href="/" className="btn btn-secondary text-xs">← Dashboard</a>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-xs text-slate-500">
            Status diambil dari hasil poller (tiap 8 detik). Poller sukses = UP,
            gagal = DOWN. Gak ada ping terpisah.
          </p>
          <label className="text-xs flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh
          </label>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : !data || data.history.length === 0 ? (
          <div className="card">
            <p className="text-sm text-slate-500">
              Belum ada data. Tunggu poller jalan (beberapa detik setelah server start).
            </p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="card !p-3">
                <div className="text-[10px] text-slate-500 uppercase">Status</div>
                <div className={`text-xl font-bold mt-1 ${data.last?.ok ? "text-green-600" : "text-red-600"}`}>
                  {data.last?.ok ? "● UP" : "● DOWN"}
                </div>
                {data.last && (
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {data.last.provider} · {fmtTime(data.last.at)}
                  </div>
                )}
              </div>
              <div className="card !p-3">
                <div className="text-[10px] text-slate-500 uppercase">Uptime</div>
                <div className={`text-xl font-bold mt-1 ${stats!.uptimePct >= 90 ? "text-green-600" : stats!.uptimePct >= 50 ? "text-amber-600" : "text-red-600"}`}>
                  {stats!.uptimePct}%
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {stats!.okCount}/{stats!.totalChecks}
                </div>
              </div>
              <div className="card !p-3">
                <div className="text-[10px] text-slate-500 uppercase">Avg Durasi</div>
                <div className={`text-xl font-bold mt-1 ${stats!.duration ? durColor(stats!.duration.avg) : ""}`}>
                  {stats!.duration ? fmtMs(stats!.duration.avg) : "-"}
                </div>
              </div>
              <div className="card !p-3">
                <div className="text-[10px] text-slate-500 uppercase">P95 Durasi</div>
                <div className={`text-xl font-bold mt-1 ${stats!.duration ? durColor(stats!.duration.p95) : ""}`}>
                  {stats!.duration ? fmtMs(stats!.duration.p95) : "-"}
                </div>
              </div>
            </div>

            {/* Per provider */}
            <div className="card">
              <h2 className="font-semibold text-sm mb-3">Status per Provider</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(["v1", "v2", "v3", "v4"] as const).map((p) => {
                  const ps = stats!.perProvider[p];
                  const total = ps.ok + ps.fail;
                  return (
                    <div key={p} className="border border-slate-200 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-sm">{p.toUpperCase()}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${ps.lastOk === null ? "bg-slate-100 text-slate-500" : ps.lastOk ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                          {ps.lastOk === null ? "—" : ps.lastOk ? "UP" : "DOWN"}
                        </span>
                      </div>
                      <div className={`text-lg font-bold mt-1 ${ps.uptimePct >= 90 ? "text-green-600" : ps.uptimePct >= 50 ? "text-amber-600" : total === 0 ? "text-slate-400" : "text-red-600"}`}>
                        {total > 0 ? `${ps.uptimePct}%` : "—"}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {ps.ok} ok / {ps.fail} fail
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Distribution + range */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="card">
                <h2 className="font-semibold text-sm mb-2">Durasi Range</h2>
                {stats!.duration ? (
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-slate-500">Min</span><span className={`font-mono ${durColor(stats!.duration.min)}`}>{fmtMs(stats!.duration.min)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Avg</span><span className={`font-mono ${durColor(stats!.duration.avg)}`}>{fmtMs(stats!.duration.avg)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">P95</span><span className={`font-mono ${durColor(stats!.duration.p95)}`}>{fmtMs(stats!.duration.p95)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Max</span><span className={`font-mono ${durColor(stats!.duration.max)}`}>{fmtMs(stats!.duration.max)}</span></div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">Belum ada data sukses.</p>
                )}
              </div>

              <div className="card">
                <h2 className="font-semibold text-sm mb-2">Distribusi Durasi</h2>
                <ul className="space-y-1.5 text-xs">
                  {stats!.distribution.map((d) => (
                    <li key={d.label}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className={d.label === "fail" ? "text-red-600" : ""}>{d.label}</span>
                        <span className="text-slate-500 font-mono">{d.count}</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded">
                        <div
                          className={`h-1.5 rounded ${d.label === "fail" ? "bg-red-500" : "bg-primary"}`}
                          style={{ width: `${(d.count / maxDist) * 100}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* History */}
            <div className="card">
              <h2 className="font-semibold text-sm mb-3">History ({data.history.length})</h2>
              <div className="overflow-x-auto max-h-[400px]">
                <table className="w-full text-xs">
                  <thead className="text-[10px] uppercase text-slate-500 border-b sticky top-0 bg-white">
                    <tr>
                      <th className="text-left py-2 pr-3">Waktu</th>
                      <th className="text-left py-2 pr-3">Provider</th>
                      <th className="text-left py-2 pr-3">Status</th>
                      <th className="text-left py-2 pr-3">Durasi</th>
                      <th className="text-left py-2 pr-3">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.history.map((h, i) => (
                      <tr key={i} className="border-b last:border-b-0">
                        <td className="py-1.5 pr-3 font-mono">{fmtTime(h.at)}</td>
                        <td className="py-1.5 pr-3 font-mono">{h.provider}</td>
                        <td className="py-1.5 pr-3">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${h.ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                            {h.ok ? "UP" : "DOWN"}
                          </span>
                        </td>
                        <td className={`py-1.5 pr-3 font-mono ${durColor(h.durationMs)}`}>{fmtMs(h.durationMs)}</td>
                        <td className="py-1.5 pr-3 text-[10px] text-red-600 max-w-[260px] truncate" title={h.error ?? ""}>
                          {h.ok ? "" : h.error ?? "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
