"use client";

import { useCallback, useEffect, useState } from "react";

interface CookiesInfo {
  phpsessid: string;
  userId: string;
  expiresAt: string;
  cfClearance: string;
  phpsessidLen: number;
  cfClearanceLen: number;
}

export default function AdminCookies() {
  const [info, setInfo] = useState<CookiesInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: "ok" | "err" | "warn"; text: string } | null>(null);

  const [phpsessid, setPhpsessid] = useState("");
  const [userId, setUserId] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [cfClearance, setCfClearance] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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
          userId: userId.trim(),
          expiresAt: expiresAt.trim(),
          cfClearance: cfClearance.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "err", text: data.error ?? "Gagal save" });
        return;
      }
      setMsg({ type: data.warning ? "warn" : "ok", text: data.warning ? data.error : "✅ Cookies updated!" });
      setPhpsessid(""); setUserId(""); setExpiresAt(""); setCfClearance("");
      load();
    } catch {
      setMsg({ type: "err", text: "Network error" });
    } finally {
      setSaving(false);
    }
  }

  async function refreshCf() {
    setRefreshing(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/cf-refresh", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "err", text: data.error ?? "Refresh gagal" });
        setRefreshing(false);
        return;
      }
      setMsg({ type: "warn", text: "🔄 " + (data.message ?? "Refresh dimulai di background...") });

      // Polling status tiap 5 detik (maks ~2 menit) — gak nahan request lama.
      let tries = 0;
      const maxTries = 24;
      const poll = setInterval(async () => {
        tries++;
        try {
          const s = await fetch("/api/admin/cf-refresh");
          const sd = await s.json();
          const st = sd.status;
          if (st && !st.running && st.at > 0) {
            clearInterval(poll);
            setRefreshing(false);
            if (st.ok) {
              setMsg({ type: "ok", text: "✅ " + st.message });
              load();
            } else {
              setMsg({ type: "err", text: "❌ " + st.message });
            }
          } else if (tries >= maxTries) {
            clearInterval(poll);
            setRefreshing(false);
            setMsg({ type: "warn", text: "⏳ Masih jalan di background — cek lagi nanti." });
          }
        } catch {
          // abaikan error polling sementara, lanjut coba lagi
          if (tries >= maxTries) {
            clearInterval(poll);
            setRefreshing(false);
          }
        }
      }, 5000);
    } catch {
      setMsg({ type: "err", text: "Network error" });
      setRefreshing(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="font-bold">Admin · Cookies</h1>
          <div className="flex gap-2">
            <a href="/admin/orders" className="btn btn-secondary text-xs">Orders</a>
            <a href="/admin/users" className="btn btn-secondary text-xs">Users</a>
            <a href="/admin/health" className="btn btn-secondary text-xs">Health</a>
            <a href="/" className="btn btn-secondary text-xs">← Dashboard</a>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {msg && (
          <div className={`rounded-lg p-3 text-sm border ${msg.type === "ok" ? "bg-green-50 border-green-200 text-green-800" : msg.type === "warn" ? "bg-yellow-50 border-yellow-200 text-yellow-800" : "bg-red-50 border-red-200 text-red-700"}`}>
            {msg.text}
          </div>
        )}

        <section className="card space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">🍪 Cookie Provider (1 akun, semua provider)</h2>
              <p className="text-xs text-slate-500">PHPSESSID + user_id + expires_at + cf_clearance</p>
            </div>
            <button onClick={refreshCf} disabled={refreshing} className="btn btn-secondary text-xs">
              {refreshing ? "Refreshing..." : "Refresh cf_clearance"}
            </button>
          </div>

          <p className="text-xs text-slate-600">
            Cuma 1 set cookie buat semua provider (v1/v2/v3/v4) karena pakai 1 akun ditznesia.
            cf_clearance auto-refresh via FlareSolverr tiap beberapa menit + pas kena 403.
          </p>

          {loading ? <p className="text-xs text-slate-500">Loading...</p> : !info ? <p className="text-xs text-slate-500">Gagal load.</p> : (
            <dl className="space-y-1 text-sm border-t pt-3">
              <div className="flex justify-between"><dt className="text-slate-500">PHPSESSID</dt><dd className="font-mono text-xs">{info.phpsessid} <span className="text-slate-400">({info.phpsessidLen})</span></dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">user_id</dt><dd className="font-mono text-xs">{info.userId}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">expires_at</dt><dd className="font-mono text-xs">{info.expiresAt}{info.expiresAt !== "(empty)" && <span className="text-slate-400 ml-1">({new Date(Number(info.expiresAt) * 1000).toLocaleDateString("id-ID")})</span>}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">cf_clearance</dt><dd className="font-mono text-xs">{info.cfClearance} <span className="text-slate-400">({info.cfClearanceLen})</span></dd></div>
            </dl>
          )}

          <form onSubmit={save} className="space-y-2 border-t pt-3">
            <input type="text" placeholder="PHPSESSID baru" value={phpsessid} onChange={(e) => setPhpsessid(e.target.value)} className="input font-mono text-xs" />
            <input type="text" placeholder="user_id" value={userId} onChange={(e) => setUserId(e.target.value)} className="input font-mono text-xs" />
            <input type="text" placeholder="expires_at (unix timestamp)" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="input font-mono text-xs" />
            <textarea placeholder="cf_clearance baru" value={cfClearance} onChange={(e) => setCfClearance(e.target.value)} className="input font-mono text-xs min-h-[80px]" />
            <button type="submit" disabled={saving || !phpsessid || !userId || !expiresAt || !cfClearance} className="btn btn-primary text-sm">{saving ? "Saving..." : "Save & Test"}</button>
          </form>
        </section>

        <section className="card text-xs text-slate-600 space-y-2">
          <h3 className="font-semibold text-slate-900">ℹ️ Cara dapetin cookies</h3>
          <ol className="list-decimal list-inside space-y-1">
            <li>Login ke ditznesia.com di browser</li>
            <li>F12 → tab <b>Application</b> → <b>Cookies</b></li>
            <li>Copy <code>PHPSESSID</code> + <code>user_id</code> + <code>expires_at</code> + <code>cf_clearance</code></li>
            <li>Paste ke form → Save</li>
          </ol>
          <p className="pt-2 italic text-slate-500">
            cf_clearance kebind ke IP server. Kalau ambil dari browser lokal bisa 403 dari server —
            pakai tombol &quot;Refresh cf_clearance&quot; (FlareSolverr) biar di-generate dari IP server.
          </p>
        </section>
      </main>
    </div>
  );
}
