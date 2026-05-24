"use client";

import { useCallback, useEffect, useState } from "react";

interface User {
  id: string;
  email: string;
  name: string;
  role: "admin" | "user";
  createdAt: string;
}

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Form add
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Gagal load users");
        return;
      }
      setUsers(data.data ?? []);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setFormError("");
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, password, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error ?? "Gagal tambah user");
        return;
      }
      // Reset form
      setEmail("");
      setName("");
      setPassword("");
      setRole("user");
      load();
    } catch {
      setFormError("Network error");
    } finally {
      setAdding(false);
    }
  }

  async function deleteUser(id: string, email: string) {
    if (!confirm(`Yakin hapus user ${email}?`)) return;
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? "Gagal hapus");
      return;
    }
    load();
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="font-bold">Manage Users</h1>
          <a href="/" className="btn btn-secondary text-xs">
            ← Dashboard
          </a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Form */}
        <section className="card">
          <h2 className="font-semibold mb-3">➕ Tambah User</h2>
          <form onSubmit={addUser} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">
                Nama
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">
                Password (min 6)
              </label>
              <input
                type="text"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">
                Role
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "admin" | "user")}
                className="input"
              >
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
            </div>
            {formError && (
              <div className="sm:col-span-2 rounded-lg bg-red-50 text-red-700 text-sm p-3 border border-red-200">
                {formError}
              </div>
            )}
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={adding}
                className="btn btn-primary"
              >
                {adding ? "Adding..." : "Tambah User"}
              </button>
            </div>
          </form>
        </section>

        {/* List */}
        <section className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">👥 Daftar User ({users.length})</h2>
            <button onClick={load} className="text-xs text-primary hover:underline">
              Refresh
            </button>
          </div>
          {error && (
            <div className="rounded-lg bg-red-50 text-red-700 text-sm p-3 border border-red-200 mb-3">
              {error}
            </div>
          )}
          {loading ? (
            <p className="text-xs text-slate-500">Loading...</p>
          ) : users.length === 0 ? (
            <p className="text-xs text-slate-500">Belum ada user.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500 border-b">
                <tr>
                  <th className="text-left py-2">Email</th>
                  <th className="text-left py-2">Nama</th>
                  <th className="text-left py-2">Role</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b last:border-b-0">
                    <td className="py-2">{u.email}</td>
                    <td className="py-2">{u.name}</td>
                    <td className="py-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          u.role === "admin"
                            ? "bg-purple-100 text-purple-700"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="text-right py-2">
                      <button
                        onClick={() => deleteUser(u.id, u.email)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Hapus
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </div>
  );
}
