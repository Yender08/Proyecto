"use client";

import { MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents } from "react-leaflet";
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Point } from "@/lib/geo";
import type { ItineraryLeg } from "@/lib/routing";
import { useMapTheme } from "@/lib/useMapTheme";
import {
  DARK_ATTRIBUTION,
  DARK_BASE_TILE_URL,
  DARK_LABELS_TILE_URL,
  DARK_MAX_NATIVE_ZOOM,
  LIGHT_ATTRIBUTION,
  LIGHT_TILE_URL,
} from "@/lib/mapTiles";
import MapThemeToggle from "@/components/MapThemeToggle";
import RoadPolyline from "@/components/RoadPolyline";

const MARACAIBO_CENTER: [number, number] = [10.6427, -71.6125];

function pinIcon(color: string, label: string) {
  return L.divIcon({
    className: "planner-pin",
    html: `<div style="display:flex;flex-direction:column;align-items:center;width:60px;">
      <div style="width:14px;height:14px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,.5);"></div>
      <div style="margin-top:2px;font-size:10px;font-weight:700;color:${color};background:white;padding:0 4px;border-radius:4px;box-shadow:0 1px 2px rgba(0,0,0,.3);">${label}</div>
    </div>`,
    iconSize: [60, 40],
    // El punto (14px) queda centrado horizontalmente en el div de 60px, con
    // su propio centro a 7px del borde superior: el ancla debe apuntar ahí,
    // no a la esquina, para que el pin coincida con la coordenada real.
    iconAnchor: [30, 7],
  });
}

// Punto azul con pulso para la posición en vivo del usuario. El ancla va al
// centro exacto del icono para que coincida con la coordenada reportada.
const userLocationIcon = L.divIcon({
  className: "user-location-marker",
  html: `<div class="user-location-pulse"></div><div class="user-location-dot"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

export interface UserLocation {
  point: Point;
  accuracyMeters?: number;
}

/**
 * Botón para llevar la cámara a la ubicación del usuario. Solo mueve el mapa
 * cuando se toca: la posición en vivo nunca arrastra la cámara, así el
 * usuario puede explorar el mapa libremente mientras avanza.
 */
function RecenterButton({ point, dark }: { point: Point; dark: boolean }) {
  const map = useMap();
  const ref = useRef<HTMLButtonElement>(null);
  // Vive dentro del contenedor de Leaflet: sin esto el toque también llega
  // al mapa (y en modo selección fijaría el origen/destino ahí).
  useEffect(() => {
    if (!ref.current) return;
    L.DomEvent.disableClickPropagation(ref.current);
    L.DomEvent.disableScrollPropagation(ref.current);
  }, []);
  return (
    <button
      ref={ref}
      type="button"
      onClick={() => map.flyTo(point, Math.max(map.getZoom(), 16), { duration: 0.6 })}
      title="Centrar en mi ubicación"
      className={`absolute top-14 right-3 z-[1000] flex h-9 w-9 items-center justify-center rounded-full shadow-md border ${
        dark
          ? "bg-slate-800 text-sky-300 border-slate-600 hover:bg-slate-700"
          : "bg-white text-blue-600 border-slate-200 hover:bg-slate-50"
      }`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="3" fill="currentColor" />
        <circle cx="12" cy="12" r="8" />
        <path d="M12 1v3M12 20v3M1 12h3M20 12h3" />
      </svg>
    </button>
  );
}

function ClickHandler({ onClick }: { onClick: (p: Point) => void }) {
  useMapEvents({
    click(e) {
      onClick([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

export interface PlannerMapProps {
  origin?: Point | null;
  destination?: Point | null;
  legs?: ItineraryLeg[];
  onMapClick?: (point: Point) => void;
  userLocation?: UserLocation | null;
  heightClassName?: string;
}

export default function PlannerMap({
  origin,
  destination,
  legs = [],
  onMapClick,
  userLocation,
  heightClassName = "h-[70vh]",
}: PlannerMapProps) {
  const { dark, toggle } = useMapTheme();

  return (
    <div
      className={`relative w-full ${heightClassName} rounded-xl overflow-hidden border border-slate-200 shadow-sm`}
    >
      <MapThemeToggle dark={dark} onToggle={toggle} />
      <MapContainer
        center={origin ?? MARACAIBO_CENTER}
        zoom={13}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        {dark ? (
          <>
            <TileLayer
              attribution={DARK_ATTRIBUTION}
              url={DARK_BASE_TILE_URL}
              maxNativeZoom={DARK_MAX_NATIVE_ZOOM}
            />
            <TileLayer attribution="" url={DARK_LABELS_TILE_URL} maxNativeZoom={DARK_MAX_NATIVE_ZOOM} />
          </>
        ) : (
          <TileLayer attribution={LIGHT_ATTRIBUTION} url={LIGHT_TILE_URL} />
        )}

        {onMapClick && <ClickHandler onClick={onMapClick} />}

        {/* Solo se dibujan los tramos del itinerario calculado: ninguna otra
            ruta de la red se revela al público. */}
        {legs.map((leg, i) => (
          <RoadPolyline
            key={i}
            positions={leg.path}
            variant={leg.kind === "WALK" ? "walk" : "ride"}
            color={leg.kind === "WALK" ? "#f59e0b" : (leg.routeColor ?? "#2563eb")}
            casingColor={dark ? "#0f172a" : "#ffffff"}
          />
        ))}

        {origin && <Marker position={origin} icon={pinIcon("#2563eb", "Origen")} />}
        {destination && <Marker position={destination} icon={pinIcon("#dc2626", "Destino")} />}

        {userLocation && (
          <>
            {userLocation.accuracyMeters != null && userLocation.accuracyMeters > 0 && (
              <Circle
                center={userLocation.point}
                radius={userLocation.accuracyMeters}
                interactive={false}
                pathOptions={{ color: "#3b82f6", weight: 1, opacity: 0.4, fillOpacity: 0.12 }}
              />
            )}
            <Marker
              position={userLocation.point}
              icon={userLocationIcon}
              interactive={false}
              zIndexOffset={1000}
            />
            <RecenterButton point={userLocation.point} dark={dark} />
          </>
        )}
      </MapContainer>
    </div>
  );
}
