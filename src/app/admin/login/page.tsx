"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@movilidad-mcbo.local");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo iniciar sesión");
      return;
    }
    router.push("/admin");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm border border-slate-200"
      >
        <div className="mb-6 text-center">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white font-bold">
            MM
          </span>
          <h1 className="mt-3 text-lg font-bold text-slate-900">Panel de operación</h1>
          <p className="text-xs text-slate-500">Muévete Maracaibo — gestión de movilidad</p>
        </div>

        <label className="block text-xs font-semibold uppercase text-slate-500">
          Correo
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="mt-1 mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <label className="block text-xs font-semibold uppercase text-slate-500">
          Contraseña
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="mt-1 mb-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        {error && <p className="mb-3 text-xs text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-slate-900 text-white text-sm font-medium py-2.5 hover:bg-slate-700 disabled:opacity-60"
        >
          {loading ? "Ingresando…" : "Ingresar"}
        </button>
      </form>
    </div>
  );
}
