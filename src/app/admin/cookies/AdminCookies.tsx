"use client";

import { useCallback, useEffect, useState } from "react";

interface CookiesInfo {
  phpsessid: string; // masked
  cfClearance: string; // masked
  phpsessidLen: number;
  cfClearanceLen: number;
}

export default function AdminCookies() {
  const [info, setInfo] = useState<CookiesInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [phpsessid, setPhpsessid] = useState("");
  const [cfClearance, setCfClearance] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err" | "warn"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/cookies");
      const data = await res.json();
      if (res.ok) setInfo(data.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/cookies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phpsessid: phpsessid.trim(),
          cfClearance: cfClearance.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "err", text: data.error ?? "Gagal save" });
        return;
      }
      if (data.warning) {
        setMsg({ type: "warn", text: data.error });
      } else {
        setMsg({
          type: "ok",
          text: "✅ Cookies updated! Live tanpa restart server.",
        });
      }
      setPhpsessid("");
      setCfClearance("");
      load();
    } catch {
      setMsg({ type: "err", text: "Network error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="font-bold">Admin · Cookies</h1>
          <div className="flex gap-2">
            <a href="/admin/orders" className="btn btn-secondary text-xs">
              Orders
            </a>
            <a href="/admin/users" className="btn btn-secondary text-xs">
              Users
            </a>
            <a href="/admin/pricing" className="btn btn-secondary text-xs">
              Pricing
            </a>
            <a href="/" className="btn btn-secondary text-xs">
              ← Dashboard
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Current state */}
        <section className="card">
          <h2 className="font-semibold mb-3">📦 Cookies Aktif</h2>
          {loading ? (
            <p className="text-xs text-slate-500">Loading...</p>
          ) : !info ? (
            <p className="text-xs text-slate-500">Gagal load.</p>
          ) : (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">PHPSESSID</dt>
                <dd className="font-mono text-xs">
                  {info.phpsessid}{" "}
                  <span className="text-slate-400">({info.phpsessidLen} chars)</span>
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">cf_clearance</dt>
                <dd className="font-mono text-xs">
                  {info.cfClearance}{" "}
                  <span className="text-slate-400">({info.cfClearanceLen} chars)</span>
                </dd>
              </div>
            </dl>
          )}
        </section>

        {/* Update form */}
        <section className="card">
          <h2 className="font-semibold mb-3">🔄 Update Cookies</h2>
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-900 mb-4 space-y-1">
            <p className="font-semibold">Cara dapetin cookies baru:</p>
            <ol className="list-decimal list-inside space-y-0.5">
              <li>Buka <code>https://ditznesia.id</code> di browser → login</li>
              <li>F12 → tab <b>Application</b> → <b>Cookies</b> → <code>https://ditznesia.id</code></li>
              <li>Copy value <code>PHPSESSID</code> dan <code>cf_clearance</code> (domain <code>.ditznesia.id</code>)</li>
              <li>Paste di form bawah → Save</li>
            </ol>
            <p className="pt-1 italic">
              Cookies tersimpan di DB, langsung apply tanpa restart server.
            </p>
          </div>

          <form onSubmit={save} className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">
                PHPSESSID
              </label>
              <input
                type="text"
                required
                value={phpsessid}
                onChange={(e) => setPhpsessid(e.target.value)}
                className="input font-mono text-xs"
                placeholder="abc123..."
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">
                cf_clearance{" "}
                <span className="text-slate-400 font-normal">
                  (FULL string, biasanya 200+ karakter)
                </span>
              </label>
              <textarea
                required
                value={cfClearance}
                onChange={(e) => setCfClearance(e.target.value)}
                className="input font-mono text-xs min-h-[100px]"
                placeholder="ZyiFKI1nyR.o28d2SM0fRSpUx...-1779565941-1.2.1.1-..."
              />
            </div>

            {msg && (
              <div
                className={`rounded-lg p-3 text-sm border ${
                  msg.type === "ok"
                    ? "bg-green-50 border-green-200 text-green-800"
                    : msg.type === "warn"
                      ? "bg-yellow-50 border-yellow-200 text-yellow-800"
                      : "bg-red-50 border-red-200 text-red-700"
                }`}
              >
                {msg.text}
              </div>
            )}

            <button
              type="submit"
              disabled={saving || !phpsessid || !cfClearance}
              className="btn btn-primary"
            >
              {saving ? "Saving..." : "Save & Test"}
            </button>
          </form>
        </section>

        {/* Info */}
        <section className="card text-xs text-slate-600 space-y-2">
          <h3 className="font-semibold text-slate-900">ℹ️ Tentang Cookies Mars</h3>
          <p>
            <b>PHPSESSID</b>: token session ditznesia. Idle timeout ~24 jam — selama bot
            aktif dipake (auto keep-alive setiap 5 menit), gak akan expired.
          </p>
          <p>
            <b>cf_clearance</b>: Cloudflare bot-detection token. Auto-expired ~24-48 jam.
            Perlu refresh manual lewat browser (lewat page ini), Cloudflare gak bisa
            di-bypass programmatically.
          </p>
        </section>
      </main>
    </div>
  );
}
