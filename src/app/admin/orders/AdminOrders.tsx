"use client";

import { useCallback, useEffect, useState } from "react";

interface UserInfo {
  id: string;
  name: string;
  email: string;
}

interface OrderRow {
  id: string;
  orderId: string;
  service: string;
  serviceName: string;
  country: string;
  number: string;
  outcome: string;
  otpAt: string | null;
  createdAt: string;
  user: UserInfo;
}

interface StatsData {
  total: number;
  successful: number;
  successRate: number;
  byService: Array<{ name: string; count: number }>;
  byCountry: Array<{ name: string; count: number }>;
  byUser: Array<{ userId: string; user: UserInfo | null; count: number }>;
}

export default function AdminOrders() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [successOnly, setSuccessOnly] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [ordersRes, statsRes] = await Promise.all([
        fetch(`/api/admin/orders?success=${successOnly ? "1" : "0"}&limit=200`),
        fetch("/api/admin/stats"),
      ]);
      const ordersData = await ordersRes.json();
      const statsData = await statsRes.json();
      if (!ordersRes.ok) {
        setError(ordersData.error ?? "Gagal load orders");
        return;
      }
      setOrders(ordersData.data ?? []);
      setStats(statsData.data ?? null);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [successOnly]);

  useEffect(() => {
    load();
  }, [load]);

  const clearAll = useCallback(async () => {
    if (!confirm("Hapus SEMUA history order (semua user) yang sudah selesai? Order PENDING tetap aman.")) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/orders", { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        alert(`${data.deleted} order log dihapus.`);
        await load();
      } else {
        setError(data.error ?? "Gagal hapus");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [load]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="font-bold">Admin · Orders</h1>
          <div className="flex gap-2">
            <a href="/admin/users" className="btn btn-secondary text-xs">
              Users
            </a>
            <a href="/admin/cookies" className="btn btn-secondary text-xs">
              Cookies
            </a>
            <a href="/" className="btn btn-secondary text-xs">
              ← Dashboard
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Stats Summary */}
        {stats && (
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Total Orders" value={stats.total} />
            <StatCard label="Sukses OTP" value={stats.successful} color="green" />
            <StatCard label="Success Rate" value={`${stats.successRate}%`} color="blue" />
            <StatCard label="Gagal/Expired" value={stats.total - stats.successful} color="red" />
          </section>
        )}

        {/* Top breakdowns */}
        {stats && (
          <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <BreakdownCard
              title="🏷️ Top Service"
              items={stats.byService.slice(0, 10)}
            />
            <BreakdownCard
              title="🌍 Top Negara"
              items={stats.byCountry.slice(0, 10)}
            />
            <BreakdownCard
              title="👤 Top User"
              items={stats.byUser.slice(0, 10).map((u) => ({
                name: u.user?.name ?? u.userId,
                count: u.count,
              }))}
            />
          </section>
        )}

        {/* Orders Table */}
        <section className="card">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="font-semibold">Daftar Order</h2>
            <div className="flex items-center gap-3">
              <label className="text-xs flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={successOnly}
                  onChange={(e) => setSuccessOnly(e.target.checked)}
                  className="rounded"
                />
                Sukses OTP only
              </label>
              <button
                onClick={load}
                className="text-xs text-primary hover:underline"
                disabled={loading}
              >
                {loading ? "..." : "Refresh"}
              </button>
              <button
                onClick={clearAll}
                className="text-xs text-red-600 hover:underline"
                disabled={loading}
              >
                Hapus history
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 text-red-700 text-sm p-3 border border-red-200 mb-3">
              {error}
            </div>
          )}

          {loading ? (
            <p className="text-xs text-slate-500">Loading...</p>
          ) : orders.length === 0 ? (
            <p className="text-xs text-slate-500">
              Belum ada order {successOnly ? "yang sukses" : ""}.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-[10px] text-slate-500 border-b uppercase">
                  <tr>
                    <th className="text-left py-2 pr-2">Waktu</th>
                    <th className="text-left py-2 pr-2">User</th>
                    <th className="text-left py-2 pr-2">Service</th>
                    <th className="text-left py-2 pr-2">Negara</th>
                    <th className="text-left py-2 pr-2">Nomor</th>
                    <th className="text-left py-2 pr-2">Status</th>
                    <th className="text-left py-2 pr-2">Order ID</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-b last:border-b-0 hover:bg-slate-50">
                      <td className="py-2 pr-2 whitespace-nowrap text-slate-600">
                        {formatTime(o.createdAt)}
                      </td>
                      <td className="py-2 pr-2">
                        <div className="font-medium">{o.user.name}</div>
                        <div className="text-[10px] text-slate-400">
                          {o.user.email}
                        </div>
                      </td>
                      <td className="py-2 pr-2">{o.serviceName}</td>
                      <td className="py-2 pr-2">{o.country}</td>
                      <td className="py-2 pr-2 font-mono">{o.number}</td>
                      <td className="py-2 pr-2">
                        <StatusBadge outcome={o.outcome} />
                      </td>
                      <td className="py-2 pr-2 font-mono text-[10px] text-slate-400">
                        {o.orderId}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

// ============================================================

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color?: "green" | "blue" | "red";
}) {
  const colorClass = {
    green: "text-green-600",
    blue: "text-blue-600",
    red: "text-red-600",
  }[color ?? ("" as never)] ?? "text-slate-900";
  return (
    <div className="card !p-3">
      <div className="text-[10px] text-slate-500 uppercase">{label}</div>
      <div className={`text-xl font-bold mt-1 ${colorClass}`}>{value}</div>
    </div>
  );
}

function BreakdownCard({
  title,
  items,
}: {
  title: string;
  items: Array<{ name: string; count: number }>;
}) {
  const max = items[0]?.count ?? 1;
  return (
    <div className="card !p-4">
      <h3 className="text-sm font-semibold mb-2">{title}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400">Belum ada data.</p>
      ) : (
        <ul className="space-y-1.5 text-xs">
          {items.map((it, idx) => (
            <li key={`${it.name}-${idx}`}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="truncate">{it.name}</span>
                <span className="text-slate-500 font-mono ml-2">
                  {it.count}
                </span>
              </div>
              <div className="h-1 bg-slate-100 rounded">
                <div
                  className="h-1 bg-primary rounded"
                  style={{ width: `${(it.count / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusBadge({ outcome }: { outcome: string }) {
  const map: Record<string, { label: string; class: string }> = {
    otp_received: { label: "Sukses", class: "bg-green-100 text-green-700" },
    pending: { label: "Pending", class: "bg-yellow-100 text-yellow-700" },
    expired: { label: "Expired", class: "bg-slate-100 text-slate-600" },
    timeout: { label: "Timeout", class: "bg-slate-100 text-slate-600" },
    cancelled: { label: "Cancel", class: "bg-red-100 text-red-700" },
  };
  const { label, class: cls } = map[outcome] ?? {
    label: outcome,
    class: "bg-slate-100 text-slate-700",
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${cls}`}>
      {label}
    </span>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
