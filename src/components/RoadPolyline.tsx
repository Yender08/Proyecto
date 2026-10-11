"use client";

import { useMemo, useState } from "react";
import { Polyline, useMap, useMapEvents } from "react-leaflet";
import { type Point, removePathArtifacts } from "@/lib/geo";

// Ancho aproximado de una calle urbana de dos carriles (con su acera). La
// línea de la ruta se dibuja de ese ancho real a cualquier nivel de zoom, así
// cubre la calle en vez de flotar como un hilo delgado encima de ella: las
// pequeñas imperfecciones del trazado quedan dentro de la calle y no se ven.
const STREET_WIDTH_METERS = 11;
const EARTH_CIRCUMFERENCE_METERS = 40075016.686;

/** Metros que cubre un píxel de pantalla a esa latitud y nivel de zoom. */
function metersPerPixel(lat: number, zoom: number): number {
  return (EARTH_CIRCUMFERENCE_METERS * Math.cos((lat * Math.PI) / 180)) / 2 ** (zoom + 8);
}

/**
 * Grosor en píxeles de una calle de `STREET_WIDTH_METERS` al zoom actual.
 * Con el mapa alejado la calle real mediría menos de un píxel, así que se
 * respeta un mínimo para que la ruta siga viéndose; de cerca se limita para
 * que no tape las calles vecinas.
 */
export function useStreetWidthPx(min: number, max: number): number {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  const lat = map.getCenter().lat;
  const px = STREET_WIDTH_METERS / metersPerPixel(lat, zoom);
  return Math.round(Math.max(min, Math.min(max, px)));
}

export interface RoadPolylineProps {
  positions: Point[];
  color: string;
  variant?: "ride" | "walk";
  opacity?: number;
  /** Color del borde que separa la línea del mapa (según el tema). */
  casingColor?: string;
}

/**
 * Línea de ruta "del tamaño de la calle": se limpia de picos y zigzags del
 * ajuste a la vía, se dibuja con el ancho real de la calle según el zoom y
 * con uniones y extremos redondeados, para que siga las curvas sin quiebres
 * visibles. Los tramos a pie se dibujan como puntos del mismo ancho.
 */
export default function RoadPolyline({
  positions,
  color,
  variant = "ride",
  opacity = 0.9,
  casingColor = "#ffffff",
}: RoadPolylineProps) {
  const path = useMemo(() => removePathArtifacts(positions), [positions]);
  const walk = variant === "walk";
  const weight = useStreetWidthPx(walk ? 4 : 5, walk ? 14 : 24);

  if (path.length < 2) return null;

  if (walk) {
    return (
      <Polyline
        positions={path}
        interactive={false}
        pathOptions={{
          color,
          weight,
          opacity: 1,
          lineCap: "round",
          lineJoin: "round",
          // Trazos de largo cero con extremo redondeado: una fila de puntos
          // del ancho de la calle, separados en proporción a su tamaño.
          dashArray: `0 ${Math.round(weight * 1.8)}`,
        }}
      />
    );
  }

  return (
    <>
      <Polyline
        positions={path}
        interactive={false}
        pathOptions={{
          color: casingColor,
          weight: weight + 4,
          opacity: 0.85,
          lineCap: "round",
          lineJoin: "round",
        }}
      />
      <Polyline
        positions={path}
        interactive={false}
        pathOptions={{ color, weight, opacity, lineCap: "round", lineJoin: "round" }}
      />
    </>
  );
}
