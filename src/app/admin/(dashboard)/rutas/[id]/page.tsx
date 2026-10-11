"use client";

import { useEffect, useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";
import LazyAdminMap from "@/components/LazyAdminMap";
import LiveRecordControls from "@/components/LiveRecordControls";
import { useLiveTrack } from "@/lib/useLiveTrack";
import { polylineLengthMeters, type Point } from "@/lib/geo";
import { snapPathToRoads } from "@/lib/snapToRoad";
import type { StopDTO } from "@/lib/types";

interface RouteDetail {
  id: string;
  code: string;
  name: string;
  description: string | null;
  color: string;
  avgSpeedKmh: number;
  active: boolean;
  path: Point[];
  stops: StopDTO[];
}

type Mode = "view" | "draw-path" | "add-stop";

export default function EditarRutaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const router = useRouter();

  const [route, setRoute] = useState<RouteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("view");
  const [draftPath, setDraftPath] = useState<Point[]>([]);
  const [pendingStop, setPendingStop] = useState<Point | null>(null);
  const [stopName, setStopName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapping, setSnapping] = useState(false);

  const liveTrack = useLiveTrack((p) => setDraftPath((prev) => [...prev, p]));

  async function snapToRoads() {
    setSnapping(true);
    setError(null);
    const result = await snapPathToRoads(draftPath);
    setSnapping(false);
    if (!result) {
      setError("No se pudo ajustar el trazado a las calles. Intenta de nuevo o guarda el trazado dibujado.");
      return;
    }
    setDraftPath(result.path);
  }

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/admin/routes/${id}`);
    if (res.ok) {
      const data = await res.json();
      setRoute(data);
      setDraftPath(data.path);
    }
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de datos al montar
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function saveMeta() {
    if (!route) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/admin/routes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: route.name,
        description: route.description,
        color: route.color,
        avgSpeedKmh: route.avgSpeedKmh,
        active: route.active,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError("No se pudieron guardar los cambios");
      return;
    }
    load();
  }

  async function savePath() {
    if (draftPath.length < 2) {
      setError("El trazado necesita al menos 2 puntos");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/admin/routes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: draftPath }),
    });
    setSaving(false);
    if (!res.ok) {
      setError("No se pudo guardar el trazado");
      return;
    }
    setMode("view");
    load();
  }

  async function confirmStop() {
    if (!pendingStop || !stopName.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/admin/routes/${id}/stops`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: stopName, lat: pendingStop[0], lng: pendingStop[1] }),
    });
    setSaving(false);
    if (res.ok) {
      setPendingStop(null);
      setStopName("");
      load();
    }
  }

  async function deleteStop(stopId: string) {
    if (!confirm("¿Eliminar esta parada?")) return;
    await fetch(`/api/admin/stops/${stopId}`, { method: "DELETE" });
    load();
  }

  async function deleteRoute() {
    if (!confirm(`¿Eliminar la ruta ${route?.code}? Esta acción no se puede deshacer.`)) return;
    await fetch(`/api/admin/routes/${id}`, { method: "DELETE" });
    router.push("/admin/rutas");
  }

  if (loading) return <div className="p-6 text-slate-500">Cargando…</div>;
  if (!route) return <div className="p-6 text-slate-500">Ruta no encontrada.</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: route.color }} />
            <h1 className="text-xl font-bold text-slate-900">
              {route.code} · {route.name}
            </h1>
          </div>
          <p className="text-sm text-slate-500">
            {route.stops.length} {route.stops.length === 1 ? "parada registrada" : "paradas registradas"}
          </p>
        </div>
        <button
          onClick={deleteRoute}
          className="rounded-lg border border-red-300 text-red-600 text-xs font-medium px-3 py-1.5 hover:bg-red-50"
        >
          Eliminar ruta
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <h2 className="text-xs font-semibold uppercase text-slate-500">Datos generales</h2>
            <div>
              <label className="text-xs text-slate-500">Nombre</label>
              <input
                value={route.name}
                onChange={(e) => setRoute({ ...route, name: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">Descripción</label>
              <textarea
                value={route.description ?? ""}
                onChange={(e) => setRoute({ ...route, description: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                rows={2}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">Velocidad promedio (km/h)</label>
              <input
                type="number"
                value={route.avgSpeedKmh}
                onChange={(e) => setRoute({ ...route, avgSpeedKmh: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={route.active}
                onChange={(e) => setRoute({ ...route, active: e.target.checked })}
              />
              Ruta activa (visible al público)
            </label>
            <button
              onClick={saveMeta}
              disabled={saving}
              className="w-full rounded-lg bg-slate-900 text-white text-xs font-medium py-2 hover:bg-slate-700 disabled:opacity-60"
            >
              Guardar datos
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <h2 className="text-xs font-semibold uppercase text-slate-500">Trazado</h2>
            {mode !== "draw-path" ? (
              <button
                onClick={() => {
                  setMode("draw-path");
                  setDraftPath(route.path);
                }}
                className="w-full rounded-lg border border-slate-300 text-xs font-medium py-2 hover:bg-slate-50"
              >
                Redibujar trazado
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-slate-500">
                  Haz clic en el mapa para agregar puntos. {draftPath.length} puntos.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setDraftPath((p) => p.slice(0, -1))}
                    disabled={liveTrack.recording}
                    className="flex-1 rounded-lg border border-slate-300 text-xs py-1.5 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Deshacer
                  </button>
                  <button
                    onClick={() => setDraftPath([])}
                    disabled={liveTrack.recording}
                    className="flex-1 rounded-lg border border-slate-300 text-xs py-1.5 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Limpiar
                  </button>
                </div>

                <button
                  onClick={snapToRoads}
                  disabled={draftPath.length < 2 || liveTrack.recording || snapping}
                  className="w-full rounded-lg border border-blue-300 text-blue-700 text-xs font-medium py-2 hover:bg-blue-50 disabled:opacity-50"
                >
                  {snapping ? "Ajustando al trazado real…" : "Ajustar a las calles"}
                </button>

                <LiveRecordControls
                  recording={liveTrack.recording}
                  error={liveTrack.error}
                  accuracyMeters={liveTrack.accuracyMeters}
                  distanceMeters={polylineLengthMeters(draftPath)}
                  pointCount={draftPath.length}
                  onStart={liveTrack.start}
                  onStop={liveTrack.stop}
                />

                <div className="flex gap-2">
                  <button
                    onClick={savePath}
                    disabled={saving || liveTrack.recording}
                    className="flex-1 rounded-lg bg-blue-600 text-white text-xs font-medium py-2 hover:bg-blue-700 disabled:opacity-60"
                  >
                    Guardar trazado
                  </button>
                  <button
                    onClick={() => {
                      liveTrack.stop();
                      setMode("view");
                      setDraftPath(route.path);
                    }}
                    className="flex-1 rounded-lg border border-slate-300 text-xs py-2 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <h2 className="text-xs font-semibold uppercase text-slate-500">Paradas</h2>
            {mode !== "add-stop" ? (
              <button
                onClick={() => setMode("add-stop")}
                className="w-full rounded-lg border border-slate-300 text-xs font-medium py-2 hover:bg-slate-50"
              >
                Agregar parada (clic en el mapa)
              </button>
            ) : (
              <div className="space-y-2">
                {pendingStop ? (
                  <>
                    <p className="text-xs text-slate-500">
                      Nueva parada en {pendingStop[0].toFixed(5)}, {pendingStop[1].toFixed(5)}
                    </p>
                    <input
                      value={stopName}
                      onChange={(e) => setStopName(e.target.value)}
                      placeholder="Nombre de la parada"
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={confirmStop}
                        disabled={saving || !stopName.trim()}
                        className="flex-1 rounded-lg bg-blue-600 text-white text-xs font-medium py-2 hover:bg-blue-700 disabled:opacity-60"
                      >
                        Guardar parada
                      </button>
                      <button
                        onClick={() => setPendingStop(null)}
                        className="flex-1 rounded-lg border border-slate-300 text-xs py-2 hover:bg-slate-50"
                      >
                        Cancelar
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-slate-500">Haz clic en el mapa para ubicar la parada.</p>
                )}
                <button
                  onClick={() => {
                    setMode("view");
                    setPendingStop(null);
                  }}
                  className="w-full rounded-lg border border-slate-300 text-xs py-1.5 hover:bg-slate-50"
                >
                  Terminar
                </button>
              </div>
            )}

            <ul className="space-y-1 max-h-64 overflow-y-auto">
              {route.stops.map((s, i) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-slate-50 text-sm"
                >
                  <span>
                    <span className="text-slate-400 text-xs mr-1">{i + 1}.</span>
                    {s.name}
                  </span>
                  <button
                    onClick={() => deleteStop(s.id)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Eliminar
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <LazyAdminMap
          path={mode === "draw-path" ? draftPath : route.path}
          pathColor={route.color}
          stops={route.stops}
          center={route.path[Math.floor(route.path.length / 2)]}
          onMapClick={
            mode === "draw-path" && !liveTrack.recording
              ? (p) => setDraftPath((prev) => [...prev, p])
              : mode === "add-stop"
                ? (p) => setPendingStop(p)
                : undefined
          }
          livePosition={
            mode === "draw-path" && liveTrack.recording
              ? (draftPath[draftPath.length - 1] ?? null)
              : null
          }
        />
      </div>
    </div>
  );
}
