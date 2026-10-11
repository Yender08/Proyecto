"use client";

import { MapContainer, TileLayer, CircleMarker, Marker, Tooltip } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { RouteDTO, StopDTO } from "@/lib/types";
import { useMapTheme } from "@/lib/useMapTheme";
import {
  DARK_ATTRIBUTION,
  DARK_BASE_TILE_URL,
  DARK_LABELS_TILE_URL,
  DARK_MAX_NATIVE_ZOOM,
  LIGHT_ATTRIBUTION,
  LIGHT_TILE_URL,
} from "@/lib/mapTiles";
import { ROTATABLE_MAP_OPTIONS } from "@/lib/leafletRotate";
import MapThemeToggle from "@/components/MapThemeToggle";
import MapRotationControls from "@/components/MapRotationControls";
import RoadPolyline from "@/components/RoadPolyline";

const MARACAIBO_CENTER: [number, number] = [10.6427, -71.6125];

function userIcon() {
  return L.divIcon({
    className: "user-marker",
    html: `<div style="width:16px;height:16px;border-radius:50%;background:#2563eb;border:3px solid white;box-shadow:0 0 0 2px #2563eb;"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

export interface MapViewProps {
  routes?: RouteDTO[];
  stops?: StopDTO[];
  onStopClick?: (stopId: string) => void;
  userLocation?: [number, number] | null;
  center?: [number, number];
  zoom?: number;
  heightClassName?: string;
}

export default function MapView({
  routes = [],
  stops = [],
  onStopClick,
  userLocation,
  center,
  zoom = 13,
  heightClassName = "h-[70vh]",
}: MapViewProps) {
  const { dark, toggle } = useMapTheme();

  return (
    <div
      className={`relative w-full ${heightClassName} rounded-xl overflow-hidden border border-slate-200 shadow-sm`}
    >
      <MapThemeToggle dark={dark} onToggle={toggle} />
      <MapContainer
        center={center ?? MARACAIBO_CENTER}
        zoom={zoom}
        scrollWheelZoom
        {...ROTATABLE_MAP_OPTIONS}
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

        {routes.map((route) => (
          <RoadPolyline
            key={route.id}
            positions={route.path}
            color={route.color}
            opacity={0.75}
            casingColor={dark ? "#0f172a" : "#ffffff"}
          />
        ))}

        {stops.map((stop) => (
          <CircleMarker
            key={stop.id}
            center={[stop.lat, stop.lng]}
            radius={6}
            pathOptions={{ color: "#1e293b", fillColor: "#f8fafc", fillOpacity: 1, weight: 2 }}
            eventHandlers={{ click: () => onStopClick?.(stop.id) }}
          >
            <Tooltip direction="top" offset={[0, -6]}>{stop.name}</Tooltip>
          </CircleMarker>
        ))}

        {userLocation && (
          <Marker position={userLocation} icon={userIcon()}>
            <Tooltip direction="top" offset={[0, -6]}>Tu ubicación</Tooltip>
          </Marker>
        )}

        <MapRotationControls
          paths={routes.map((route) => route.path)}
          dark={dark}
          userPoint={userLocation}
        />
      </MapContainer>
    </div>
  );
}
