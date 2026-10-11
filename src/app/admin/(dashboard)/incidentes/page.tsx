"use client";

import { useEffect, useState } from "react";
import type { IncidentDTO } from "@/lib/types";

interface RouteOption {
  id: string;
  code: string;
  name: string;
}

const TYPE_LABEL: Record<IncidentDTO["type"], string> = {
  ACCIDENTE: "Accidente",
  AVERIA: "Avería",
  TRAFICO: "Tráfico",
  DESVIO: "Desvío",
  OTRO: "Otro",
};

const STATUS_LABEL: Record<IncidentDTO["status"], string> = {
  ABIERTA: "Abierta",
  EN_ATENCION: "En atención",
  RESUELTA: "Resuelta",
};

const STATUS_TONE: Record<IncidentDTO["status"], string> = {
  ABIERTA: "bg-red-100 text-red-700",
  EN_ATENCION: "bg-amber-100 text-amber-700",
  RESUELTA: "bg-green-100 text-green-700",
};

export default function IncidentesPage() {
  const [incidents, setIncidents] = useState<IncidentDTO[]>([]);
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    type: "TRAFICO" as IncidentDTO["type"],
    description: "",
    routeId: "",
    lat: "10.6427",
    lng: "-71.6125",
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [iRes, rRes] = await Promise.all([
      fetch("/api/admin/incidents"),
      fetch("/api/admin/routes"),
    ]);
    setIncidents(await iRes.json());
    const routeData = await rRes.json();
    setRoutes(routeData.map((r: RouteOption) => ({ id: r.id, code: r.code, name: r.name })));
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de datos al montar
    load();
  }, []);

  async function updateStatus(id: string, status: IncidentDTO["status"]) {
    await fetch(`/api/admin/incidents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  async function createIncident(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.description.trim()) {
      setError("Describe la incidencia");
      return;
    }
    setCreating(true);
    const res = await fetch("/api/admin/incidents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: form.type,
        description: form.description,
        routeId: form.routeId || null,
        lat: Number(form.lat),
        lng: Number(form.lng),
      }),
    });
    setCreating(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo registrar la incidencia");
      return;
    }
    setForm({ ...form, description: "" });
    load();
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Incidencias</h1>
        <p className="text-sm text-slate-500">
          Registra y da seguimiento a accidentes, averías, tráfico y desvíos.
        </p>
      </div>

      <form
        onSubmit={createIncident}
        className="rounded-xl border border-slate-200 bg-white p-4 grid gap-3 sm:grid-cols-6 items-end"
      >
        <div>
          <label className="text-xs font-semibold text-slate-500">Tipo</label>
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as IncidentDTO["type"] })}
            className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            {Object.entries(TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-slate-500">Descripción</label>
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            placeholder="Describe lo ocurrido"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500">Ruta afectada</label>
          <select
            value={form.routeId}
            onChange={(e) => setForm({ ...form, routeId: e.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">Sin especificar</option>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.code}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500">Latitud</label>
          <input
            value={form.lat}
            onChange={(e) => setForm({ ...form, lat: e.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-xs font-semibold text-slate-500">Longitud</label>
            <input
              value={form.lng}
              onChange={(e) => setForm({ ...form, lng: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={creating}
          className="sm:col-span-6 rounded-lg bg-blue-600 text-white text-sm font-medium py-2 hover:bg-blue-700 disabled:opacity-60"
        >
          {creating ? "Registrando…" : "Registrar incidencia"}
        </button>
        {error && <p className="sm:col-span-6 text-xs text-red-600">{error}</p>}
      </form>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Tipo</th>
              <th className="px-4 py-2">Descripción</th>
              <th className="px-4 py-2">Ruta</th>
              <th className="px-4 py-2">Reportada</th>
              <th className="px-4 py-2">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Cargando…
                </td>
              </tr>
            )}
            {!loading && incidents.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  No hay incidencias registradas.
                </td>
              </tr>
            )}
            {incidents.map((i) => (
              <tr key={i.id}>
                <td className="px-4 py-2 font-medium">{TYPE_LABEL[i.type]}</td>
                <td className="px-4 py-2 text-slate-600">{i.description}</td>
                <td className="px-4 py-2">{i.routeCode ?? "—"}</td>
                <td className="px-4 py-2 text-slate-400 text-xs">
                  {new Date(i.createdAt).toLocaleString("es-VE")}
                </td>
                <td className="px-4 py-2">
                  <select
                    value={i.status}
                    onChange={(e) =>
                      updateStatus(i.id, e.target.value as IncidentDTO["status"])
                    }
                    className={`rounded-full px-2 py-1 text-xs font-medium ${STATUS_TONE[i.status]}`}
                  >
                    {Object.entries(STATUS_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
