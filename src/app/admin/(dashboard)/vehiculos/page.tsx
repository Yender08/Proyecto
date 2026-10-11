"use client";

import { useEffect, useState } from "react";

interface VehicleRow {
  id: string;
  code: string;
  plate: string;
  capacity: number;
  status: "ACTIVE" | "MAINTENANCE" | "OUT_OF_SERVICE";
  routeId: string | null;
  routeCode: string | null;
  routeName: string | null;
}

interface RouteOption {
  id: string;
  code: string;
  name: string;
}

const STATUS_LABEL: Record<VehicleRow["status"], string> = {
  ACTIVE: "Activa",
  MAINTENANCE: "Mantenimiento",
  OUT_OF_SERVICE: "Fuera de servicio",
};

const STATUS_TONE: Record<VehicleRow["status"], string> = {
  ACTIVE: "bg-green-100 text-green-700",
  MAINTENANCE: "bg-amber-100 text-amber-700",
  OUT_OF_SERVICE: "bg-red-100 text-red-700",
};

export default function VehiculosPage() {
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ code: "", plate: "", routeId: "", capacity: 30 });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [vRes, rRes] = await Promise.all([
      fetch("/api/admin/vehicles"),
      fetch("/api/admin/routes"),
    ]);
    setVehicles(await vRes.json());
    const routeData = await rRes.json();
    setRoutes(routeData.map((r: RouteOption) => ({ id: r.id, code: r.code, name: r.name })));
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de datos al montar
    load();
  }, []);

  async function updateVehicle(id: string, patch: Partial<VehicleRow>) {
    await fetch(`/api/admin/vehicles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    load();
  }

  async function removeVehicle(id: string) {
    if (!confirm("¿Eliminar esta unidad?")) return;
    await fetch(`/api/admin/vehicles/${id}`, { method: "DELETE" });
    load();
  }

  async function createVehicle(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.code || !form.plate) {
      setError("Código y placa son requeridos");
      return;
    }
    setCreating(true);
    const res = await fetch("/api/admin/vehicles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: form.code,
        plate: form.plate,
        routeId: form.routeId || null,
        capacity: Number(form.capacity),
      }),
    });
    setCreating(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo crear la unidad");
      return;
    }
    setForm({ code: "", plate: "", routeId: "", capacity: 30 });
    load();
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Flota / Unidades</h1>
        <p className="text-sm text-slate-500">
          Asigna rutas, controla el estado operativo y da de alta nuevas unidades.
        </p>
      </div>

      <form
        onSubmit={createVehicle}
        className="rounded-xl border border-slate-200 bg-white p-4 grid gap-3 sm:grid-cols-5 items-end"
      >
        <div>
          <label className="text-xs font-semibold text-slate-500">Código</label>
          <input
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            placeholder="R1-06"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500">Placa</label>
          <input
            value={form.plate}
            onChange={(e) => setForm({ ...form, plate: e.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            placeholder="ABC123"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500">Ruta</label>
          <select
            value={form.routeId}
            onChange={(e) => setForm({ ...form, routeId: e.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">Sin asignar</option>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.code} · {r.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500">Capacidad</label>
          <input
            type="number"
            value={form.capacity}
            onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
            className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={creating}
          className="rounded-lg bg-blue-600 text-white text-sm font-medium py-2 hover:bg-blue-700 disabled:opacity-60"
        >
          {creating ? "Creando…" : "Agregar unidad"}
        </button>
        {error && <p className="sm:col-span-5 text-xs text-red-600">{error}</p>}
      </form>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Código</th>
              <th className="px-4 py-2">Placa</th>
              <th className="px-4 py-2">Ruta</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2"></th>
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
            {!loading && vehicles.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  No hay unidades registradas.
                </td>
              </tr>
            )}
            {vehicles.map((v) => (
              <tr key={v.id}>
                <td className="px-4 py-2 font-medium">{v.code}</td>
                <td className="px-4 py-2">{v.plate}</td>
                <td className="px-4 py-2">
                  <select
                    value={v.routeId ?? ""}
                    onChange={(e) => updateVehicle(v.id, { routeId: e.target.value || null } as never)}
                    className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                  >
                    <option value="">Sin asignar</option>
                    {routes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.code}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2">
                  <select
                    value={v.status}
                    onChange={(e) =>
                      updateVehicle(v.id, { status: e.target.value as VehicleRow["status"] })
                    }
                    className={`rounded-full px-2 py-1 text-xs font-medium ${STATUS_TONE[v.status]}`}
                  >
                    {Object.entries(STATUS_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => removeVehicle(v.id)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
