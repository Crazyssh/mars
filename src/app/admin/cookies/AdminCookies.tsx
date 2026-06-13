"use client";

import { useCallback, useEffect, useState } from "react";

interface ProviderInfo {
  phpsessid: string;
  userId: string;
  expiresAt: string;
  cfClearance: string;
  phpsessidLen: number;
  cfClearanceLen: number;
}

interface CookiesInfo {
  v1: ProviderInfo;
  v2: ProviderInfo;
  v3: ProviderInfo;
  v4: ProviderInfo;
}

type Provider = "v1" | "v2" | "v3" | "v4";

const PROVIDER_META: Record<Provider, { title: string; emoji: string }> = {
  v1: { title: "Provider V1 (orderv3)", emoji: "📦" },
  v2: { title: "Provider V2 (orderv2)", emoji: "🔄" },
  v3: { title: "Provider V3 (order)", emoji: "⚡" },
  v4: { title: "Provider V4 (orderv5)", emoji: "🚀" },
};

export default function AdminCookies() {
  const [info, setInfo] = useState<CookiesInfo | null>(null);
  const [loading, setLoading] = useState(true);
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

        {(["v1", "v2", "v3", "v4"] as Provider[]).map((p) => (
          <ProviderSection
            key={p}
            provider={p}
            loading={loading}
            info={info ? info[p] : null}
            onSaved={(m) => { setMsg(m); load(); }}
          />
        ))}

        <section className="card text-xs text-slate-600 space-y-2">
          <h3 className="font-semibold text-slate-900">ℹ️ Cara dapetin cookies</h3>
          <ol className="list-decimal list-inside space-y-1">
            <li>Login ke situs provider di browser</li>
            <li>F12 → tab <b>Application</b> → <b>Cookies</b></li>
            <li>Copy <code>PHPSESSID</code> + <code>user_id</code> + <code>expires_at</code> + <code>cf_clearance</code></li>
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

function ProviderSection(props: {
  provider: Provider;
  loading: boolean;
  info: ProviderInfo | null;
  onSaved: (m: { type: "ok" | "err" | "warn"; text: string }) => void;
}) {
  const { provider, loading, info } = props;
  const meta = PROVIDER_META[provider];

  const [phpsessid, setPhpsessid] = useState("");
  const [userId, setUserId] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [cfClearance, setCfClearance] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/admin/cookies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          phpsessid: phpsessid.trim(),
          userId: userId.trim(),
          expiresAt: expiresAt.trim(),
          cfClearance: cfClearance.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        props.onSaved({ type: "err", text: data.error ?? `Gagal save ${provider.toUpperCase()}` });
        return;
      }
      props.onSaved({
        type: data.warning ? "warn" : "ok",
        text: data.warning ? data.error : `✅ ${provider.toUpperCase()} cookies updated!`,
      });
      setPhpsessid(""); setUserId(""); setExpiresAt(""); setCfClearance("");
    } catch {
      props.onSaved({ type: "err", text: "Network error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{meta.emoji} {meta.title}</h2>
        <span className="text-xs text-slate-500">PHPSESSID + user_id + expires_at + cf_clearance</span>
      </div>
      {loading ? <p className="text-xs text-slate-500">Loading...</p> : !info ? <p className="text-xs text-slate-500">Gagal load.</p> : (
        <dl className="space-y-1 text-sm">
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
        <button type="submit" disabled={saving || !phpsessid || !userId || !expiresAt || !cfClearance} className="btn btn-primary text-sm">{saving ? "Saving..." : `Save ${provider.toUpperCase()} & Test`}</button>
      </form>
    </section>
  );
}
