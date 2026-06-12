"use client";

import { useCallback, useEffect, useState } from "react";

interface CookiesInfo {
  v1: { phpsessid: string; userId: string; expiresAt: string; phpsessidLen: number };
  v2: { phpsessid: string; userId: string; expiresAt: string; phpsessidLen: number };
  v3: { phpsessid: string; userId: string; expiresAt: string; phpsessidLen: number };
  v4: { phpsessid: string; userId: string; expiresAt: string; phpsessidLen: number };
}

export default function AdminCookies() {
  const [info, setInfo] = useState<CookiesInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: "ok" | "err" | "warn"; text: string } | null>(null);

  const [v1Phpsessid, setV1Phpsessid] = useState("");
  const [v1UserId, setV1UserId] = useState("");
  const [v1ExpiresAt, setV1ExpiresAt] = useState("");
  const [v1Saving, setV1Saving] = useState(false);

  const [v2Phpsessid, setV2Phpsessid] = useState("");
  const [v2UserId, setV2UserId] = useState("");
  const [v2ExpiresAt, setV2ExpiresAt] = useState("");
  const [v2Saving, setV2Saving] = useState(false);

  const [v3Phpsessid, setV3Phpsessid] = useState("");
  const [v3UserId, setV3UserId] = useState("");
  const [v3ExpiresAt, setV3ExpiresAt] = useState("");
  const [v3Saving, setV3Saving] = useState(false);

  const [v4Phpsessid, setV4Phpsessid] = useState("");
  const [v4UserId, setV4UserId] = useState("");
  const [v4ExpiresAt, setV4ExpiresAt] = useState("");
  const [v4Saving, setV4Saving] = useState(false);

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

  async function saveProvider(provider: "v1" | "v2" | "v3" | "v4", phpsessid: string, userId: string, expiresAt: string, setSaving: (b: boolean) => void, reset: () => void) {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/cookies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, phpsessid: phpsessid.trim(), userId: userId.trim(), expiresAt: expiresAt.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg({ type: "err", text: data.error ?? `Gagal save ${provider.toUpperCase()}` }); return; }
      setMsg({ type: data.warning ? "warn" : "ok", text: data.warning ? data.error : `✅ ${provider.toUpperCase()} cookies updated!` });
      reset(); load();
    } catch { setMsg({ type: "err", text: "Network error" }); }
    finally { setSaving(false); }
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

        {/* V1 */}
        <section className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">📦 Provider V1 (orderv3)</h2>
            <span className="text-xs text-slate-500">PHPSESSID + user_id + expires_at</span>
          </div>
          {loading ? <p className="text-xs text-slate-500">Loading...</p> : !info ? <p className="text-xs text-slate-500">Gagal load.</p> : (
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">PHPSESSID</dt><dd className="font-mono text-xs">{info.v1.phpsessid} <span className="text-slate-400">({info.v1.phpsessidLen})</span></dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">user_id</dt><dd className="font-mono text-xs">{info.v1.userId}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">expires_at</dt><dd className="font-mono text-xs">{info.v1.expiresAt}{info.v1.expiresAt !== "(empty)" && <span className="text-slate-400 ml-1">({new Date(Number(info.v1.expiresAt) * 1000).toLocaleDateString("id-ID")})</span>}</dd></div>
            </dl>
          )}
          <form onSubmit={(e) => { e.preventDefault(); saveProvider("v1", v1Phpsessid, v1UserId, v1ExpiresAt, setV1Saving, () => { setV1Phpsessid(""); setV1UserId(""); setV1ExpiresAt(""); }); }} className="space-y-2 border-t pt-3">
            <input type="text" placeholder="PHPSESSID baru" value={v1Phpsessid} onChange={(e) => setV1Phpsessid(e.target.value)} className="input font-mono text-xs" />
            <input type="text" placeholder="user_id" value={v1UserId} onChange={(e) => setV1UserId(e.target.value)} className="input font-mono text-xs" />
            <input type="text" placeholder="expires_at (unix timestamp)" value={v1ExpiresAt} onChange={(e) => setV1ExpiresAt(e.target.value)} className="input font-mono text-xs" />
            <button type="submit" disabled={v1Saving || !v1Phpsessid || !v1UserId || !v1ExpiresAt} className="btn btn-primary text-sm">{v1Saving ? "Saving..." : "Save V1 & Test"}</button>
          </form>
        </section>

        {/* V2 */}
        <section className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">🔄 Provider V2 (orderv2)</h2>
            <span className="text-xs text-slate-500">PHPSESSID + user_id + expires_at</span>
          </div>
          {loading ? <p className="text-xs text-slate-500">Loading...</p> : !info ? null : (
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">PHPSESSID</dt><dd className="font-mono text-xs">{info.v2.phpsessid} <span className="text-slate-400">({info.v2.phpsessidLen})</span></dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">user_id</dt><dd className="font-mono text-xs">{info.v2.userId}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">expires_at</dt><dd className="font-mono text-xs">{info.v2.expiresAt}{info.v2.expiresAt !== "(empty)" && <span className="text-slate-400 ml-1">({new Date(Number(info.v2.expiresAt) * 1000).toLocaleDateString("id-ID")})</span>}</dd></div>
            </dl>
          )}
          <form onSubmit={(e) => { e.preventDefault(); saveProvider("v2", v2Phpsessid, v2UserId, v2ExpiresAt, setV2Saving, () => { setV2Phpsessid(""); setV2UserId(""); setV2ExpiresAt(""); }); }} className="space-y-2 border-t pt-3">
            <input type="text" placeholder="PHPSESSID baru" value={v2Phpsessid} onChange={(e) => setV2Phpsessid(e.target.value)} className="input font-mono text-xs" />
            <input type="text" placeholder="user_id" value={v2UserId} onChange={(e) => setV2UserId(e.target.value)} className="input font-mono text-xs" />
            <input type="text" placeholder="expires_at (unix timestamp)" value={v2ExpiresAt} onChange={(e) => setV2ExpiresAt(e.target.value)} className="input font-mono text-xs" />
            <button type="submit" disabled={v2Saving || !v2Phpsessid || !v2UserId || !v2ExpiresAt} className="btn btn-primary text-sm">{v2Saving ? "Saving..." : "Save V2 & Test"}</button>
          </form>
        </section>

        {/* V3 */}
        <section className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">⚡ Provider V3 (order)</h2>
            <span className="text-xs text-slate-500">PHPSESSID + user_id + expires_at</span>
          </div>
          {loading ? <p className="text-xs text-slate-500">Loading...</p> : !info ? null : (
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">PHPSESSID</dt><dd className="font-mono text-xs">{info.v3.phpsessid} <span className="text-slate-400">({info.v3.phpsessidLen})</span></dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">user_id</dt><dd className="font-mono text-xs">{info.v3.userId}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">expires_at</dt><dd className="font-mono text-xs">{info.v3.expiresAt}{info.v3.expiresAt !== "(empty)" && <span className="text-slate-400 ml-1">({new Date(Number(info.v3.expiresAt) * 1000).toLocaleDateString("id-ID")})</span>}</dd></div>
            </dl>
          )}
          <form onSubmit={(e) => { e.preventDefault(); saveProvider("v3", v3Phpsessid, v3UserId, v3ExpiresAt, setV3Saving, () => { setV3Phpsessid(""); setV3UserId(""); setV3ExpiresAt(""); }); }} className="space-y-2 border-t pt-3">
            <input type="text" placeholder="PHPSESSID baru" value={v3Phpsessid} onChange={(e) => setV3Phpsessid(e.target.value)} className="input font-mono text-xs" />
            <input type="text" placeholder="user_id" value={v3UserId} onChange={(e) => setV3UserId(e.target.value)} className="input font-mono text-xs" />
            <input type="text" placeholder="expires_at (unix timestamp)" value={v3ExpiresAt} onChange={(e) => setV3ExpiresAt(e.target.value)} className="input font-mono text-xs" />
            <button type="submit" disabled={v3Saving || !v3Phpsessid || !v3UserId || !v3ExpiresAt} className="btn btn-primary text-sm">{v3Saving ? "Saving..." : "Save V3 & Test"}</button>
          </form>
        </section>

        {/* V4 */}
        <section className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">🚀 Provider V4 (orderv5)</h2>
            <span className="text-xs text-slate-500">PHPSESSID + user_id + expires_at</span>
          </div>
          {loading ? <p className="text-xs text-slate-500">Loading...</p> : !info ? null : (
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">PHPSESSID</dt><dd className="font-mono text-xs">{info.v4.phpsessid} <span className="text-slate-400">({info.v4.phpsessidLen})</span></dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">user_id</dt><dd className="font-mono text-xs">{info.v4.userId}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">expires_at</dt><dd className="font-mono text-xs">{info.v4.expiresAt}{info.v4.expiresAt !== "(empty)" && <span className="text-slate-400 ml-1">({new Date(Number(info.v4.expiresAt) * 1000).toLocaleDateString("id-ID")})</span>}</dd></div>
            </dl>
          )}
          <form onSubmit={(e) => { e.preventDefault(); saveProvider("v4", v4Phpsessid, v4UserId, v4ExpiresAt, setV4Saving, () => { setV4Phpsessid(""); setV4UserId(""); setV4ExpiresAt(""); }); }} className="space-y-2 border-t pt-3">
            <input type="text" placeholder="PHPSESSID baru" value={v4Phpsessid} onChange={(e) => setV4Phpsessid(e.target.value)} className="input font-mono text-xs" />
            <input type="text" placeholder="user_id" value={v4UserId} onChange={(e) => setV4UserId(e.target.value)} className="input font-mono text-xs" />
            <input type="text" placeholder="expires_at (unix timestamp)" value={v4ExpiresAt} onChange={(e) => setV4ExpiresAt(e.target.value)} className="input font-mono text-xs" />
            <button type="submit" disabled={v4Saving || !v4Phpsessid || !v4UserId || !v4ExpiresAt} className="btn btn-primary text-sm">{v4Saving ? "Saving..." : "Save V4 & Test"}</button>
          </form>
        </section>

        <section className="card text-xs text-slate-600 space-y-2">
          <h3 className="font-semibold text-slate-900">ℹ️ Cara dapetin cookies</h3>
          <ol className="list-decimal list-inside space-y-1">
            <li>Login ke situs provider di browser</li>
            <li>F12 → tab <b>Application</b> → <b>Cookies</b></li>
            <li>Copy <code>PHPSESSID</code> + <code>user_id</code> + <code>expires_at</code></li>
            <li>Paste ke form provider yang sesuai → Save</li>
          </ol>
          <p className="pt-2 italic text-slate-500">
            Tiap provider akun terpisah, simpan sendiri-sendiri. Update salah satu gak ganggu yang lain.
          </p>
        </section>
      </main>
    </div>
  );
}
