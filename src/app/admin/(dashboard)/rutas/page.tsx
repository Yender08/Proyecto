"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface RouteRow {
  id: string;
  code: string;
  name: string;
  color: string;
  active: boolean;
  stopCount: number;
  vehicleCount: number;
  activeVehicleCount: number;
}

export default function AdminRutasPage() {
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/routes")
      .then((r) => r.json())
      .then((data) => {
        setRoutes(data);
        setLoading(false);
      });
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Rutas</h1>
          <p className="text-sm text-slate-500">
            Trazados y paradas registrados del sistema de transporte.
          </p>
        </div>
        <Link
          href="/admin/rutas/nueva"
          className="rounded-lg bg-blue-600 text-white text-sm font-medium px-4 py-2 hover:bg-blue-700"
        >
          + Nueva ruta
        </Link>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Ruta</th>
              <th className="px-4 py-2">Paradas</th>
              <th className="px-4 py-2">Unidades activas</th>
              <th className="px-4 py-2">Total unidades</th>
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
            {!loading && routes.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Aún no hay rutas registradas.
                </td>
              </tr>
            )}
            {routes.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-2">
                  <Link href={`/admin/rutas/${r.id}`} className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: r.color }}
                    />
                    <span className="font-medium">{r.code}</span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-600">{r.name}</span>
                  </Link>
                </td>
                <td className="px-4 py-2">{r.stopCount}</td>
                <td className="px-4 py-2 text-green-700 font-medium">
                  {r.activeVehicleCount}
                </td>
                <td className="px-4 py-2">{r.vehicleCount}</td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      r.active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {r.active ? "Activa" : "Inactiva"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
