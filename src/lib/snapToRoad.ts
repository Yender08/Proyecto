import {
  type Point,
  haversineMeters,
  polylineLengthMeters,
  removePathArtifacts,
  attachStartToPath,
  attachEndToPath,
} from "./geo";

/**
 * Ajusta un trazado dibujado o grabado al eje real de la calle más cercana a
 * cada punto, usando el servicio de "map matching" público de OSRM
 * (OpenStreetMap). A propósito NO se usa el servicio "route" de OSRM: ese
 * calcula la mejor ruta para ir de un punto a otro (puede desviarse por
 * calles de un solo sentido, evitar ciertas vías, dar vueltas, etc.), que no
 * es lo que se busca aquí — solo enganchar cada punto trazado a la calle
 * donde realmente está, sin cambiar el recorrido que se dibujó.
 *
 * El servidor público de OSRM limita "/match" a 10 coordenadas por
 * solicitud, así que el trazado se parte en bloques (con un punto de
 * solape entre bloques consecutivos) y los resultados se unen en orden. Si
 * un bloque puntual no logra ajustarse, se conservan sus puntos originales
 * en vez de romper el resto del trazado.
 *
 * No requiere API key, pero es un servicio de demostración — para volumen
 * alto en producción convendría un servidor OSRM propio o un proveedor de
 * pago.
 */

const OSRM_BASE = "https://router.project-osrm.org";
const SNAP_RADIUS_METERS = 30;
const CHUNK_SIZE = 10; // límite duro del servidor público de OSRM para /match
const CHUNK_OVERLAP = 1;

interface OsrmGeometry {
  coordinates: [number, number][];
}

export interface SnapResult {
  path: Point[];
  distanceMeters: number;
}

function toOsrmCoords(points: Point[]): string {
  return points.map(([lat, lng]) => `${lng},${lat}`).join(";");
}

function fromOsrmGeometry(geometry: OsrmGeometry): Point[] {
  return geometry.coordinates.map(([lng, lat]) => [lat, lng] as Point);
}

function chunkWithOverlap(points: Point[]): Point[][] {
  const chunks: Point[][] = [];
  let i = 0;
  while (i < points.length - 1) {
    const end = Math.min(i + CHUNK_SIZE, points.length);
    chunks.push(points.slice(i, end));
    if (end === points.length) break;
    i = end - CHUNK_OVERLAP;
  }
  return chunks;
}

async function matchChunk(points: Point[]): Promise<Point[] | null> {
  if (points.length < 2) return null;
  const radiuses = points.map(() => SNAP_RADIUS_METERS).join(";");
  const url = `${OSRM_BASE}/match/v1/driving/${toOsrmCoords(points)}?overview=full&geometries=geojson&radiuses=${radiuses}&tidy=true`;

  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.code !== "Ok" || !data.matchings?.length) return null;

  let path: Point[] = [];
  for (const matching of data.matchings as Array<{ geometry: OsrmGeometry }>) {
    const segment = fromOsrmGeometry(matching.geometry);
    if (path.length > 0 && segment.length > 0 && haversineMeters(path[path.length - 1], segment[0]) < 1) {
      segment.shift();
    }
    path = path.concat(segment);
  }
  return path.length >= 2 ? path : null;
}

function appendSegment(fullPath: Point[], segment: Point[]): Point[] {
  if (segment.length === 0) return fullPath;
  if (fullPath.length > 0 && haversineMeters(fullPath[fullPath.length - 1], segment[0]) < 1) {
    return fullPath.concat(segment.slice(1));
  }
  return fullPath.concat(segment);
}

export async function snapPathToRoads(points: Point[]): Promise<SnapResult | null> {
  if (points.length < 2) return null;

  let fullPath: Point[] = [];
  for (const chunk of chunkWithOverlap(points)) {
    let matched: Point[] | null;
    try {
      matched = await matchChunk(chunk);
    } catch {
      matched = null;
    }
    fullPath = appendSegment(fullPath, matched ?? chunk);
  }

  // Los empalmes entre bloques (y entre los tramos de un mismo bloque) no
  // siempre caen en el mismo punto exacto de la calle: dejan pequeños picos
  // de ida y vuelta o escalones laterales que se ven como zigzag en el mapa.
  fullPath = removePathArtifacts(fullPath);
  if (fullPath.length < 2) return null;
  return { path: fullPath, distanceMeters: polylineLengthMeters(fullPath) };
}

// El servidor público de OSRM solo tiene perfil de carro: ignora "/foot/" y
// devuelve rutas que respetan sentidos de circulación y retornos, algo que un
// peatón no necesita. El servidor de FOSSGIS (openstreetmap.de) sí tiene un
// perfil peatonal real; ahí el perfil va en la ruta ("routed-foot") y el
// segmento "driving" de la URL es solo un marcador que el servidor ignora.
const FOOT_ROUTING_BASE = "https://routing.openstreetmap.de/routed-foot";

/**
 * Calcula el camino peatonal real entre dos puntos (respetando calles,
 * aceras y entradas) en vez de una línea recta. A propósito NO se recorta ni
 * se atajan sus rodeos: aunque un rodeo largo para cruzar una avenida sin
 * cruce marcado se vea redundante en el mapa, cualquier atajo en línea recta
 * corre el riesgo de atravesar manzanas, lotes privados o edificios que el
 * peatón no puede cruzar en la práctica. Si el punto de abordaje elegido
 * exige un rodeo así, la solución es buscar otro punto de abordaje más
 * accesible (ver `findReachableRoutePoint` en routing.ts), no acortar el
 * trazado peatonal.
 */
// Es un servicio público gratuito, no siempre responde rápido: se limita la
// espera para que una sola llamada lenta no arrastre a los 60 s la respuesta
// completa del planificador (que puede hacer varias de estas a la vez).
const WALKING_PATH_TIMEOUT_MS = 6000;

export async function getWalkingPath(from: Point, to: Point): Promise<SnapResult | null> {
  const url = `${FOOT_ROUTING_BASE}/route/v1/driving/${toOsrmCoords([from, to])}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(WALKING_PATH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.[0]) return null;
    const routed = fromOsrmGeometry(data.routes[0].geometry);
    if (routed.length < 2) return null;
    // El ruteo arranca y termina en la calle más cercana, no en el punto
    // exacto: se agregan ambos extremos para que la línea llegue hasta ellos.
    // Si el trazado sale alejándose del punto para luego volver a pasar
    // frente a él (el ruteo enganchó la calle unos metros más allá), se
    // engancha donde de verdad pasa enfrente, sin esa ida y vuelta.
    const path = removePathArtifacts(attachEndToPath(attachStartToPath(from, routed), to));
    return { path, distanceMeters: polylineLengthMeters(path) };
  } catch {
    return null;
  }
}
