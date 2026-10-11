"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import LazyPlannerMap from "@/components/LazyPlannerMap";
import type { UserLocation } from "@/components/PlannerMap";
import LocationSearchInput from "@/components/LocationSearchInput";
import { formatDuration, formatDistance } from "@/lib/format";
import type { Point } from "@/lib/geo";
import type { TripPlanResult } from "@/lib/routing";

type PickMode = "origin" | "destination" | null;

function HomePlanner() {
  const searchParams = useSearchParams();

  const [origin, setOrigin] = useState<Point | null>(null);
  const [originLabel, setOriginLabel] = useState("");
  const [destination, setDestination] = useState<Point | null>(() => {
    const to = searchParams.get("to");
    if (!to) return null;
    const [lat, lng] = to.split(",").map(Number);
    return Number.isNaN(lat) || Number.isNaN(lng) ? null : [lat, lng];
  });
  const [destinationLabel, setDestinationLabel] = useState(() => {
    const to = searchParams.get("to");
    if (!to) return "";
    const [lat, lng] = to.split(",").map(Number);
    return Number.isNaN(lat) || Number.isNaN(lng) ? "" : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  });
  const [pickMode, setPickMode] = useState<PickMode>(null);

  const [result, setResult] = useState<TripPlanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const [liveLocation, setLiveLocation] = useState<UserLocation | null>(null);
  const [liveLocationError, setLiveLocationError] = useState<string | null>(null);

  // Mientras hay un itinerario en pantalla se sigue la posición del usuario
  // en vivo (caminatas y tramos en ruta). Solo se dibuja el punto: la cámara
  // no lo persigue, así el mapa se puede explorar con libertad.
  const tracking = result != null;
  useEffect(() => {
    if (!tracking || !("geolocation" in navigator)) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setLiveLocation({
          point: [pos.coords.latitude, pos.coords.longitude],
          accuracyMeters: pos.coords.accuracy,
        });
        setLiveLocationError(null);
      },
      (err) => {
        setLiveLocationError(
          err.code === err.PERMISSION_DENIED
            ? "Activa el permiso de ubicación para verte en el mapa durante el viaje."
            : "No se pudo actualizar tu ubicación en vivo."
        );
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
    return () => {
      navigator.geolocation.clearWatch(watchId);
      setLiveLocation(null);
    };
  }, [tracking]);

  const noNearbyRoutes = result != null && result.legs.every((leg) => leg.kind === "WALK");

  function useMyLocation() {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p: Point = [pos.coords.latitude, pos.coords.longitude];
        setOrigin(p);
        setOriginLabel("Mi ubicación actual");
        setLocating(false);
      },
      () => {
        setError("No se pudo obtener tu ubicación. Revisa los permisos del navegador.");
        setLocating(false);
      }
    );
  }

  function handleMapClick(point: Point) {
    if (pickMode === "origin") {
      setOrigin(point);
      setOriginLabel(`${point[0].toFixed(5)}, ${point[1].toFixed(5)}`);
      setPickMode(null);
    } else if (pickMode === "destination") {
      setDestination(point);
      setDestinationLabel(`${point[0].toFixed(5)}, ${point[1].toFixed(5)}`);
      setPickMode(null);
    }
  }

  async function planTrip() {
    if (!origin || !destination) {
      setError("Selecciona un origen y un destino");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const url = `/api/trip-plan?fromLat=${origin[0]}&fromLng=${origin[1]}&toLat=${destination[0]}&toLng=${destination[1]}`;
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "No se encontró una ruta");
        return;
      }
      setResult(await res.json());
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 grid gap-6 lg:grid-cols-[380px_1fr]">
      <aside className="order-2 lg:order-1 space-y-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">¿Cómo llego?</h1>
          <p className="text-sm text-slate-500">
            Indica tu origen y destino para encontrar la ruta más rápida en el sistema de
            transporte.
          </p>
        </div>

        <div className="space-y-2">
          <div>
            <label className="text-xs font-semibold uppercase text-slate-500">Origen</label>
            <LocationSearchInput
              placeholder="Escribe una dirección o punto de referencia"
              value={originLabel}
              onSelect={(p, label) => {
                setOrigin(p);
                setOriginLabel(label);
              }}
            />
            <div className="mt-1 flex gap-2">
              <button
                onClick={useMyLocation}
                disabled={locating}
                className="text-xs rounded-lg border border-slate-300 px-2 py-1 hover:bg-slate-50 disabled:opacity-60"
              >
                {locating ? "Localizando…" : "Usar mi ubicación"}
              </button>
              <button
                onClick={() => setPickMode(pickMode === "origin" ? null : "origin")}
                className={`text-xs rounded-lg border px-2 py-1 ${
                  pickMode === "origin"
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-slate-300 hover:bg-slate-50"
                }`}
              >
                {pickMode === "origin" ? "Toca el mapa…" : "Elegir en el mapa"}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase text-slate-500">Destino</label>
            <LocationSearchInput
              placeholder="Escribe una dirección o punto de referencia"
              value={destinationLabel}
              onSelect={(p, label) => {
                setDestination(p);
                setDestinationLabel(label);
              }}
            />
            <div className="mt-1 flex gap-2">
              <button
                onClick={() => setPickMode(pickMode === "destination" ? null : "destination")}
                className={`text-xs rounded-lg border px-2 py-1 ${
                  pickMode === "destination"
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-slate-300 hover:bg-slate-50"
                }`}
              >
                {pickMode === "destination" ? "Toca el mapa…" : "Elegir en el mapa"}
              </button>
            </div>
          </div>

          <button
            onClick={planTrip}
            disabled={loading || !origin || !destination}
            className="w-full rounded-lg bg-blue-600 text-white text-sm font-medium py-2.5 hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "Buscando…" : "Buscar ruta más rápida"}
          </button>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        {result && (
          <div className="space-y-3">
            {noNearbyRoutes ? (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
                <div className="text-sm font-semibold text-amber-800">
                  No hay rutas de transporte cerca de tu origen o destino
                </div>
                <div className="mt-1 text-xs text-amber-700">
                  Te mostramos la distancia caminando directo:{" "}
                  {formatDistance(result.totalWalkMeters)} ({formatDuration(result.totalSeconds)})
                </div>
              </div>
            ) : (
              <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2.5">
                <div className="text-lg font-bold text-blue-800">
                  {formatDuration(result.totalSeconds)}
                </div>
                <div className="text-xs text-blue-700">
                  {formatDistance(result.totalWalkMeters)} caminando ·{" "}
                  {result.transfers === 0
                    ? "sin transbordos"
                    : `${result.transfers} transbordo${result.transfers > 1 ? "s" : ""}`}
                </div>
              </div>
            )}

            <ol className="space-y-2">
              {result.legs.map((leg, i) => (
                <li
                  key={i}
                  className="flex gap-3 rounded-lg border border-slate-200 px-3 py-2.5"
                >
                  <div
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                    style={{
                      backgroundColor: leg.kind === "WALK" ? "#475569" : leg.routeColor,
                    }}
                  >
                    {leg.kind === "WALK" ? "🚶" : leg.routeCode}
                  </div>
                  <div className="text-sm">
                    {leg.kind === "WALK" ? (
                      <div>
                        Camina {formatDistance(leg.distanceMeters)} ({formatDuration(leg.seconds)})
                        <div className="text-xs text-slate-500">
                          hasta {leg.toLabel}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <span className="font-semibold">{leg.routeName}</span>
                        <div className="text-xs text-slate-500">
                          {leg.informalBoarding ? "Sube en cualquier punto de la vía" : `Sube en ${leg.fromLabel}`}
                          {" → "}
                          {leg.toLabel}
                        </div>
                        <div className="text-xs text-slate-400">
                          {formatDistance(leg.distanceMeters)} · {formatDuration(leg.seconds)}
                        </div>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </aside>

      <div className="order-1 lg:order-2">
        <LazyPlannerMap
          origin={origin}
          destination={destination}
          legs={noNearbyRoutes ? undefined : result?.legs}
          onMapClick={pickMode ? handleMapClick : undefined}
          userLocation={liveLocation}
        />
        {tracking && liveLocationError && (
          <p className="mt-2 text-xs text-amber-700">{liveLocationError}</p>
        )}
        {pickMode && (
          <p className="mt-2 text-xs text-blue-600">
            Modo selección: toca el mapa para fijar el {pickMode === "origin" ? "origen" : "destino"}.
          </p>
        )}
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<div className="max-w-6xl mx-auto px-4 py-8 text-slate-500">Cargando…</div>}>
      <HomePlanner />
    </Suspense>
  );
}
