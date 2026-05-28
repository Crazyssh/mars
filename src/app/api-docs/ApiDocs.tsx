"use client";

import { useCallback, useEffect, useState } from "react";

interface KeyInfo {
  hasKey: boolean;
  masked: string | null;
  createdAt: string | null;
}

export default function ApiDocs({ userName }: { userName: string }) {
  const [info, setInfo] = useState<KeyInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/me/api-key");
      const data = await res.json();
      if (res.ok) setInfo(data.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function generate() {
    if (info?.hasKey && !confirm("Regenerate akan invalidate key lama. Lanjut?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/me/api-key", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "err", text: data.error ?? "Gagal generate" });
        return;
      }
      setRevealedKey(data.data.apiKey);
      setMsg({
        type: "ok",
        text: "✅ API key baru dibuat. Salin sekarang — gak akan ditampilkan lagi.",
      });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!confirm("Revoke API key? Semua request dengan key ini akan ditolak.")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/me/api-key", { method: "DELETE" });
      if (res.ok) {
        setRevealedKey(null);
        setMsg({ type: "ok", text: "API key di-revoke." });
        load();
      }
    } finally {
      setBusy(false);
    }
  }

  function copy(s: string) {
    navigator.clipboard.writeText(s).catch(() => {});
  }

  const baseUrl =
    typeof window !== "undefined" ? `${window.location.origin}` : "https://mars.kirimkode.com";
  const exampleKey = revealedKey || "<API_KEY>";

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="font-bold">API Docs</h1>
            <p className="text-xs text-slate-500">{userName}</p>
          </div>
          <a href="/" className="btn btn-secondary text-xs">
            ← Dashboard
          </a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* API Key management */}
        <section className="card">
          <h2 className="font-semibold mb-3">🔑 API Key kamu</h2>
          {loading ? (
            <p className="text-xs text-slate-500">Loading...</p>
          ) : !info?.hasKey ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Belum ada API key. Klik tombol di bawah buat generate.
              </p>
              <button onClick={generate} disabled={busy} className="btn btn-primary text-sm">
                {busy ? "..." : "Generate API Key"}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-sm space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">Key:</span>
                  <code className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">
                    {info.masked}
                  </code>
                </div>
                {info.createdAt && (
                  <div className="text-xs text-slate-500">
                    Dibuat: {new Date(info.createdAt).toLocaleString("id-ID")}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={generate} disabled={busy} className="btn btn-primary text-sm">
                  {busy ? "..." : "Regenerate"}
                </button>
                <button onClick={revoke} disabled={busy} className="btn btn-danger text-sm">
                  Revoke
                </button>
              </div>
            </div>
          )}

          {revealedKey && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
              <div className="text-xs font-semibold text-amber-900">
                ⚠️ Salin sekarang — setelah refresh halaman, key ini gak akan muncul lagi.
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 font-mono text-xs bg-white border border-amber-300 px-2 py-1.5 rounded break-all">
                  {revealedKey}
                </code>
                <button
                  onClick={() => copy(revealedKey)}
                  className="btn btn-primary text-xs"
                >
                  Copy
                </button>
              </div>
            </div>
          )}

          {msg && (
            <div
              className={`mt-3 rounded-lg p-2 text-xs border ${
                msg.type === "ok"
                  ? "bg-green-50 border-green-200 text-green-800"
                  : "bg-red-50 border-red-200 text-red-700"
              }`}
            >
              {msg.text}
            </div>
          )}
        </section>

        {/* Auth + base URL info */}
        <section className="card">
          <h2 className="font-semibold mb-3">🔐 Auth &amp; Base URL</h2>
          <div className="rounded-lg bg-slate-900 text-slate-100 p-3 text-xs space-y-1">
            <div>
              <span className="text-blue-400">Base URL:</span>{" "}
              <code className="text-amber-300">{baseUrl}/api/&lt;version&gt;</code>
            </div>
            <div className="text-slate-300">
              Version: <code>v1</code>, <code>v2</code>, <code>v3</code>,{" "}
              <code>v4</code>
            </div>
            <div className="pt-1">
              <span className="text-blue-400">Auth:</span> header{" "}
              <code className="text-amber-300">
                Authorization: Bearer {exampleKey}
              </code>
            </div>
            <div className="text-slate-400">
              Atau pakai <code>X-API-Key: {exampleKey}</code>
            </div>
          </div>
        </section>

        {/* Provider comparison table */}
        <section className="card">
          <h2 className="font-semibold mb-3">📋 Perbandingan Provider</h2>
          <p className="text-xs text-slate-600 mb-3">
            Endpoint &amp; auth sama, tinggal ganti version di URL. Tapi format
            param ada beberapa perbedaan kecil:
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase text-slate-500 border-b">
                <tr>
                  <th className="text-left py-2 pr-3">Provider</th>
                  <th className="text-left py-2 pr-3">Country param</th>
                  <th className="text-left py-2 pr-3">Service code</th>
                  <th className="text-left py-2 pr-3">Cancel min age</th>
                  <th className="text-left py-2 pr-3">Catatan</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="py-2 pr-3 font-mono font-bold">v1</td>
                  <td className="py-2 pr-3 font-mono">id (mis. 6)</td>
                  <td className="py-2 pr-3 font-mono">code (mis. wa)</td>
                  <td className="py-2 pr-3">2 menit</td>
                  <td className="py-2 pr-3 text-slate-600">orderId raw provider</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 pr-3 font-mono font-bold">v2</td>
                  <td className="py-2 pr-3 font-mono">id (mis. 6)</td>
                  <td className="py-2 pr-3 font-mono">code (mis. wa)</td>
                  <td className="py-2 pr-3">2 menit</td>
                  <td className="py-2 pr-3 text-slate-600">orderId obfuscated 8-digit</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 pr-3 font-mono font-bold">v3</td>
                  <td className="py-2 pr-3 font-mono">slug (mis. indonesia)</td>
                  <td className="py-2 pr-3 font-mono">code:operator</td>
                  <td className="py-2 pr-3">5 detik</td>
                  <td className="py-2 pr-3 text-slate-600">multi-operator, harga didiskon 40%</td>
                </tr>
                <tr>
                  <td className="py-2 pr-3 font-mono font-bold">v4</td>
                  <td className="py-2 pr-3 font-mono">id (mis. 6)</td>
                  <td className="py-2 pr-3 font-mono">code:operator</td>
                  <td className="py-2 pr-3">5 detik</td>
                  <td className="py-2 pr-3 text-slate-600">
                    operator harga sama di-merge, server random-pick saat order, harga diskon 40%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-3 text-xs text-slate-500 space-y-1">
            <p>
              <b>Recommendation:</b> kalau lo mau code yang reusable lintas provider,
              pakai{" "}
              <code className="bg-slate-100 px-1 rounded">{baseUrl}/api/vN/...</code>{" "}
              dengan flag konfigurasi untuk version. Format request/response konsisten.
            </p>
          </div>
        </section>

        {/* V1/V2: simple endpoints */}
        <section className="card space-y-4">
          <h2 className="font-semibold">📚 V1 / V2 Endpoints</h2>
          <p className="text-xs text-slate-600">
            Format simple: country pake numeric id, service pake code (mis.{" "}
            <code>wa</code>, <code>tg</code>).
          </p>

          <Endpoint
            method="GET"
            path="/api/vN/countries"
            desc="List negara tersedia."
            example={`curl -H "Authorization: Bearer ${exampleKey}" \\
  "${baseUrl}/api/v1/countries?q=indo"`}
            response={`{
  "data": [
    { "id": 6, "slug": "indonesia", "name": "indonesia" }
  ],
  "total": 1
}`}
          />

          <Endpoint
            method="GET"
            path="/api/vN/services"
            desc="List service untuk countryId."
            example={`curl -H "Authorization: Bearer ${exampleKey}" \\
  "${baseUrl}/api/v1/services?country=6&q=wa"`}
            response={`{
  "data": [
    { "code": "wa", "name": "whatsapp", "priceIdr": 2250, "stock": 33529 }
  ],
  "total": 1
}`}
          />

          <Endpoint
            method="POST"
            path="/api/vN/order"
            desc="Buat order baru."
            example={`curl -X POST \\
  -H "Authorization: Bearer ${exampleKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"countryId": 6, "service": "wa"}' \\
  ${baseUrl}/api/v1/order`}
            response={`{
  "data": {
    "orderId": "12345678",
    "number": "+628123456789",
    "service": "wa",
    "serviceName": "whatsapp",
    "country": "indonesia",
    "countryId": 6,
    "priceIdr": 2250,
    "status": "PENDING",
    "otp": null
  }
}

// Gagal:
{ "error": "Stok habis", "code": "OUT_OF_STOCK" }`}
          />
        </section>

        {/* V3: slug + multi-operator */}
        <section className="card space-y-4">
          <h2 className="font-semibold">📚 V3 Endpoints</h2>
          <p className="text-xs text-slate-600">
            Country pake <b>slug</b>, service punya <b>multi-operator</b>{" "}
            dengan harga &amp; stok berbeda. Service code format{" "}
            <code className="bg-slate-100 px-1 rounded">service:operator</code>.
          </p>

          <Endpoint
            method="GET"
            path="/api/v3/services"
            desc="List service per kombinasi service+operator (skip operator yg stok 0). Sort by harga ascending."
            example={`curl -H "Authorization: Bearer ${exampleKey}" \\
  "${baseUrl}/api/v3/services?country=indonesia&q=whatsapp"`}
            response={`{
  "data": [
    {
      "code": "whatsapp:virtual53",
      "name": "whatsapp (virtual53)",
      "service": "whatsapp",
      "operator": "virtual53",
      "priceIdr": 5250,
      "stock": 11946,
      "rate": "13.8%"
    },
    { "code": "whatsapp:virtual58", ... }
  ],
  "total": 2
}`}
          />

          <Endpoint
            method="POST"
            path="/api/v3/order"
            desc="Buat order. Field service WAJIB format service:operator."
            example={`curl -X POST \\
  -H "Authorization: Bearer ${exampleKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"countryId": "indonesia", "service": "whatsapp:virtual53"}' \\
  ${baseUrl}/api/v3/order`}
            response={`{
  "data": {
    "orderId": "82968131",
    "number": "+6285701720212",
    "service": "whatsapp:virtual53",
    "serviceName": "whatsapp",
    "country": "indonesia",
    "countryId": 66,
    "priceIdr": 5250,
    "status": "PENDING",
    "otp": null
  }
}`}
          />
        </section>

        {/* V4: numeric operator + dedup */}
        <section className="card space-y-4">
          <h2 className="font-semibold">📚 V4 Endpoints</h2>
          <p className="text-xs text-slate-600">
            Country pake <b>numeric id</b>, service multi-operator. Operator
            dengan harga sama di-<b>merge</b> di list (1 entry per harga unique,
            stok = total semua operator). Saat order, server random-pick operator.
            Service code format{" "}
            <code className="bg-slate-100 px-1 rounded">service:operatorId</code>.
          </p>
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
            ⚠️ Khusus v4: service <code>wa</code> &amp; <code>tg</code> dengan
            harga display di bawah Rp 2.000 disembunyikan dari list.
          </p>

          <Endpoint
            method="GET"
            path="/api/v4/services"
            desc="List service+harga unique. Operator yg ditampilkan = yg stok max di harga itu."
            example={`curl -H "Authorization: Bearer ${exampleKey}" \\
  "${baseUrl}/api/v4/services?country=6&q=wa"`}
            response={`{
  "data": [
    {
      "code": "wa:3197",
      "name": "whatsapp (3197)",
      "service": "wa",
      "operator": "3197",
      "priceIdr": 1304,
      "stock": 20
    },
    { "code": "wa:3211", "priceIdr": 8270, "stock": 217260 }
  ],
  "total": 27
}`}
          />

          <Endpoint
            method="POST"
            path="/api/v4/order"
            desc="Buat order. Server random-pick operator yang harganya sama dgn yg lo kirim."
            example={`curl -X POST \\
  -H "Authorization: Bearer ${exampleKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"countryId": 6, "service": "wa:3211"}' \\
  ${baseUrl}/api/v4/order`}
            response={`{
  "data": {
    "orderId": "29854227",
    "number": "+6283191525346",
    "service": "wa:3211",
    "serviceName": "whatsapp",
    "country": "indonesia",
    "countryId": 6,
    "priceIdr": 8270,
    "status": "PENDING",
    "otp": null
  }
}`}
          />
        </section>

        {/* Common: GET status + cancel */}
        <section className="card space-y-4">
          <h2 className="font-semibold">📚 Common Endpoints (semua versi)</h2>
          <p className="text-xs text-slate-600">
            Polling status &amp; cancel format sama persis untuk semua provider.
          </p>

          <Endpoint
            method="GET"
            path="/api/vN/order/:id"
            desc="Cek status + OTP. Polling tiap 3-5 detik sampai otp != null atau status terminal."
            example={`curl -H "Authorization: Bearer ${exampleKey}" \\
  ${baseUrl}/api/v1/order/12345678`}
            response={`{
  "data": {
    "orderId": "12345678",
    "number": "+628123456789",
    "service": "wa",
    "serviceName": "whatsapp",
    "country": "indonesia",
    "status": "Sukses",
    "otp": "123456",
    "createdAt": 1716624000
  }
}`}
          />

          <Endpoint
            method="POST"
            path="/api/vN/order/:id/cancel"
            desc="Batalkan order. v1/v2 min age 2 menit, v3/v4 min age 5 detik."
            example={`curl -X POST \\
  -H "Authorization: Bearer ${exampleKey}" \\
  ${baseUrl}/api/v3/order/82968131/cancel`}
            response={`{ "ok": true }

// Sebelum min age:
{
  "error": "Order can only be cancelled after 5 seconds. 3s remaining.",
  "code": "TOO_EARLY",
  "retryAfterSec": 3
}`}
          />
        </section>

        {/* Status reference */}
        <section className="card">
          <h2 className="font-semibold mb-3">📊 Status Values</h2>
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase text-slate-500 border-b">
              <tr>
                <th className="text-left py-2">Status</th>
                <th className="text-left py-2">Arti</th>
              </tr>
            </thead>
            <tbody>
              <Status v="PENDING" desc="Nomor sudah disewa, OTP belum masuk. Polling terus." />
              <Status v="Sukses" desc="OTP sudah diterima (cek field `otp`)." />
              <Status v="TIME OUT" desc="OTP gak masuk dalam ~20 menit. Order gagal." />
              <Status v="Dibatalkan" desc="Order di-cancel via /cancel atau system." />
            </tbody>
          </table>
        </section>

        {/* Errors */}
        <section className="card">
          <h2 className="font-semibold mb-3">❌ Error Codes</h2>
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase text-slate-500 border-b">
              <tr>
                <th className="text-left py-2">HTTP</th>
                <th className="text-left py-2">Arti</th>
              </tr>
            </thead>
            <tbody>
              <Status v="400" desc="Body / query invalid. Cek field `error`." />
              <Status v="401" desc="Missing / invalid API key." />
              <Status v="404" desc="Order ID gak ditemukan / bukan punya kamu." />
              <Status v="409" desc="Stok habis (untuk POST /order: termasuk error provider, cookies expired, rate limit — semua di-return sebagai stok habis)." />
              <Status v="502" desc="Provider error / cookies expired (selain endpoint /order). Hubungi admin." />
              <Status v="500" desc="Internal error." />
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}

function Endpoint({
  method,
  path,
  desc,
  example,
  response,
}: {
  method: string;
  path: string;
  desc: string;
  example: string;
  response: string;
}) {
  const color =
    method === "GET" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700";
  return (
    <div className="border border-slate-200 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${color}`}>
          {method}
        </span>
        <code className="text-sm font-mono">{path}</code>
      </div>
      <p className="text-xs text-slate-600">{desc}</p>
      <details>
        <summary className="text-xs text-primary cursor-pointer hover:underline">
          Contoh request & response
        </summary>
        <div className="mt-2 space-y-2">
          <div>
            <div className="text-[10px] uppercase text-slate-500 mb-1">Request</div>
            <pre className="bg-slate-900 text-slate-100 p-2 rounded text-[11px] overflow-x-auto whitespace-pre-wrap break-all">
              {example}
            </pre>
          </div>
          <div>
            <div className="text-[10px] uppercase text-slate-500 mb-1">Response</div>
            <pre className="bg-slate-50 border border-slate-200 p-2 rounded text-[11px] overflow-x-auto">
              {response}
            </pre>
          </div>
        </div>
      </details>
    </div>
  );
}

function Status({ v, desc }: { v: string; desc: string }) {
  return (
    <tr className="border-b last:border-b-0">
      <td className="py-1.5 pr-3">
        <code className="font-mono text-xs">{v}</code>
      </td>
      <td className="py-1.5 text-slate-600">{desc}</td>
    </tr>
  );
}
