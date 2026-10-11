"use client";

import { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Marker,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Point } from "@/lib/geo";
import type { RouteGeometryDTO, StopDTO } from "@/lib/types";
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

const MARACAIBO_CENTER: [number, number] = [10.6427, -71.6125];

function pointIcon(label: string) {
  return L.divIcon({
    className: "path-point-marker",
    html: `<div style="display:flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#2563eb;color:white;font-size:10px;font-weight:600;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4);">${label}</div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

function liveIcon() {
  return L.divIcon({
    className: "live-position-marker",
    html: `<div style="position:relative;width:18px;height:18px;">
      <div style="position:absolute;inset:0;border-radius:50%;background:#dc2626;opacity:.35;animation:mvb-pulse 1.4s ease-out infinite;"></div>
      <div style="position:absolute;top:4px;left:4px;width:10px;height:10px;border-radius:50%;background:#dc2626;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.5);"></div>
    </div>
    <style>@keyframes mvb-pulse{0%{transform:scale(0.6);opacity:.5}100%{transform:scale(2.2);opacity:0}}</style>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function ClickHandler({ onClick }: { onClick: (p: Point) => void }) {
  useMapEvents({
    click(e) {
      onClick([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

function FollowPoint({ point }: { point: Point }) {
  const map = useMap();
  useEffect(() => {
    map.panTo(point, { animate: true });
  }, [map, point]);
  return null;
}

export interface AdminMapProps {
  path?: Point[];
  pathColor?: string;
  backgroundRoutes?: RouteGeometryDTO[];
  stops?: StopDTO[];
  onMapClick?: (point: Point) => void;
  center?: Point;
  zoom?: number;
  heightClassName?: string;
  livePosition?: Point | null;
}

export default function AdminMap({
  path = [],
  pathColor = "#2563eb",
  backgroundRoutes = [],
  stops = [],
  onMapClick,
  center,
  zoom = 13,
  heightClassName = "h-[60vh]",
  livePosition,
}: AdminMapProps) {
  const showNumbers = path.length <= 40;
  const { dark, toggle } = useMapTheme();

  return (
    <div className={`relative w-full ${heightClassName} rounded-xl overflow-hidden border border-slate-200`}>
      <MapThemeToggle dark={dark} onToggle={toggle} />
      <MapContainer
        center={center ?? path[0] ?? MARACAIBO_CENTER}
        zoom={zoom}
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
        {livePosition && <FollowPoint point={livePosition} />}

        {backgroundRoutes.map((r) => (
          <Polyline
            key={r.id}
            positions={r.path}
            pathOptions={{ color: dark ? "#64748b" : "#94a3b8", weight: 2, opacity: 0.5 }}
          />
        ))}

        {path.length > 1 && (
          <Polyline positions={path} pathOptions={{ color: pathColor, weight: 4, opacity: 0.85 }} />
        )}

        {path.map((p, i) =>
          showNumbers ? (
            <Marker key={i} position={p} icon={pointIcon(String(i + 1))} />
          ) : (
            <CircleMarker
              key={i}
              center={p}
              radius={3}
              pathOptions={{ color: pathColor, fillColor: pathColor, fillOpacity: 1, weight: 1 }}
            />
          )
        )}

        {stops.map((s) => (
          <CircleMarker
            key={s.id}
            center={[s.lat, s.lng]}
            radius={6}
            pathOptions={{ color: "#1e293b", fillColor: "#f8fafc", fillOpacity: 1, weight: 2 }}
          >
            <Tooltip direction="top" offset={[0, -6]}>{s.name}</Tooltip>
          </CircleMarker>
        ))}

        {livePosition && <Marker position={livePosition} icon={liveIcon()} />}
      </MapContainer>
    </div>
  );
}
