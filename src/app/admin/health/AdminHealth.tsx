"use client";

import { useCallback, useEffect, useState } from "react";

interface HealthCheck {
  at: string;
  ttfbMs: number;
  totalMs: number;
  httpCode: number;
  ok: boolean;
  error?: string;
}

interface HealthData {
  last: HealthCheck | null;
  avgTtfbMs: number;
  uptimePct: number;
  history: HealthCheck[];
}

export default function AdminHealth() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

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
    const interval = setInterval(load, 10_000); // refresh tiap 10 detik
    return () => clearInterval(interval);
  }, [load]);

  function ttfbColor(ms: number): string {
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
    if (ms < 0) return "timeout";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="font-bold">Admin · Health Monitor</h1>
          <div className="flex gap-2">
            <a href="/admin/orders" className="btn btn-secondary text-xs">Orders</a>
            <a href="/admin/cookies" className="btn btn-secondary text-xs">Cookies</a>
            <a href="/" className="btn btn-secondary text-xs">← Dashboard</a>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <p className="text-xs text-slate-500">
          Ping ke provider tiap 10 detik. Auto-refresh halaman tiap 10 detik.
        </p>

        {loading ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : !data || data.history.length === 0 ? (
          <div className="card">
            <p className="text-sm text-slate-500">
              Belum ada data. Tunggu beberapa detik (monitor baru mulai setelah server start).
            </p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="card !p-3">
                <div className="text-[10px] text-slate-500 uppercase">Status Terakhir</div>
                <div className={`text-xl font-bold mt-1 ${data.last?.ok ? "text-green-600" : "text-red-600"}`}>
                  {data.last?.ok ? "● UP" : "● DOWN"}
                </div>
                {data.last && (
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {fmtTime(data.last.at)}
                  </div>
                )}
              </div>
              <div className="card !p-3">
                <div className="text-[10px] text-slate-500 uppercase">Avg TTFB (20x)</div>
                <div className={`text-xl font-bold mt-1 ${ttfbColor(data.avgTtfbMs)}`}>
                  {fmtMs(data.avgTtfbMs)}
                </div>
              </div>
              <div className="card !p-3">
                <div className="text-[10px] text-slate-500 uppercase">Uptime (20x)</div>
                <div className={`text-xl font-bold mt-1 ${data.uptimePct >= 90 ? "text-green-600" : data.uptimePct >= 50 ? "text-amber-600" : "text-red-600"}`}>
                  {data.uptimePct}%
                </div>
              </div>
            </div>

            {/* History table */}
            <div className="card">
              <h2 className="font-semibold text-sm mb-3">History (terbaru di atas)</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-[10px] uppercase text-slate-500 border-b">
                    <tr>
                      <th className="text-left py-2 pr-3">Waktu</th>
                      <th className="text-left py-2 pr-3">Status</th>
                      <th className="text-left py-2 pr-3">HTTP</th>
                      <th className="text-left py-2 pr-3">TTFB</th>
                      <th className="text-left py-2 pr-3">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.history.map((h, i) => (
                      <tr key={i} className="border-b last:border-b-0">
                        <td className="py-1.5 pr-3 font-mono">{fmtTime(h.at)}</td>
                        <td className="py-1.5 pr-3">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${h.ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                            {h.ok ? "UP" : "DOWN"}
                          </span>
                        </td>
                        <td className="py-1.5 pr-3 font-mono">{h.httpCode || "-"}</td>
                        <td className={`py-1.5 pr-3 font-mono ${ttfbColor(h.ttfbMs)}`}>{fmtMs(h.ttfbMs)}</td>
                        <td className="py-1.5 pr-3 font-mono text-slate-500">{fmtMs(h.totalMs)}</td>
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
