"use client";

import { type CSSProperties, Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
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

  // Móvil: con un itinerario en pantalla la búsqueda se pliega a una línea
  // (origen → destino) para dejar el mapa libre, y los pasos van en un panel
  // que se despliega desde abajo.
  const [editing, setEditing] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const collapsed = result != null && !editing;

  // Alto de lo que flota sobre el mapa en móvil, para correr debajo/encima
  // de ello los botones del mapa (tema, giro, zoom, atribución).
  const rootRef = useRef<HTMLDivElement>(null);
  const topOverlayRef = useRef<HTMLDivElement>(null);
  const bottomOverlayRef = useRef<HTMLDivElement>(null);
  const [overlayHeights, setOverlayHeights] = useState({ top: 0, bottom: 0 });
  const hasResult = result != null;
  useEffect(() => {
    const measure = () =>
      setOverlayHeights({
        top: topOverlayRef.current?.offsetHeight ?? 0,
        bottom: bottomOverlayRef.current?.offsetHeight ?? 0,
      });
    measure();
    const observer = new ResizeObserver(measure);
    if (topOverlayRef.current) observer.observe(topOverlayRef.current);
    if (bottomOverlayRef.current) observer.observe(bottomOverlayRef.current);
    return () => observer.disconnect();
  }, [hasResult]);
  const overlayVars = {
    "--map-overlay-top": `${overlayHeights.top}px`,
    "--map-overlay-bottom": `${overlayHeights.bottom}px`,
  } as CSSProperties;

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
      setEditing(false);
      setSheetOpen(false);
    } finally {
      setLoading(false);
    }
  }

  const pickLabel = pickMode === "origin" ? "origen" : "destino";

  return (
    <div
      ref={rootRef}
      style={overlayVars}
      className="planner-root relative h-[100dvh] overflow-hidden lg:h-auto lg:overflow-visible lg:max-w-6xl lg:mx-auto lg:px-4 lg:py-6 lg:grid lg:gap-6 lg:grid-cols-[380px_1fr]"
    >
      {/* En móvil este panel no ocupa sitio propio: la búsqueda flota arriba
          del mapa y el itinerario abajo. En escritorio es la columna lateral. */}
      <aside className="contents lg:block lg:order-1 lg:space-y-4">
        <div
          ref={topOverlayRef}
          className="absolute inset-x-0 top-0 z-[1100] px-2 pt-[max(0.5rem,env(safe-area-inset-top))] lg:static lg:p-0"
        >
          <div className="rounded-2xl bg-white/95 p-3 shadow-lg backdrop-blur lg:rounded-none lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none">
            {pickMode ? (
              <div className="flex items-center justify-between gap-3 lg:hidden">
                <p className="text-sm text-blue-700">
                  Toca el mapa para fijar el <span className="font-semibold">{pickLabel}</span>
                </p>
                <button
                  onClick={() => setPickMode(null)}
                  className="shrink-0 rounded-lg border border-slate-300 px-2.5 py-1 text-xs"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              collapsed && (
                <button
                  onClick={() => setEditing(true)}
                  className="flex w-full items-center gap-2 text-left lg:hidden"
                >
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block truncate">
                      <span className="text-blue-600">●</span> {originLabel}
                    </span>
                    <span className="block truncate">
                      <span className="text-red-600">●</span> {destinationLabel}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-lg border border-slate-300 px-2.5 py-1 text-xs">
                    Cambiar
                  </span>
                </button>
              )
            )}

            <div className={pickMode || collapsed ? "hidden lg:block" : ""}>
              <div className="mb-2 flex items-center justify-between lg:hidden">
                <Link href="/" className="flex items-center gap-2 text-sm font-bold text-blue-700">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[10px] text-white">
                    MM
                  </span>
                  ¿Cómo llego?
                </Link>
                <div className="flex items-center gap-3">
                  {result && (
                    <button onClick={() => setEditing(false)} className="text-xs text-slate-500">
                      Ocultar
                    </button>
                  )}
                  <Link href="/admin/login" className="text-xs font-medium text-slate-500">
                    Panel operador
                  </Link>
                </div>
              </div>

              <div className="hidden lg:block lg:mb-4">
                <h1 className="text-xl font-bold text-slate-900">¿Cómo llego?</h1>
                <p className="text-sm text-slate-500">
                  Indica tu origen y destino para encontrar la ruta más rápida en el sistema de
                  transporte.
                </p>
              </div>

              <div className="space-y-2">
                <div>
                  <label className="hidden text-xs font-semibold uppercase text-slate-500 lg:block">
                    Origen
                  </label>
                  <LocationSearchInput
                    placeholder="Origen: dirección o punto de referencia"
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
                  <label className="hidden text-xs font-semibold uppercase text-slate-500 lg:block">
                    Destino
                  </label>
                  <LocationSearchInput
                    placeholder="Destino: dirección o punto de referencia"
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
            </div>
          </div>
        </div>

        {result && (
          <div
            ref={bottomOverlayRef}
            className="absolute inset-x-0 bottom-0 z-[1100] rounded-t-2xl bg-white shadow-[0_-4px_16px_rgba(15,23,42,0.18)] pb-[env(safe-area-inset-bottom)] lg:static lg:rounded-none lg:bg-transparent lg:pb-0 lg:shadow-none"
          >
            <button
              onClick={() => setSheetOpen((v) => !v)}
              aria-expanded={sheetOpen}
              aria-label={sheetOpen ? "Ocultar itinerario" : "Ver itinerario"}
              className="flex w-full justify-center pt-2 pb-1 lg:hidden"
            >
              <span className="h-1.5 w-10 rounded-full bg-slate-300" />
            </button>

            <div className="space-y-3 px-3 pb-3 lg:p-0">
              {tracking && liveLocationError && (
                <p className="text-xs text-amber-700 lg:hidden">{liveLocationError}</p>
              )}

              <button
                onClick={() => setSheetOpen((v) => !v)}
                className="block w-full text-left lg:pointer-events-none"
                tabIndex={-1}
              >
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
                  <div className="flex items-center justify-between rounded-lg bg-blue-50 border border-blue-100 px-3 py-2.5">
                    <div>
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
                    <span className="text-xs font-medium text-blue-700 lg:hidden">
                      {sheetOpen ? "Ocultar pasos" : "Ver pasos"}
                    </span>
                  </div>
                )}
              </button>

              <ol
                className={`space-y-2 max-h-[45dvh] overflow-y-auto lg:block lg:max-h-none lg:overflow-visible ${
                  sheetOpen ? "" : "hidden"
                }`}
              >
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
          </div>
        )}
      </aside>

      <div className="absolute inset-0 lg:static lg:order-2">
        <LazyPlannerMap
          origin={origin}
          destination={destination}
          legs={noNearbyRoutes ? undefined : result?.legs}
          onMapClick={pickMode ? handleMapClick : undefined}
          userLocation={liveLocation}
          heightClassName="h-full lg:h-[70vh]"
          frameClassName="lg:rounded-xl lg:border lg:border-slate-200 lg:shadow-sm"
        />
        {tracking && liveLocationError && (
          <p className="mt-2 hidden text-xs text-amber-700 lg:block">{liveLocationError}</p>
        )}
        {pickMode && (
          <p className="mt-2 hidden text-xs text-blue-600 lg:block">
            Modo selección: toca el mapa para fijar el {pickLabel}.
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
