"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface PriceRule {
  id: string;
  serviceCode: string;
  countryId: number;
  priceType: "fixed" | "multiply" | "markup";
  value: number;
  active: boolean;
}

interface Country {
  id: number;
  slug: string;
  name: string;
}

interface ServiceItem {
  code: string;
  name: string;
  priceIdr: number; // harga JUAL setelah pricing rule (dari /api/search/services)
  stock: number;
}

interface ProviderRow {
  countryId: number;
  countryName: string;
  code: string;
  name: string;
  cost: number; // harga ASLI ditznesia (recovered: kalau ada rule fixed yang sama, kita gak bisa tahu cost lewat search/services API)
  stock: number;
}

const PRICE_TYPES = [
  { value: "" as const, label: "— (Provider)" },
  { value: "fixed" as const, label: "Tetap" },
  { value: "multiply" as const, label: "Kalikan %" },
  { value: "markup" as const, label: "Tambahan +" },
];

type ServiceTab = "wa" | "tg";

export default function AdminPricing() {
  const [tab, setTab] = useState<ServiceTab>("wa");
  const [rules, setRules] = useState<PriceRule[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [rows, setRows] = useState<ProviderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [search, setSearch] = useState("");
  const [hideOutOfStock, setHideOutOfStock] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------- Load rules + countries ----------
  const fetchRules = useCallback(async () => {
    const res = await fetch("/api/admin/pricing");
    const data = await res.json();
    if (res.ok) setRules(data.data ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [rulesRes, countriesRes] = await Promise.all([
          fetch("/api/admin/pricing"),
          fetch("/api/search/countries"),
        ]);
        const rulesData = await rulesRes.json();
        const countriesData = await countriesRes.json();
        if (rulesRes.ok) setRules(rulesData.data ?? []);
        if (countriesRes.ok) setCountries(countriesData.data ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ---------- Crawl semua negara untuk service yg dipilih ----------
  // Kita fetch /api/search/services per-country (paralel batch). Ini berat tapi
  // dilakukan sekali per tab change, hasilnya di-cache di state.
  // PERHATIAN: priceIdr di response sudah harga JUAL (setelah rule), bukan cost.
  // Untuk akurasi cost display, lebih baik kita ambil langsung dari mars.
  const loadProviderRows = useCallback(
    async (svc: ServiceTab) => {
      if (countries.length === 0) return;
      setProgress({ done: 0, total: countries.length });
      const result: ProviderRow[] = [];
      const BATCH = 8;

      for (let i = 0; i < countries.length; i += BATCH) {
        const batch = countries.slice(i, i + BATCH);
        const promises = batch.map(async (c) => {
          try {
            const res = await fetch(
              `/api/admin/services?country=${c.id}&q=${svc}`
            );
            const data = await res.json();
            if (!res.ok) return;
            const items: ServiceItem[] = data.data ?? [];
            for (const item of items) {
              if (item.code.toLowerCase() === svc) {
                result.push({
                  countryId: c.id,
                  countryName: c.name,
                  code: item.code,
                  name: item.name,
                  cost: item.priceIdr, // dari /api/admin/services = harga ASLI ditznesia
                  stock: item.stock,
                });
                break;
              }
            }
          } catch {
            // skip
          }
        });
        await Promise.all(promises);
        setProgress({ done: Math.min(i + BATCH, countries.length), total: countries.length });
      }
      result.sort((a, b) => a.countryName.localeCompare(b.countryName));
      setRows(result);
      setProgress(null);
    },
    [countries]
  );

  useEffect(() => {
    setRows([]);
    if (countries.length > 0) loadProviderRows(tab);
  }, [tab, countries, loadProviderRows]);

  // ---------- Helpers ----------
  const findRule = useCallback(
    (countryId: number) =>
      rules.find((r) => r.serviceCode === tab && r.countryId === countryId),
    [rules, tab]
  );

  const defaultRule = useMemo(
    () => rules.find((r) => r.serviceCode === tab && r.countryId === 0),
    [rules, tab]
  );

  function formatRp(n: number): string {
    return `Rp ${n.toLocaleString("id-ID")}`;
  }

  // ---------- Auto-save ----------
  async function saveRule(
    countryId: number,
    priceType: "fixed" | "multiply" | "markup",
    value: number
  ) {
    try {
      const res = await fetch("/api/admin/pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceCode: tab,
          countryId,
          priceType,
          value,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "err", text: data.error ?? "Gagal save" });
        return;
      }
      await fetchRules();
      setMsg({ type: "ok", text: `${tab.toUpperCase()} #${countryId} tersimpan` });
    } catch {
      setMsg({ type: "err", text: "Network error" });
    }
  }

  function triggerSave(
    countryId: number,
    priceType: "fixed" | "multiply" | "markup",
    value: number
  ) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (value > 0) saveRule(countryId, priceType, value);
    }, 700);
  }

  async function deleteRule(id: string) {
    if (!confirm("Hapus rule ini? Harga balik ke harga provider.")) return;
    try {
      const res = await fetch("/api/admin/pricing", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        await fetchRules();
        setMsg({ type: "ok", text: "Rule dihapus" });
      }
    } catch {
      setMsg({ type: "err", text: "Network error" });
    }
  }

  async function lockAllToProvider() {
    if (
      !confirm(
        `Lock SEMUA negara ${tab.toUpperCase()} ke harga provider saat ini sebagai "Tetap"? (skip yang stok 0)`
      )
    )
      return;
    let saved = 0;
    for (const r of rows) {
      if (r.stock <= 0) continue;
      const existing = findRule(r.countryId);
      // Skip kalau udah ada rule fixed dengan value yang sama
      if (existing?.priceType === "fixed" && existing.value === r.cost) continue;
      try {
        const res = await fetch("/api/admin/pricing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            serviceCode: tab,
            countryId: r.countryId,
            priceType: "fixed",
            value: r.cost,
          }),
        });
        if (res.ok) saved++;
      } catch {
        // skip
      }
    }
    await fetchRules();
    setMsg({ type: "ok", text: `Lock ${saved} negara ke harga provider` });
  }

  // ---------- Auto-hide msg ----------
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3000);
    return () => clearTimeout(t);
  }, [msg]);

  // ---------- Filtered ----------
  const filtered = useMemo(() => {
    let r = rows;
    if (hideOutOfStock) r = r.filter((x) => x.stock > 0);
    if (search) {
      const q = search.toLowerCase();
      r = r.filter((x) => x.countryName.toLowerCase().includes(q));
    }
    return r;
  }, [rows, hideOutOfStock, search]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="font-bold">Admin · Pricing</h1>
          <div className="flex gap-2">
            <a href="/admin/orders" className="btn btn-secondary text-xs">
              Orders
            </a>
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

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        {/* Tabs */}
        <div className="flex items-center gap-2">
          {(["wa", "tg"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setTab(s)}
              className={`btn text-xs ${
                tab === s ? "btn-primary" : "btn-secondary"
              }`}
            >
              {s === "wa" ? "WA · WhatsApp" : "TG · Telegram"}
            </button>
          ))}
          <span className="text-xs text-slate-500 ml-2">
            {rules.filter((r) => r.serviceCode === tab).length} rule aktif
          </span>
        </div>

        {/* Info penjelasan */}
        <div className="card text-xs text-slate-600 space-y-1">
          <p>
            <b>Tetap</b>: override jadi harga eksak (mis. 5000 = Rp 5.000)
          </p>
          <p>
            <b>Kalikan %</b>: harga provider × persen (120 = +20%, 150 = 1.5×)
          </p>
          <p>
            <b>Tambahan +</b>: harga provider + nominal flat (mis. 500 = +Rp 500)
          </p>
          <p className="text-slate-500 italic pt-1">
            Service selain WA & TG ikut harga provider (tidak terpengaruh rule).
          </p>
        </div>

        {/* Default rule (countryId=0) */}
        <div className="card">
          <h2 className="font-semibold text-sm mb-2">
            Default {tab.toUpperCase()} (semua negara)
          </h2>
          <DefaultRuleEditor
            tab={tab}
            rule={defaultRule}
            onSaved={fetchRules}
          />
        </div>

        {/* Toolbar */}
        <div className="card">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="text"
                placeholder="Cari negara..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input text-sm w-64"
              />
              <label className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={hideOutOfStock}
                  onChange={(e) => setHideOutOfStock(e.target.checked)}
                />
                Sembunyikan stok 0
              </label>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => loadProviderRows(tab)}
                disabled={!!progress}
                className="btn btn-secondary text-xs"
              >
                {progress ? `${progress.done}/${progress.total}` : "Reload"}
              </button>
              <button
                onClick={lockAllToProvider}
                disabled={rows.length === 0 || !!progress}
                className="btn btn-primary text-xs"
              >
                🔒 Lock semua ke harga provider
              </button>
            </div>
          </div>

          {msg && (
            <div
              className={`rounded-lg p-2 text-xs border mb-3 ${
                msg.type === "ok"
                  ? "bg-green-50 border-green-200 text-green-800"
                  : "bg-red-50 border-red-200 text-red-700"
              }`}
            >
              {msg.text}
            </div>
          )}

          {/* Table */}
          {loading ? (
            <p className="text-xs text-slate-500">Loading...</p>
          ) : progress ? (
            <p className="text-xs text-slate-500">
              Mengambil data harga semua negara: {progress.done} / {progress.total}
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-slate-500">
              Tidak ada layanan {tab.toUpperCase()} ditemukan.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-[10px] text-slate-500 uppercase border-b">
                  <tr>
                    <th className="text-left py-2 pr-2">Negara</th>
                    <th className="text-left py-2 pr-2">Stok</th>
                    <th className="text-left py-2 pr-2">Harga Tampil</th>
                    <th className="text-left py-2 pr-2">Tipe</th>
                    <th className="text-left py-2 pr-2">Nilai</th>
                    <th className="text-right py-2 pr-2">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <RuleRow
                      key={r.countryId}
                      row={r}
                      rule={findRule(r.countryId)}
                      onSave={(type, val) => triggerSave(r.countryId, type, val)}
                      onDelete={(id) => deleteRule(id)}
                      formatRp={formatRp}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function DefaultRuleEditor({
  tab,
  rule,
  onSaved,
}: {
  tab: ServiceTab;
  rule: PriceRule | undefined;
  onSaved: () => void;
}) {
  const [type, setType] = useState<"fixed" | "multiply" | "markup">(
    rule?.priceType ?? "multiply"
  );
  const [value, setValue] = useState<number>(rule?.value ?? 0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setType((rule?.priceType as typeof type) ?? "multiply");
    setValue(rule?.value ?? 0);
  }, [rule]);

  async function save() {
    if (value <= 0) return;
    setSaving(true);
    try {
      await fetch("/api/admin/pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceCode: tab,
          countryId: 0,
          priceType: type,
          value,
        }),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    if (!rule) return;
    if (!confirm("Hapus default rule? Negara tanpa rule khusus akan ikut harga provider.")) return;
    await fetch("/api/admin/pricing", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rule.id }),
    });
    onSaved();
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        value={type}
        onChange={(e) => setType(e.target.value as typeof type)}
        className="input text-xs w-32"
      >
        <option value="multiply">Kalikan %</option>
        <option value="markup">Tambahan +</option>
        <option value="fixed">Tetap</option>
      </select>
      <input
        type="number"
        min={0}
        value={value || ""}
        onChange={(e) => setValue(Number(e.target.value))}
        className="input text-xs w-32"
        placeholder={
          type === "multiply" ? "120 = +20%" : type === "markup" ? "500 = +Rp500" : "5000 = Rp5000"
        }
      />
      <button
        onClick={save}
        disabled={saving || value <= 0}
        className="btn btn-primary text-xs"
      >
        {saving ? "..." : rule ? "Update default" : "Set default"}
      </button>
      {rule && (
        <button onClick={clear} className="btn btn-secondary text-xs">
          Hapus default
        </button>
      )}
      <span className="text-xs text-slate-500 ml-1">
        Default berlaku ke negara yang TIDAK punya rule khusus.
      </span>
    </div>
  );
}

function RuleRow({
  row,
  rule,
  onSave,
  onDelete,
  formatRp,
}: {
  row: ProviderRow;
  rule: PriceRule | undefined;
  onSave: (type: "fixed" | "multiply" | "markup", val: number) => void;
  onDelete: (id: string) => void;
  formatRp: (n: number) => string;
}) {
  const [type, setType] = useState<"" | "fixed" | "multiply" | "markup">(
    rule?.priceType ?? ""
  );
  const [value, setValue] = useState<number>(rule?.value ?? 0);

  useEffect(() => {
    setType(rule?.priceType ?? "");
    setValue(rule?.value ?? 0);
  }, [rule]);

  return (
    <tr className="border-b last:border-b-0 hover:bg-slate-50">
      <td className="py-1.5 pr-2">{row.countryName}</td>
      <td className="py-1.5 pr-2">
        <span
          className={`text-[10px] font-mono ${
            row.stock > 100 ? "text-green-600" : row.stock > 0 ? "text-amber-600" : "text-slate-400"
          }`}
        >
          {row.stock}
        </span>
      </td>
      <td className="py-1.5 pr-2 font-mono text-slate-600">
        {formatRp(row.cost)}
      </td>
      <td className="py-1.5 pr-2">
        <select
          value={type}
          onChange={(e) => {
            const t = e.target.value as typeof type;
            setType(t);
            if (t && value > 0) onSave(t, value);
          }}
          className="text-xs px-1.5 py-1 rounded border border-slate-300 bg-white"
        >
          {PRICE_TYPES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </td>
      <td className="py-1.5 pr-2">
        {type ? (
          <input
            type="number"
            min={0}
            value={value || ""}
            onChange={(e) => {
              const v = Number(e.target.value);
              setValue(v);
              if (v > 0) onSave(type as "fixed" | "multiply" | "markup", v);
            }}
            className="text-xs px-2 py-1 rounded border border-slate-300 w-24 font-mono"
            placeholder={
              type === "multiply" ? "120" : type === "markup" ? "500" : "5000"
            }
          />
        ) : (
          <span className="text-slate-400 text-xs">—</span>
        )}
      </td>
      <td className="py-1.5 pr-2 text-right">
        {rule ? (
          <button
            onClick={() => onDelete(rule.id)}
            className="text-[10px] text-red-600 hover:underline"
          >
            Hapus
          </button>
        ) : null}
      </td>
    </tr>
  );
}
