"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import LazyAdminMap from "@/components/LazyAdminMap";
import LiveRecordControls from "@/components/LiveRecordControls";
import { useLiveTrack } from "@/lib/useLiveTrack";
import { polylineLengthMeters, type Point } from "@/lib/geo";
import { snapPathToRoads } from "@/lib/snapToRoad";
import type { RouteGeometryDTO } from "@/lib/types";

const COLOR_OPTIONS = [
  "#2563eb",
  "#16a34a",
  "#f97316",
  "#9333ea",
  "#dc2626",
  "#0891b2",
  "#ca8a04",
  "#be185d",
];

export default function NuevaRutaPage() {
  const router = useRouter();
  const [existingRoutes, setExistingRoutes] = useState<RouteGeometryDTO[]>([]);
  const [path, setPath] = useState<Point[]>([]);
  const [form, setForm] = useState({
    code: "",
    name: "",
    description: "",
    color: COLOR_OPTIONS[0],
    avgSpeedKmh: 18,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapping, setSnapping] = useState(false);

  const liveTrack = useLiveTrack((p) => setPath((prev) => [...prev, p]));

  async function snapToRoads() {
    setSnapping(true);
    setError(null);
    const result = await snapPathToRoads(path);
    setSnapping(false);
    if (!result) {
      setError("No se pudo ajustar el trazado a las calles. Intenta de nuevo o guarda el trazado dibujado.");
      return;
    }
    setPath(result.path);
  }

  useEffect(() => {
    fetch("/api/admin/routes")
      .then((r) => r.json())
      .then(setExistingRoutes)
      .catch(() => {});
  }, []);

  function undoLastPoint() {
    setPath((p) => p.slice(0, -1));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.code || !form.name) {
      setError("Código y nombre son requeridos");
      return;
    }
    if (path.length < 2) {
      setError("Dibuja el trazado en el mapa (mínimo 2 puntos)");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/admin/routes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, path }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo crear la ruta");
      return;
    }
    const created = await res.json();
    router.push(`/admin/rutas/${created.id}`);
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Nueva ruta</h1>
        <p className="text-sm text-slate-500">
          Haz clic sobre el mapa para ir trazando el recorrido de la ruta, en orden.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-500">Código</label>
            <input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="R1"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Nombre</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Bella Vista – Centro"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Descripción</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              rows={2}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Color</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {COLOR_OPTIONS.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setForm({ ...form, color: c })}
                  className={`h-7 w-7 rounded-full border-2 ${
                    form.color === c ? "border-slate-900" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">
              Velocidad promedio (km/h)
            </label>
            <input
              type="number"
              value={form.avgSpeedKmh}
              onChange={(e) => setForm({ ...form, avgSpeedKmh: Number(e.target.value) })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={undoLastPoint}
              disabled={path.length === 0 || liveTrack.recording}
              className="flex-1 rounded-lg border border-slate-300 text-xs font-medium py-2 hover:bg-slate-50 disabled:opacity-50"
            >
              Deshacer punto
            </button>
            <button
              type="button"
              onClick={() => setPath([])}
              disabled={path.length === 0 || liveTrack.recording}
              className="flex-1 rounded-lg border border-slate-300 text-xs font-medium py-2 hover:bg-slate-50 disabled:opacity-50"
            >
              Limpiar
            </button>
          </div>
          <p className="text-xs text-slate-400">{path.length} puntos trazados</p>

          <button
            type="button"
            onClick={snapToRoads}
            disabled={path.length < 2 || liveTrack.recording || snapping}
            className="w-full rounded-lg border border-blue-300 text-blue-700 text-xs font-medium py-2 hover:bg-blue-50 disabled:opacity-50"
          >
            {snapping ? "Ajustando al trazado real…" : "Ajustar a las calles"}
          </button>

          <LiveRecordControls
            recording={liveTrack.recording}
            error={liveTrack.error}
            accuracyMeters={liveTrack.accuracyMeters}
            distanceMeters={polylineLengthMeters(path)}
            pointCount={path.length}
            onStart={liveTrack.start}
            onStop={liveTrack.stop}
          />

          {error && <p className="text-xs text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-blue-600 text-white text-sm font-medium py-2.5 hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? "Guardando…" : "Guardar ruta"}
          </button>
        </div>

        <LazyAdminMap
          path={path}
          pathColor={form.color}
          backgroundRoutes={existingRoutes}
          onMapClick={liveTrack.recording ? undefined : (p) => setPath((prev) => [...prev, p])}
          livePosition={liveTrack.recording ? (path[path.length - 1] ?? null) : null}
        />
      </form>
    </div>
  );
}
