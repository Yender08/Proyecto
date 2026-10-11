import { type Point, projectPointToPath } from "./geo";
import snapshot from "./data/roadHazards.maracaibo.json";

/**
 * Lugares de la vía donde no se puede subir ni bajar pasajeros aunque la
 * ruta pase por ahí: rotondas, distribuidores (tréboles, rampas de enlace),
 * autopistas, puentes y túneles. La geometría de la ruta no basta para
 * reconocerlos — una ruta que cruza un trébol en línea recta no "gira" — así
 * que se consultan directamente en OpenStreetMap (API pública de Overpass).
 *
 * La API pública de Overpass es poco confiable (corta la conexión, responde
 * 504/429 o tarda decenas de segundos) y, si fallaba, la verificación se
 * perdía sin avisar. Por eso Maracaibo viene precargada en
 * `data/roadHazards.maracaibo.json` (descargada con la misma consulta de
 * `buildQuery`): si las rutas caen dentro de esa zona no se consulta nada en
 * línea. Solo para rutas fuera de ella se descarga la zona en vivo (probando
 * varios servidores espejo) y se guarda en memoria.
 */

// Servidores de Overpass, en orden de preferencia. Algunos rechazan POST o
// cortan la conexión según la carga, así que se consulta por GET y ante
// cualquier error se pasa al siguiente.
const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const OVERPASS_TIMEOUT_MS = 15000;
const USER_AGENT = "MaracaiboMovilidad/1.0 (+https://maracaibo-movilidad.vercel.app)";
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
  // En Maracaibo varias rampas de los distribuidores están marcadas como
  // calles comunes ("residential") y solo el nombre las delata.
  const name = (tags.name ?? "").toLowerCase();
  if (/^(redoma|rotonda)\b/.test(name)) return "roundabout";
  if (/^(distribuidor|elevado|paso elevado)\b/.test(name)) return "link";
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

function buildQuery(bbox: string): string {
  return `[out:json][timeout:25];
(
  way["highway"]["junction"~"^(roundabout|circular)$"]${bbox};
  way["highway"~"_link$"]${bbox};
  way["highway"="motorway"]${bbox};
  way["highway"]["bridge"]["bridge"!="no"]${bbox};
  way["highway"]["tunnel"]["tunnel"!="no"]${bbox};
  way["highway"]["name"~"^(Distribuidor|Redoma|Rotonda|Elevado|Paso elevado|Puente)",i]${bbox};
);
out tags geom;`;
}

const snapshotBounds = snapshot.bbox as [number, number, number, number];
const snapshotHazards = buildHazards(snapshot.elements as unknown as OverpassWay[]);

const cache = new Map<string, { loadedAt: number; hazards: RoadHazards }>();

async function fetchOverpass(query: string): Promise<OverpassWay[] | null> {
  for (const url of OVERPASS_URLS) {
    try {
      const res = await fetch(`${url}?data=${encodeURIComponent(query)}`, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(OVERPASS_TIMEOUT_MS),
      });
      if (!res.ok) {
        console.warn(`[roadHazards] ${url} respondió ${res.status}`);
        continue;
      }
      const data = await res.json();
      // Overpass responde 200 con un "remark" cuando la consulta se cortó a
      // medias: esos datos incompletos no sirven.
      if (data?.remark) {
        console.warn(`[roadHazards] ${url}: ${data.remark}`);
        continue;
      }
      return (data?.elements ?? []) as OverpassWay[];
    } catch (err) {
      console.warn(`[roadHazards] ${url} falló:`, (err as Error).message);
    }
  }
  return null;
}

/**
 * Zonas de la vía donde no se debe subir ni bajar pasajeros, para la caja
 * que cubre todos los puntos dados. Dentro de Maracaibo usa los datos
 * precargados; fuera, los consulta en línea y, si ningún servidor responde,
 * lo avisa en el log y usa igual los precargados (cubren al menos la ciudad).
 */
export async function loadRoadHazards(points: Point[]): Promise<RoadHazards | null> {
  if (points.length === 0) return null;
  const [minLat, minLng, maxLat, maxLng] = boundsOf(points);
  const [sS, sW, sN, sE] = snapshotBounds;
  if (minLat >= sS && minLng >= sW && maxLat <= sN && maxLng <= sE) return snapshotHazards;

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

  const ways = await fetchOverpass(buildQuery(`(${s},${w},${n},${e})`));
  if (!ways) {
    console.warn(
      "[roadHazards] Overpass no respondió; se usan solo las zonas precargadas de Maracaibo"
    );
    return snapshotHazards;
  }
  const hazards = buildHazards(ways);
  cache.set(key, { loadedAt: Date.now(), hazards });
  return hazards;
}
