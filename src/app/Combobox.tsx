"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface ComboItem {
  value: string;
  label: string;
  hint?: string; // tampilkan di kanan (mis. stok atau ID)
}

interface ComboboxProps {
  items: ComboItem[];
  placeholder?: string;
  selected?: ComboItem | null;
  onSelect: (item: ComboItem) => void;
  disabled?: boolean;
  loading?: boolean;
  emptyMessage?: string;
}

/**
 * Combobox: input + chevron, klik buka dropdown, ketik = filter client-side.
 * Substring match case-insensitive di label.
 */
export default function Combobox({
  items,
  placeholder = "Pilih...",
  selected,
  onSelect,
  disabled = false,
  loading = false,
  emptyMessage = "Tidak ada hasil",
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown ketika click di luar
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Reset query ketika selected berubah dari luar
  useEffect(() => {
    setQuery("");
  }, [selected?.value]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return items;
    return items.filter(
      (it) =>
        it.label.toLowerCase().includes(q) ||
        it.value.toLowerCase().includes(q)
    );
  }, [items, query]);

  function handleSelect(item: ComboItem) {
    onSelect(item);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div
        className={`flex items-center gap-2 input cursor-text ${
          disabled ? "opacity-50 pointer-events-none" : ""
        }`}
        onClick={() => {
          if (!disabled) {
            setOpen(true);
            inputRef.current?.focus();
          }
        }}
      >
        <input
          ref={inputRef}
          type="text"
          placeholder={selected ? selected.label : placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          disabled={disabled}
          className="flex-1 outline-none bg-transparent text-sm"
        />
        {selected && !query && (
          <span className="text-slate-700 text-sm truncate">
            {/* placeholder visual */}
          </span>
        )}
        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
            if (!open) inputRef.current?.focus();
          }}
          className="text-slate-400 hover:text-slate-600 shrink-0"
          aria-label="Toggle dropdown"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={open ? "rotate-180 transition" : "transition"}
          >
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
      </div>

      {open && (
        <div className="absolute z-10 mt-1 w-full max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {loading ? (
            <div className="px-3 py-2 text-xs text-slate-500">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-500">{emptyMessage}</div>
          ) : (
            <ul>
              {filtered.map((it) => {
                const isSel = selected?.value === it.value;
                return (
                  <li key={it.value}>
                    <button
                      type="button"
                      onClick={() => handleSelect(it)}
                      className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-slate-100 ${
                        isSel ? "bg-blue-50 text-primary" : ""
                      }`}
                    >
                      <span className="truncate">{it.label}</span>
                      {it.hint && (
                        <span className="text-xs text-slate-400 ml-2 shrink-0">
                          {it.hint}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
