"use client";

import { useCallback, useEffect, useState } from "react";

interface CookiesInfo {
  v1: {
    phpsessid: string;
    cfClearance: string;
    phpsessidLen: number;
    cfClearanceLen: number;
  };
  v2: {
    phpsessid: string;
    userId: string;
    expiresAt: string;
    phpsessidLen: number;
  };
}

export default function AdminCookies() {
  const [info, setInfo] = useState<CookiesInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: "ok" | "err" | "warn"; text: string } | null>(null);

  // V1 form
  const [v1Phpsessid, setV1Phpsessid] = useState("");
  const [v1CfClearance, setV1CfClearance] = useState("");
  const [v1Saving, setV1Saving] = useState(false);

  // V2 form
  const [v2Phpsessid, setV2Phpsessid] = useState("");
  const [v2UserId, setV2UserId] = useState("");
  const [v2ExpiresAt, setV2ExpiresAt] = useState("");
  const [v2Saving, setV2Saving] = useState(false);

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

  async function saveV1(e: React.FormEvent) {
    e.preventDefault();
    setV1Saving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/cookies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "v1",
          phpsessid: v1Phpsessid.trim(),
          cfClearance: v1CfClearance.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "err", text: data.error ?? "Gagal save V1" });
        return;
      }
      if (data.warning) {
        setMsg({ type: "warn", text: data.error });
      } else {
        setMsg({ type: "ok", text: "✅ V1 cookies updated!" });
      }
      setV1Phpsessid("");
      setV1CfClearance("");
      load();
    } catch {
      setMsg({ type: "err", text: "Network error" });
    } finally {
      setV1Saving(false);
    }
  }

  async function saveV2(e: React.FormEvent) {
    e.preventDefault();
    setV2Saving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/cookies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "v2",
          phpsessid: v2Phpsessid.trim(),
          userId: v2UserId.trim(),
          expiresAt: v2ExpiresAt.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "err", text: data.error ?? "Gagal save V2" });
        return;
      }
      if (data.warning) {
        setMsg({ type: "warn", text: data.error });
      } else {
        setMsg({ type: "ok", text: "✅ V2 cookies updated!" });
      }
      setV2Phpsessid("");
      setV2UserId("");
      setV2ExpiresAt("");
      load();
    } catch {
      setMsg({ type: "err", text: "Network error" });
    } finally {
      setV2Saving(false);
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
            <a href="/" className="btn btn-secondary text-xs">
              ← Dashboard
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
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

        {/* V1 Section */}
        <section className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">📦 Provider V1 (orderv3)</h2>
            <span className="text-xs text-slate-500">PHPSESSID + cf_clearance</span>
          </div>

          {loading ? (
            <p className="text-xs text-slate-500">Loading...</p>
          ) : !info ? (
            <p className="text-xs text-slate-500">Gagal load.</p>
          ) : (
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">PHPSESSID</dt>
                <dd className="font-mono text-xs">
                  {info.v1.phpsessid}{" "}
                  <span className="text-slate-400">({info.v1.phpsessidLen})</span>
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">cf_clearance</dt>
                <dd className="font-mono text-xs">
                  {info.v1.cfClearance}{" "}
                  <span className="text-slate-400">({info.v1.cfClearanceLen})</span>
                </dd>
              </div>
            </dl>
          )}

          <form onSubmit={saveV1} className="space-y-2 border-t pt-3">
            <input
              type="text"
              placeholder="PHPSESSID baru"
              value={v1Phpsessid}
              onChange={(e) => setV1Phpsessid(e.target.value)}
              className="input font-mono text-xs"
            />
            <textarea
              placeholder="cf_clearance baru (FULL string, 200+ char)"
              value={v1CfClearance}
              onChange={(e) => setV1CfClearance(e.target.value)}
              className="input font-mono text-xs min-h-[80px]"
            />
            <button
              type="submit"
              disabled={v1Saving || !v1Phpsessid || !v1CfClearance}
              className="btn btn-primary text-sm"
            >
              {v1Saving ? "Saving..." : "Save V1 & Test"}
            </button>
          </form>
        </section>

        {/* V2 Section */}
        <section className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">🔄 Provider V2 (orderv2)</h2>
            <span className="text-xs text-slate-500">
              PHPSESSID + user_id + expires_at
            </span>
          </div>

          {loading ? (
            <p className="text-xs text-slate-500">Loading...</p>
          ) : !info ? (
            <p className="text-xs text-slate-500">Gagal load.</p>
          ) : (
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">PHPSESSID</dt>
                <dd className="font-mono text-xs">
                  {info.v2.phpsessid}{" "}
                  <span className="text-slate-400">({info.v2.phpsessidLen})</span>
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">user_id</dt>
                <dd className="font-mono text-xs">{info.v2.userId}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">expires_at</dt>
                <dd className="font-mono text-xs">
                  {info.v2.expiresAt}
                  {info.v2.expiresAt !== "(empty)" && (
                    <span className="text-slate-400 ml-1">
                      ({new Date(Number(info.v2.expiresAt) * 1000).toLocaleDateString("id-ID")})
                    </span>
                  )}
                </dd>
              </div>
            </dl>
          )}

          <form onSubmit={saveV2} className="space-y-2 border-t pt-3">
            <input
              type="text"
              placeholder="PHPSESSID baru"
              value={v2Phpsessid}
              onChange={(e) => setV2Phpsessid(e.target.value)}
              className="input font-mono text-xs"
            />
            <input
              type="text"
              placeholder="user_id (mis. 156279)"
              value={v2UserId}
              onChange={(e) => setV2UserId(e.target.value)}
              className="input font-mono text-xs"
            />
            <input
              type="text"
              placeholder="expires_at (unix timestamp, mis. 1780467200)"
              value={v2ExpiresAt}
              onChange={(e) => setV2ExpiresAt(e.target.value)}
              className="input font-mono text-xs"
            />
            <button
              type="submit"
              disabled={
                v2Saving || !v2Phpsessid || !v2UserId || !v2ExpiresAt
              }
              className="btn btn-primary text-sm"
            >
              {v2Saving ? "Saving..." : "Save V2 & Test"}
            </button>
          </form>
        </section>

        {/* Cara dapetin */}
        <section className="card text-xs text-slate-600 space-y-2">
          <h3 className="font-semibold text-slate-900">ℹ️ Cara dapetin cookies</h3>
          <ol className="list-decimal list-inside space-y-1">
            <li>Login ke situs provider di browser</li>
            <li>F12 → tab <b>Application</b> → <b>Cookies</b></li>
            <li>Untuk V1 (orderv3): copy <code>PHPSESSID</code> + <code>cf_clearance</code></li>
            <li>Untuk V2 (orderv2): copy <code>PHPSESSID</code> + <code>user_id</code> + <code>expires_at</code></li>
            <li>Paste ke form di atas → Save</li>
          </ol>
          <p className="pt-2 italic text-slate-500">
            Cookies tersimpan di DB, langsung apply tanpa restart server. V1 &amp;
            V2 simpan terpisah — update salah satu gak ganggu yang lain.
          </p>
        </section>
      </main>
    </div>
  );
}
