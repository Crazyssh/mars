"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Combobox, { type ComboItem } from "./Combobox";

interface User {
  id: string;
  email: string;
  name: string;
  role: "admin" | "user";
}

interface Country {
  id: number;
  slug: string;
  name: string;
}

interface ServiceOption {
  code: string;
  name: string;
  priceIdr: number;
  stock: number;
}

interface ActiveOrder {
  orderId: string;
  number?: string;
  serviceName: string;
  country: string;
  status?: string;
  otp?: string | null;
  startedAt: number;
}

interface HistoryItem {
  orderId: string;
  number: string;
  serviceName: string;
  country: string;
  status: string;
  otp: string | null;
  orderTime: number;
}

export default function Dashboard({ user }: { user: User }) {
  const router = useRouter();

  // Full lists — di-load sekali, filter client-side
  const [countries, setCountries] = useState<Country[]>([]);
  const [countriesLoading, setCountriesLoading] = useState(true);
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);

  const [services, setServices] = useState<ServiceOption[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [selectedService, setSelectedService] = useState<ServiceOption | null>(null);

  const [operators, setOperators] = useState<string[]>([]);
  const [selectedOperator, setSelectedOperator] = useState<string>("any");

  const [ordering, setOrdering] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkResult, setBulkResult] = useState<{ ok: number; failed: number } | null>(null);
  const [orderError, setOrderError] = useState("");
  const [active, setActive] = useState<ActiveOrder | null>(null);

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ---------- Load all countries on mount ----------
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/search/countries");
        const data = await res.json();
        if (res.ok) setCountries(data.data ?? []);
      } finally {
        setCountriesLoading(false);
      }
    })();
  }, []);

  // ---------- Load services kalau country dipilih ----------
  useEffect(() => {
    if (!selectedCountry) {
      setServices([]);
      setSelectedService(null);
      setOperators([]);
      setSelectedOperator("any");
      return;
    }
    setServicesLoading(true);
    setSelectedService(null);
    setSelectedOperator("any");
    // Load operators (best-effort, gak blocking)
    (async () => {
      try {
        const res = await fetch(
          `/api/search/operators?country=${selectedCountry.id}`
        );
        const data = await res.json();
        if (res.ok && Array.isArray(data.data) && data.data.length > 0) {
          setOperators(data.data);
        } else {
          setOperators(["any"]);
        }
      } catch {
        setOperators(["any"]);
      }
    })();
    (async () => {
      try {
        const res = await fetch(
          `/api/search/services?country=${selectedCountry.id}`
        );
        const data = await res.json();
        if (res.ok) setServices(data.data ?? []);
      } finally {
        setServicesLoading(false);
      }
    })();
  }, [selectedCountry]);

  // ---------- Fetch history ----------
  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/history");
      const data = await res.json();
      if (res.ok) setHistory(data.data ?? []);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // ---------- Hapus history (yang udah selesai, pending dibiarkan) ----------
  const clearHistory = useCallback(async () => {
    if (!confirm("Hapus semua riwayat order yang sudah selesai? Order yang masih PENDING tidak dihapus.")) {
      return;
    }
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/history?finishedOnly=1", { method: "DELETE" });
      if (res.ok) {
        const data = await res.json();
        await fetchHistory();
        alert(`${data.deleted} riwayat dihapus.`);
      }
    } finally {
      setHistoryLoading(false);
    }
  }, [fetchHistory]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Auto-refresh history. Interval adaptif: 5 detik kalau ada PENDING (biar OTP
  // muncul cepet), 20 detik kalau gak ada (hemat).
  // Note: server poller tick tiap 10s, jadi 5s di client menjamin pickup
  // perubahan dalam 1-2 client tick.
  useEffect(() => {
    const hasPending = history.some((h) => h.status === "PENDING" && !h.otp);
    const interval = setInterval(fetchHistory, hasPending ? 3_000 : 20_000);
    return () => clearInterval(interval);
  }, [history, fetchHistory]);

  // ---------- Active order polling ----------
  useEffect(() => {
    if (!active || active.otp) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/order/${active.orderId}`);
        const data = await res.json();
        if (!res.ok) return;
        setActive((prev) =>
          prev
            ? { ...prev, status: data.data.status, otp: data.data.otp }
            : prev
        );
        if (
          data.data.otp ||
          data.data.status === "TIME OUT" ||
          data.data.status === "Dibatalkan"
        ) {
          fetchHistory();
        }
      } catch {
        // silent
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [active, fetchHistory]);

  // ---------- Combobox items ----------
  const countryItems: ComboItem[] = useMemo(
    () =>
      countries.map((c) => ({
        value: String(c.id),
        label: c.name,
        hint: `#${c.id}`,
      })),
    [countries]
  );

  const serviceItems: ComboItem[] = useMemo(
    () =>
      services.map((s) => ({
        value: s.code,
        label: s.name,
        hint: `Rp ${s.priceIdr.toLocaleString("id-ID")} · stok ${s.stock}`,
      })),
    [services]
  );

  const selectedCountryItem: ComboItem | null = selectedCountry
    ? { value: String(selectedCountry.id), label: selectedCountry.name, hint: `#${selectedCountry.id}` }
    : null;

  const selectedServiceItem: ComboItem | null = selectedService
    ? {
        value: selectedService.code,
        label: selectedService.name,
        hint: `Rp ${selectedService.priceIdr.toLocaleString("id-ID")} · stok ${selectedService.stock}`,
      }
    : null;

  // ---------- Actions ----------
  function handleCountryPick(item: ComboItem) {
    const c = countries.find((x) => String(x.id) === item.value);
    if (c) setSelectedCountry(c);
  }

  function handleServicePick(item: ComboItem) {
    const s = services.find((x) => x.code === item.value);
    if (s) setSelectedService(s);
  }

  async function callOrderApi(): Promise<{ ok: boolean; data?: ActiveOrder; error?: string }> {
    if (!selectedCountry || !selectedService) {
      return { ok: false, error: "Pilih negara & service dulu" };
    }
    try {
      const res = await fetch("/api/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          countryId: selectedCountry.id,
          service: selectedService.code,
          operator: selectedOperator,
          serviceName: selectedService.name,
          priceIdr: selectedService.priceIdr,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data.error ?? "Gagal order" };
      }
      return {
        ok: true,
        data: {
          orderId: data.data.orderId,
          number: data.data.number,
          serviceName: data.data.serviceName,
          country: data.data.country,
          status: "PENDING",
          otp: null,
          startedAt: Math.floor(Date.now() / 1000),
        },
      };
    } catch {
      return { ok: false, error: "Network error" };
    }
  }

  async function placeOrder() {
    if (!selectedService || ordering) return;
    setOrdering(true);
    setOrderError("");
    setBulkResult(null);
    const res = await callOrderApi();
    if (!res.ok) {
      setOrderError(res.error ?? "Gagal order");
    } else if (res.data) {
      setActive(res.data);
      setSelectedService(null);
      setSelectedOperator("any");
      fetchHistory();
    }
    setOrdering(false);
  }

  async function placeOrderBulk(count: number) {
    if (!selectedService || ordering) return;
    setOrdering(true);
    setOrderError("");
    setBulkResult(null);
    setBulkProgress({ done: 0, total: count });
    let ok = 0;
    let failed = 0;
    let lastErr = "";
    for (let i = 0; i < count; i++) {
      const res = await callOrderApi();
      if (res.ok) {
        ok++;
      } else {
        failed++;
        lastErr = res.error ?? "";
      }
      setBulkProgress({ done: i + 1, total: count });
      // Jeda kecil biar gak ke-rate-limit provider
      if (i < count - 1) await new Promise((r) => setTimeout(r, 500));
    }
    setBulkProgress(null);
    setBulkResult({ ok, failed });
    if (failed > 0 && lastErr) {
      setOrderError(`${failed} gagal: ${lastErr}`);
    }
    setSelectedService(null);
    setSelectedOperator("any");
    fetchHistory();
    setOrdering(false);
  }

  async function cancelOrder(orderId: string) {
    if (!confirm("Yakin batalkan order? Pastikan belum tertransaksi.")) return;
    try {
      const res = await fetch(`/api/order/${orderId}/cancel`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "Cancel gagal");
        return;
      }
      if (active?.orderId === orderId) setActive(null);
      fetchHistory();
    } catch {
      alert("Network error");
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // silent
    }
  }

  // ---------- Render ----------
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="font-bold">Mars</h1>
            <p className="text-xs text-slate-500">
              {user.name} · {user.role}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a href="/api-docs" className="btn btn-secondary text-xs">
              API
            </a>
            {user.role === "admin" && (
              <>
                <a href="/admin/orders" className="btn btn-secondary text-xs">
                  Orders
                </a>
                <a href="/admin/users" className="btn btn-secondary text-xs">
                  Users
                </a>
                <a href="/admin/cookies" className="btn btn-secondary text-xs">
                  Cookies
                </a>
                <a href="/admin/health" className="btn btn-secondary text-xs">
                  Health
                </a>
              </>
            )}
            <button onClick={logout} className="btn btn-secondary text-xs">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Order section */}
        <section className="lg:col-span-2 space-y-4">
          {active ? (
            <ActiveOrderCard
              order={active}
              onCancel={() => cancelOrder(active.orderId)}
              onDismiss={() => setActive(null)}
              onCopy={copyText}
            />
          ) : (
            <div className="card space-y-4">
              <h2 className="font-semibold">🛒 Buat Order</h2>

              {orderError && (
                <div className="rounded-lg bg-red-50 text-red-700 text-sm p-3 border border-red-200">
                  {orderError}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600 block">
                  🌍 Negara
                </label>
                <Combobox
                  items={countryItems}
                  selected={selectedCountryItem}
                  onSelect={handleCountryPick}
                  placeholder={
                    countriesLoading ? "Loading..." : "Pilih atau cari negara..."
                  }
                  loading={countriesLoading}
                  emptyMessage="Tidak ada negara"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600 block">
                  🏷️ Layanan
                </label>
                <Combobox
                  items={serviceItems}
                  selected={selectedServiceItem}
                  onSelect={handleServicePick}
                  placeholder={
                    !selectedCountry
                      ? "Pilih negara dulu"
                      : servicesLoading
                        ? "Loading services..."
                        : "Pilih atau cari layanan..."
                  }
                  disabled={!selectedCountry}
                  loading={servicesLoading}
                  emptyMessage="Tidak ada layanan dgn stok > 0"
                />
                {selectedCountry && !servicesLoading && services.length > 0 && (
                  <p className="text-xs text-slate-400">
                    {services.length} layanan tersedia di {selectedCountry.name}
                  </p>
                )}
              </div>

              {selectedCountry && operators.length > 1 && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600 block">
                    📡 Operator
                  </label>
                  <select
                    value={selectedOperator}
                    onChange={(e) => setSelectedOperator(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {operators.map((op) => (
                      <option key={op} value={op}>
                        {op === "any" ? "Otomatis (any)" : op}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {bulkProgress && (
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-900">
                  ⏳ Memesan {bulkProgress.done}/{bulkProgress.total}...
                </div>
              )}

              {bulkResult && !bulkProgress && (
                <div
                  className={`rounded-lg p-3 text-sm border ${
                    bulkResult.failed === 0
                      ? "bg-green-50 border-green-200 text-green-800"
                      : "bg-yellow-50 border-yellow-200 text-yellow-800"
                  }`}
                >
                  ✅ {bulkResult.ok} berhasil
                  {bulkResult.failed > 0 && ` · ❌ ${bulkResult.failed} gagal`}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={placeOrder}
                  disabled={!selectedService || ordering}
                  className="btn btn-primary"
                >
                  {ordering && !bulkProgress
                    ? "Memesan..."
                    : selectedService
                      ? `Beli 1 (Rp ${selectedService.priceIdr.toLocaleString("id-ID")})`
                      : "Beli 1"}
                </button>
                <button
                  onClick={() => placeOrderBulk(5)}
                  disabled={!selectedService || ordering}
                  className="btn btn-primary"
                >
                  {bulkProgress
                    ? `${bulkProgress.done}/${bulkProgress.total}`
                    : selectedService
                      ? `Beli 5x (Rp ${(selectedService.priceIdr * 5).toLocaleString("id-ID")})`
                      : "Beli 5x"}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* History */}
        <aside className="card max-h-[600px] overflow-auto">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm">Riwayat</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={clearHistory}
                className="text-xs text-red-600 hover:underline"
                disabled={historyLoading || history.length === 0}
              >
                Hapus
              </button>
              <button
                onClick={fetchHistory}
                className="text-xs text-primary hover:underline"
                disabled={historyLoading}
              >
                {historyLoading ? "..." : "Refresh"}
              </button>
            </div>
          </div>
          {history.length === 0 ? (
            <p className="text-xs text-slate-500">Belum ada riwayat.</p>
          ) : (
            <ul className="space-y-2">
              {history.map((h) => (
                <HistoryRow
                  key={h.orderId}
                  item={h}
                  onCancel={() => cancelOrder(h.orderId)}
                  onCopy={copyText}
                />
              ))}
            </ul>
          )}
        </aside>
      </main>
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function ActiveOrderCard(props: {
  order: ActiveOrder;
  onCancel: () => void;
  onDismiss: () => void;
  onCopy: (v: string) => void;
}) {
  const o = props.order;
  const status = o.otp ? "OTP DITERIMA" : o.status ?? "PENDING";
  const isDone =
    !!o.otp || status === "TIME OUT" || status === "Dibatalkan";
  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">📱 Order Aktif</h2>
        <span
          className={`text-xs px-2 py-1 rounded-full ${
            o.otp
              ? "bg-green-100 text-green-700"
              : "bg-yellow-100 text-yellow-700"
          }`}
        >
          {status}
        </span>
      </div>

      <div className="space-y-2 text-sm">
        <Field label="Nomor">
          <div className="flex items-center gap-2">
            <code className="font-mono">{o.number ?? "-"}</code>
            {o.number && (
              <button
                onClick={() => props.onCopy(o.number!)}
                className="text-xs text-primary hover:underline"
              >
                Copy
              </button>
            )}
          </div>
        </Field>
        <Field label="Service">{o.serviceName}</Field>
        <Field label="Negara">{o.country}</Field>
        <Field label="Order ID">
          <code className="font-mono text-xs">{o.orderId}</code>
        </Field>
        {o.otp && (
          <Field label="OTP">
            <div className="flex items-center gap-2">
              <code className="font-mono font-bold text-lg text-green-700">
                {o.otp}
              </code>
              <button
                onClick={() => props.onCopy(o.otp!)}
                className="text-xs text-primary hover:underline"
              >
                Copy
              </button>
            </div>
          </Field>
        )}
      </div>

      {!isDone && (
        <p className="text-xs text-slate-500">
          ⏳ Auto-cek OTP tiap 3 detik. Batalkan kapan aja (tergantung izin provider).
        </p>
      )}

      <div className="flex gap-2 pt-2">
        {!isDone && (
          <button onClick={props.onCancel} className="btn btn-danger flex-1">
            ❌ Batalkan
          </button>
        )}
        <button onClick={props.onDismiss} className="btn btn-secondary flex-1">
          {isDone ? "Buat Order Baru" : "Sembunyikan"}
        </button>
      </div>
    </div>
  );
}

function HistoryRow(props: {
  item: HistoryItem;
  onCancel: () => void;
  onCopy: (v: string) => void;
}) {
  const h = props.item;
  const time = new Date(h.orderTime * 1000).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const canCancel = h.status === "PENDING";
  return (
    <li className="border border-slate-200 rounded-lg p-3 text-xs space-y-1">
      <div className="flex items-center justify-between">
        <code className="font-mono">{h.number}</code>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded-full ${
            h.status === "Sukses" || h.otp
              ? "bg-green-100 text-green-700"
              : h.status === "PENDING"
                ? "bg-yellow-100 text-yellow-700"
                : "bg-slate-100 text-slate-600"
          }`}
        >
          {h.otp ? "OTP" : h.status}
        </span>
      </div>
      <div className="text-slate-500">
        {h.serviceName} · {h.country} · {time}
      </div>
      {h.otp && (
        <div className="flex items-center gap-2">
          <code className="font-mono text-sm font-bold text-green-700">
            {h.otp}
          </code>
          <button
            onClick={() => props.onCopy(h.otp!)}
            className="text-[10px] text-primary hover:underline"
          >
            Copy
          </button>
        </div>
      )}
      {h.status === "PENDING" && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => props.onCopy(h.number)}
            className="text-[10px] text-primary hover:underline"
          >
            Copy nomor
          </button>
          {canCancel && (
            <button
              onClick={props.onCancel}
              className="text-[10px] text-red-600 hover:underline"
            >
              Batalkan
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span>{children}</span>
    </div>
  );
}
