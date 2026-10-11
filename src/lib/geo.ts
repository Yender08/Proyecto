export type Point = [number, number]; // [lat, lng]

const EARTH_RADIUS_M = 6371000;

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

export function haversineMeters(a: Point, b: Point): number {
  const [lat1, lon1] = a;
  const [lat2, lon2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(s));
}

export function bearingDegrees(a: Point, b: Point): number {
  const [lat1, lon1] = a;
  const [lat2, lon2] = b;
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

export function polylineLengthMeters(path: Point[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += haversineMeters(path[i - 1], path[i]);
  }
  return total;
}

/** Cumulative distance (meters) at each vertex of the path, starting at 0. */
export function cumulativeDistances(path: Point[]): number[] {
  const cum = [0];
  for (let i = 1; i < path.length; i++) {
    cum.push(cum[i - 1] + haversineMeters(path[i - 1], path[i]));
  }
  return cum;
}

/**
 * Given a fraction [0,1] of the total path length, returns the interpolated
 * point along the polyline plus the heading (degrees) of travel at that point.
 */
export function pointAtFraction(
  path: Point[],
  fraction: number,
  cum?: number[]
): { point: Point; heading: number } {
  if (path.length === 0) return { point: [0, 0], heading: 0 };
  if (path.length === 1) return { point: path[0], heading: 0 };

  const distances = cum ?? cumulativeDistances(path);
  const total = distances[distances.length - 1];
  const target = Math.max(0, Math.min(1, fraction)) * total;

  let i = 1;
  while (i < distances.length - 1 && distances[i] < target) i++;

  const segStart = distances[i - 1];
  const segEnd = distances[i];
  const segLen = segEnd - segStart || 1;
  const t = Math.max(0, Math.min(1, (target - segStart) / segLen));

  const [lat1, lng1] = path[i - 1];
  const [lat2, lng2] = path[i];
  const point: Point = [lat1 + (lat2 - lat1) * t, lng1 + (lng2 - lng1) * t];
  const heading = bearingDegrees(path[i - 1], path[i]);

  return { point, heading };
}

/**
 * Projects an arbitrary point onto the closest position along the polyline,
 * returning the fraction [0,1] along the path and the perpendicular distance.
 * Used to place a stop "along" a route for ETA calculations.
 */
export function projectPointToPath(
  path: Point[],
  point: Point,
  cum?: number[]
): { fraction: number; distanceMeters: number } {
  if (path.length < 2) {
    return { fraction: 0, distanceMeters: path[0] ? haversineMeters(path[0], point) : Infinity };
  }
  const distances = cum ?? cumulativeDistances(path);
  const total = distances[distances.length - 1] || 1;

  let best = { fraction: 0, distanceMeters: Infinity };

  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    // Approximate flat-plane projection (fine at city scale).
    const ax = a[1], ay = a[0];
    const bx = b[1], by = b[0];
    const px = point[1], py = point[0];

    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy || 1e-12;
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const projLat = ay + dy * t;
    const projLng = ax + dx * t;
    const dist = haversineMeters([projLat, projLng], point);

    if (dist < best.distanceMeters) {
      const segDist = distances[i - 1] + haversineMeters(a, [projLat, projLng]);
      best = { fraction: segDist / total, distanceMeters: dist };
    }
  }

  return best;
}

/**
 * Returns the portion of the polyline between two fractions [0,1], including
 * interpolated endpoints. If `fromFraction > toFraction` the slice still
 * runs in that (reverse) order, matching actual travel direction.
 */
export function slicePathByFraction(
  path: Point[],
  fromFraction: number,
  toFraction: number,
  cum?: number[]
): Point[] {
  const distances = cum ?? cumulativeDistances(path);
  const reverse = fromFraction > toFraction;
  const lo = Math.min(fromFraction, toFraction);
  const hi = Math.max(fromFraction, toFraction);

  const startPoint = pointAtFraction(path, lo, distances).point;
  const endPoint = pointAtFraction(path, hi, distances).point;
  const total = distances[distances.length - 1] || 1;

  const middle = path.filter((_, i) => {
    const f = distances[i] / total;
    return f > lo && f < hi;
  });

  const slice = [startPoint, ...middle, endPoint];
  return reverse ? slice.reverse() : slice;
}

/** Caja delimitadora [minLat, minLng, maxLat, maxLng] de un trazado. */
export function pathBounds(path: Point[]): [number, number, number, number] {
  let minLat = Infinity,
    minLng = Infinity,
    maxLat = -Infinity,
    maxLng = -Infinity;
  for (const [lat, lng] of path) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return [minLat, minLng, maxLat, maxLng];
}

/**
 * Descarta rápidamente pares de trazados cuyas cajas delimitadoras (con un
 * margen en metros) ni siquiera se solapan, sin comparar punto por punto.
 */
export function boundsMayBeClose(
  a: [number, number, number, number],
  b: [number, number, number, number],
  marginMeters: number
): boolean {
  const marginDeg = marginMeters / 111000; // aproximación suficiente a escala de ciudad
  return !(
    a[2] + marginDeg < b[0] ||
    b[2] + marginDeg < a[0] ||
    a[3] + marginDeg < b[1] ||
    b[3] + marginDeg < a[1]
  );
}

/**
 * Punto de máxima cercanía entre dos trazados: para cada vértice de uno,
 * se proyecta sobre el otro (y viceversa), quedándose con la menor
 * distancia encontrada. No es geométricamente exacto entre dos segmentos
 * cualesquiera, pero es más que suficiente con trazados de calles reales
 * (muchos vértices ya densificados).
 */
export function closestApproachBetweenPaths(
  pathA: Point[],
  pathB: Point[],
  cumA?: number[],
  cumB?: number[]
): { distanceMeters: number; fractionA: number; fractionB: number } {
  const distA = cumA ?? cumulativeDistances(pathA);
  const distB = cumB ?? cumulativeDistances(pathB);
  const totalA = distA[distA.length - 1] || 1;
  const totalB = distB[distB.length - 1] || 1;

  let best = { distanceMeters: Infinity, fractionA: 0, fractionB: 0 };

  for (let k = 0; k < pathA.length; k++) {
    const proj = projectPointToPath(pathB, pathA[k], distB);
    if (proj.distanceMeters < best.distanceMeters) {
      best = { distanceMeters: proj.distanceMeters, fractionA: distA[k] / totalA, fractionB: proj.fraction };
    }
  }
  for (let k = 0; k < pathB.length; k++) {
    const proj = projectPointToPath(pathA, pathB[k], distA);
    if (proj.distanceMeters < best.distanceMeters) {
      best = { distanceMeters: proj.distanceMeters, fractionA: proj.fraction, fractionB: distB[k] / totalB };
    }
  }

  return best;
}

// Dos escalas de revisión: una corta para esquinas/cruces cerrados, y una
// más amplia para rotondas e intercambiadores, donde el giro es más gradual
// pero se acumula a lo largo de un tramo más largo.
const JUNCTION_CHECKS: Array<{ windowMeters: number; thresholdDegrees: number }> = [
  { windowMeters: 25, thresholdDegrees: 50 },
  { windowMeters: 80, thresholdDegrees: 65 },
];
const SAFE_POINT_SEARCH_STEP_METERS = 15;
const SAFE_POINT_MAX_SEARCH_METERS = 300;

function turnAngleDegrees(path: Point[], fraction: number, windowMeters: number, cum: number[]): number {
  const total = cum[cum.length - 1] || 1;
  const windowFrac = windowMeters / total;

  const beforeFrac = Math.max(0, fraction - windowFrac);
  const afterFrac = Math.min(1, fraction + windowFrac);
  if (afterFrac - beforeFrac < 1e-6) return 0;

  const p0 = pointAtFraction(path, beforeFrac, cum).point;
  const p1 = pointAtFraction(path, fraction, cum).point;
  const p2 = pointAtFraction(path, afterFrac, cum).point;
  if (haversineMeters(p0, p1) < 1 || haversineMeters(p1, p2) < 1) return 0;

  const h1 = bearingDegrees(p0, p1);
  const h2 = bearingDegrees(p1, p2);
  let diff = Math.abs(h2 - h1);
  if (diff > 180) diff = 360 - diff;
  return diff;
}

/**
 * Un giro brusco (a corta o larga escala) suele corresponder a una
 * intersección o una rotonda — un punto peligroso para subir o bajar
 * pasajeros, aunque matemáticamente sea "el más cercano".
 */
export function isRiskyJunction(path: Point[], fraction: number, cum?: number[]): boolean {
  const distances = cum ?? cumulativeDistances(path);
  return JUNCTION_CHECKS.some(
    ({ windowMeters, thresholdDegrees }) =>
      turnAngleDegrees(path, fraction, windowMeters, distances) > thresholdDegrees
  );
}

/**
 * Si la fracción dada cae en una zona riesgosa (cruce, rotonda), busca hacia
 * adelante y atrás sobre el mismo trazado el punto transitable más cercano.
 * Si no encuentra ninguno dentro del radio de búsqueda, deja la fracción
 * original tal cual.
 */
export function nearestSafeFraction(path: Point[], fraction: number, cum?: number[]): number {
  const distances = cum ?? cumulativeDistances(path);
  if (!isRiskyJunction(path, fraction, distances)) return fraction;

  const total = distances[distances.length - 1] || 1;
  for (
    let d = SAFE_POINT_SEARCH_STEP_METERS;
    d <= SAFE_POINT_MAX_SEARCH_METERS;
    d += SAFE_POINT_SEARCH_STEP_METERS
  ) {
    const df = d / total;
    const forward = Math.min(1, fraction + df);
    if (!isRiskyJunction(path, forward, distances)) return forward;
    const backward = Math.max(0, fraction - df);
    if (!isRiskyJunction(path, backward, distances)) return backward;
  }
  return fraction;
}

/**
 * Como `nearestSafeFraction`, pero en vez de quedarse con el primer punto
 * transitable que encuentra, devuelve varios candidatos (el propio si no es
 * riesgoso, y luego alternando hacia adelante y atrás) para que quien llama
 * pueda verificar cada uno contra el ruteo peatonal real y quedarse con el
 * primero que de verdad se pueda caminar sin un rodeo enorme — en vez de
 * asumir que el geométricamente más cercano es alcanzable a pie.
 */
export function safeFractionCandidates(
  path: Point[],
  fraction: number,
  cum?: number[],
  maxSearchMeters = SAFE_POINT_MAX_SEARCH_METERS,
  stepMeters = SAFE_POINT_SEARCH_STEP_METERS
): number[] {
  const distances = cum ?? cumulativeDistances(path);
  const total = distances[distances.length - 1] || 1;
  const candidates: number[] = [];

  if (!isRiskyJunction(path, fraction, distances)) candidates.push(fraction);
  for (let d = stepMeters; d <= maxSearchMeters; d += stepMeters) {
    const df = d / total;
    const forward = Math.min(1, fraction + df);
    if (!isRiskyJunction(path, forward, distances)) candidates.push(forward);
    const backward = Math.max(0, fraction - df);
    if (!isRiskyJunction(path, backward, distances)) candidates.push(backward);
  }
  return candidates;
}

/**
 * Punto de transbordo seguro entre dos rutas que pasan cerca: a diferencia
 * de `nearestSafeFraction`, mueve el punto en A y vuelve a proyectarlo sobre
 * B en cada paso, así ambos lados del transbordo se mantienen cerca entre sí
 * (y no solo "a salvo" cada uno por su lado, lo que podría alejarlos mucho).
 * Devuelve `null` si no hay un par seguro dentro del radio de caminata.
 */
export function nearestSafeTransferPair(
  pathA: Point[],
  cumA: number[],
  pathB: Point[],
  cumB: number[],
  fractionA: number,
  fractionB: number,
  maxWalkMeters: number
): { fractionA: number; fractionB: number; distanceMeters: number } | null {
  const alreadySafe = !isRiskyJunction(pathA, fractionA, cumA) && !isRiskyJunction(pathB, fractionB, cumB);
  if (alreadySafe) {
    const distanceMeters = haversineMeters(
      pointAtFraction(pathA, fractionA, cumA).point,
      pointAtFraction(pathB, fractionB, cumB).point
    );
    return distanceMeters <= maxWalkMeters ? { fractionA, fractionB, distanceMeters } : null;
  }

  const totalA = cumA[cumA.length - 1] || 1;
  for (let d = 0; d <= SAFE_POINT_MAX_SEARCH_METERS; d += SAFE_POINT_SEARCH_STEP_METERS) {
    const offsets = d === 0 ? [0] : [d, -d];
    const candidates: Array<{ fractionA: number; fractionB: number; distanceMeters: number }> = [];

    for (const offset of offsets) {
      const fracA = Math.max(0, Math.min(1, fractionA + offset / totalA));
      if (isRiskyJunction(pathA, fracA, cumA)) continue;
      const pointA = pointAtFraction(pathA, fracA, cumA).point;
      const proj = projectPointToPath(pathB, pointA, cumB);
      if (proj.distanceMeters > maxWalkMeters) continue;
      if (isRiskyJunction(pathB, proj.fraction, cumB)) continue;
      candidates.push({ fractionA: fracA, fractionB: proj.fraction, distanceMeters: proj.distanceMeters });
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => a.distanceMeters - b.distanceMeters);
      return candidates[0];
    }
  }

  return null;
}

export function nearest<T>(
  items: T[],
  point: Point,
  getPoint: (item: T) => Point,
  limit = 5
): Array<T & { distanceMeters: number }> {
  return items
    .map((item) => ({ ...item, distanceMeters: haversineMeters(getPoint(item), point) }))
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, limit);
}

/** Giro con signo (grados, -180..180) al pasar de rumbo `h1` a rumbo `h2`. */
function signedTurnDegrees(h1: number, h2: number): number {
  return ((h2 - h1 + 540) % 360) - 180;
}

// Umbrales de `removePathArtifacts`. Son cortos a propósito: un retorno o
// una esquina real mide decenas de metros y nunca cae dentro de ellos; los
// "dientes" que deja el ajuste a la calle (empalmes entre bloques del map
// matching, el punto donde el ruteo engancha la calle) miden unos pocos.
const DEDUPE_METERS = 0.5;
const SPIKE_MIN_TURN_DEGREES = 150;
const SPIKE_MAX_SEGMENT_METERS = 25;
const JOG_MAX_SEGMENT_METERS = 10;
const JOG_MIN_TURN_DEGREES = 45;
const JOG_MAX_NET_TURN_DEGREES = 30;

/**
 * Quita del trazado las imperfecciones que no son parte del recorrido real:
 * puntos repetidos, "picos" de ida y vuelta (el trazado avanza unos metros y
 * se regresa sobre sí mismo) y "escalones" laterales cortos (un zigzag de
 * pocos metros que vuelve a la misma dirección). Las curvas y esquinas
 * reales se conservan: solo se tocan tramos más cortos que los umbrales de
 * arriba. Los extremos nunca se mueven.
 */
export function removePathArtifacts(path: Point[]): Point[] {
  if (path.length < 3) return path;

  let pts: Point[] = [path[0]];
  for (let i = 1; i < path.length; i++) {
    if (haversineMeters(pts[pts.length - 1], path[i]) >= DEDUPE_METERS) pts.push(path[i]);
  }
  // El último punto es el destino exacto: si se descartó por estar casi
  // encima del anterior, se reemplaza ese anterior por él.
  const last = path[path.length - 1];
  if (pts.length === 1) pts.push(last);
  else if (pts[pts.length - 1] !== last) pts[pts.length - 1] = last;

  for (let pass = 0; pass < 10 && pts.length >= 3; pass++) {
    let changed = false;

    // Picos: un vértice donde el trazado da casi media vuelta sobre un tramo corto.
    const noSpikes: Point[] = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const prev = noSpikes[noSpikes.length - 1];
      const curr = pts[i];
      const next = pts[i + 1];
      const lenIn = haversineMeters(prev, curr);
      const lenOut = haversineMeters(curr, next);
      const turn = Math.abs(signedTurnDegrees(bearingDegrees(prev, curr), bearingDegrees(curr, next)));
      if (turn > SPIKE_MIN_TURN_DEGREES && Math.min(lenIn, lenOut) < SPIKE_MAX_SEGMENT_METERS) {
        changed = true;
        continue;
      }
      noSpikes.push(curr);
    }
    noSpikes.push(pts[pts.length - 1]);
    pts = noSpikes;

    // Escalones: dos giros seguidos en sentidos opuestos separados por un
    // tramo muy corto, que dejan la dirección casi igual que antes. Se
    // reemplazan por su punto medio.
    const noJogs: Point[] = [pts[0]];
    let i = 1;
    while (i < pts.length - 1) {
      if (i + 2 < pts.length) {
        const a = noJogs[noJogs.length - 1];
        const b = pts[i];
        const c = pts[i + 1];
        const d = pts[i + 2];
        if (haversineMeters(b, c) < JOG_MAX_SEGMENT_METERS) {
          const hAB = bearingDegrees(a, b);
          const hBC = bearingDegrees(b, c);
          const hCD = bearingDegrees(c, d);
          const t1 = signedTurnDegrees(hAB, hBC);
          const t2 = signedTurnDegrees(hBC, hCD);
          if (
            Math.abs(t1) > JOG_MIN_TURN_DEGREES &&
            Math.abs(t2) > JOG_MIN_TURN_DEGREES &&
            Math.sign(t1) !== Math.sign(t2) &&
            Math.abs(signedTurnDegrees(hAB, hCD)) < JOG_MAX_NET_TURN_DEGREES
          ) {
            noJogs.push([(b[0] + c[0]) / 2, (b[1] + c[1]) / 2]);
            i += 2;
            changed = true;
            continue;
          }
        }
      }
      noJogs.push(pts[i]);
      i++;
    }
    noJogs.push(pts[pts.length - 1]);
    pts = noJogs;

    if (!changed) break;
  }

  return pts;
}

/**
 * Engancha un punto exacto (`from`) al inicio de un trazado ruteado que
 * arranca en la calle más cercana. Si el trazado vuelve a pasar junto a
 * `from` más adelante (por ejemplo, arranca alejándose para luego regresar
 * por la misma calle), se empieza directamente ahí en vez de dibujar y
 * contar esa ida y vuelta. Solo se recorta si ese punto posterior queda tan
 * cerca de `from` como la calle que eligió el ruteo, así nunca se atraviesa
 * una manzana para atajar.
 */
export function attachStartToPath(from: Point, routed: Point[]): Point[] {
  if (routed.length < 2) return [from, ...routed];
  const cum = cumulativeDistances(routed);
  const total = cum[cum.length - 1];
  if (total <= 0) return [from, ...routed];

  const snapDistance = haversineMeters(from, routed[0]);
  const proj = projectPointToPath(routed, from, cum);
  const skippedMeters = proj.fraction * total;
  if (skippedMeters > 1 && proj.distanceMeters <= snapDistance + 2) {
    return [from, ...slicePathByFraction(routed, proj.fraction, 1, cum)];
  }
  return [from, ...routed];
}

/** Como `attachStartToPath`, pero para el final del trazado. */
export function attachEndToPath(routed: Point[], to: Point): Point[] {
  return attachStartToPath(to, [...routed].reverse()).reverse();
}
