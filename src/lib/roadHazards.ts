import { type Point, projectPointToPath } from "./geo";

/**
 * Lugares de la vía donde no se puede subir ni bajar pasajeros aunque la
 * ruta pase por ahí: rotondas, distribuidores (tréboles, rampas de enlace),
 * autopistas, puentes y túneles. La geometría de la ruta no basta para
 * reconocerlos — una ruta que cruza un trébol en línea recta no "gira" — así
 * que se consultan directamente en OpenStreetMap (API pública de Overpass).
 *
 * Se descarga una sola vez por zona (la caja que cubre todas las rutas) y se
 * guarda en memoria; si el servicio no responde, se devuelve `null` y el
 * planificador sigue funcionando como antes, sin esta verificación.
 */

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const OVERPASS_TIMEOUT_MS = 12000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const BBOX_MARGIN_DEG = 0.003; // ~300 m alrededor de las rutas

type HazardKind = "roundabout" | "link" | "motorway" | "bridge" | "tunnel";

// Qué tan lejos de cada tipo de vía se considera inseguro detenerse. Las
// rampas de un distribuidor y el anillo de una rotonda afectan una zona más
// amplia que la vía misma (ahí se entrecruzan carriles); en un puente,
// túnel o autopista basta con no estar encima.
const HAZARD_RADIUS_METERS: Record<HazardKind, number> = {
  roundabout: 40,
  link: 40,
  motorway: 20,
  bridge: 25,
  tunnel: 25,
};

interface Hazard {
  kind: HazardKind;
  path: Point[];
  bounds: [number, number, number, number];
}

export interface RoadHazards {
  /** Si `point` cae en una zona donde no se debe subir ni bajar pasajeros. */
  isUnsafeStop(point: Point): boolean;
}

interface OverpassWay {
  type: string;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
}

function classify(tags: Record<string, string>): HazardKind | null {
  if (tags.junction === "roundabout" || tags.junction === "circular") return "roundabout";
  const highway = tags.highway ?? "";
  if (highway.endsWith("_link")) return "link";
  if (highway === "motorway") return "motorway";
  if (tags.bridge && tags.bridge !== "no") return "bridge";
  if (tags.tunnel && tags.tunnel !== "no") return "tunnel";
  return null;
}

function boundsOf(path: Point[]): [number, number, number, number] {
  let minLat = Infinity,
    minLng = Infinity,
    maxLat = -Infinity,
    maxLng = -Infinity;
  for (const [lat, lng] of path) {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
  }
  return [minLat, minLng, maxLat, maxLng];
}

function buildHazards(ways: OverpassWay[]): RoadHazards {
  const hazards: Hazard[] = [];
  for (const way of ways) {
    if (way.type !== "way" || !way.tags || !way.geometry || way.geometry.length < 2) continue;
    const kind = classify(way.tags);
    if (!kind) continue;
    const path = way.geometry.map((g) => [g.lat, g.lon] as Point);
    hazards.push({ kind, path, bounds: boundsOf(path) });
  }

  return {
    isUnsafeStop(point) {
      const [lat, lng] = point;
      for (const h of hazards) {
        const radius = HAZARD_RADIUS_METERS[h.kind];
        const marginDeg = radius / 111000 + 0.0002;
        const [minLat, minLng, maxLat, maxLng] = h.bounds;
        if (
          lat < minLat - marginDeg ||
          lat > maxLat + marginDeg ||
          lng < minLng - marginDeg ||
          lng > maxLng + marginDeg
        ) {
          continue;
        }
        if (projectPointToPath(h.path, point).distanceMeters <= radius) return true;
      }
      return false;
    },
  };
}

const cache = new Map<string, { loadedAt: number; hazards: RoadHazards }>();

/**
 * Zonas de la vía donde no se debe subir ni bajar pasajeros, para la caja
 * que cubre todos los puntos dados. `null` si OpenStreetMap no respondió.
 */
export async function loadRoadHazards(points: Point[]): Promise<RoadHazards | null> {
  if (points.length === 0) return null;
  const [minLat, minLng, maxLat, maxLng] = boundsOf(points);
  // Se redondea la caja para que viajes distintos sobre la misma red de
  // rutas reutilicen la misma descarga.
  const round = (v: number, up: boolean) =>
    (up ? Math.ceil(v * 100) : Math.floor(v * 100)) / 100;
  const s = round(minLat - BBOX_MARGIN_DEG, false);
  const w = round(minLng - BBOX_MARGIN_DEG, false);
  const n = round(maxLat + BBOX_MARGIN_DEG, true);
  const e = round(maxLng + BBOX_MARGIN_DEG, true);
  const key = `${s},${w},${n},${e}`;

  const cached = cache.get(key);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) return cached.hazards;

  const bbox = `(${s},${w},${n},${e})`;
  const query = `[out:json][timeout:20];
(
  way["highway"]["junction"~"^(roundabout|circular)$"]${bbox};
  way["highway"~"_link$"]${bbox};
  way["highway"="motorway"]${bbox};
  way["highway"]["bridge"]["bridge"!="no"]${bbox};
  way["highway"]["tunnel"]["tunnel"!="no"]${bbox};
);
out tags geom;`;

  try {
    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(OVERPASS_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const hazards = buildHazards((data?.elements ?? []) as OverpassWay[]);
    cache.set(key, { loadedAt: Date.now(), hazards });
    return hazards;
  } catch {
    return null;
  }
}
