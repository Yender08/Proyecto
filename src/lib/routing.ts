import {
  type Point,
  haversineMeters,
  cumulativeDistances,
  projectPointToPath,
  pointAtFraction,
  polylineLengthMeters,
  slicePathByFraction,
  pathBounds,
  boundsMayBeClose,
  closestApproachBetweenPaths,
  safeFractionCandidates,
  nearestSafeTransferPair,
} from "./geo";
import { getWalkingPath } from "./snapToRoad";
import { loadRoadHazards, type RoadHazards } from "./roadHazards";

/**
 * Planificador de viajes multimodal (caminata + rutas + transbordos).
 *
 * No depende de posiciones de vehículos en vivo: estima tiempos de viaje a
 * partir de la geometría real de cada ruta (registrada por el operador) y su
 * velocidad promedio. Para abordar, si la ruta tiene una parada a menos de
 * 500 m del origen se camina directo a esa parada; si no, se lleva al punto
 * más cercano sobre el trazado ("sube en cualquier punto de esta vía"), tal
 * como opera el transporte por puesto real.
 */

export const WALK_SPEED_MPS = 1.3; // ~4.7 km/h
export const MAX_WALK_TO_BOARD_METERS = 1200;
// Si una ruta tiene una parada a menos de esta distancia del origen, se camina
// directo a esa parada; solo si no la hay se lleva al punto más cercano por
// donde pasa la ruta.
export const MAX_WALK_TO_ORIGIN_STOP_METERS = 500;
export const MAX_TRANSFER_WALK_METERS = 450;
export const BOARDING_PENALTY_SECONDS = 240; // espera promedio por unidad

// Al buscar el punto de abordaje informal sobre una ruta, cada candidato se
// verifica contra el ruteo peatonal real antes de aceptarlo (nunca se asume
// que el más cercano en línea recta se pueda caminar sin rodeos). Estos
// parámetros acotan esa búsqueda: cuánto se separan los candidatos entre sí,
// hasta dónde a lo largo de la vía se buscan, y cuántos como máximo se
// prueban (cada prueba es una llamada al servicio de ruteo).
const BOARDING_SEARCH_STEP_METERS = 30;
const BOARDING_SEARCH_MAX_METERS = 400;
// No se sabe de antemano si el cruce real queda hacia adelante o hacia atrás
// sobre la vía, así que se prueba alternando ambos lados; 8 alcanza para
// cubrir unos ±120 m sobre la ruta, suficiente para encontrar un cruce real
// cercano sin disparar la cantidad de llamadas al ruteo peatonal.
const MAX_BOARDING_CANDIDATES = 8;

// Un punto de abordaje o bajada solo se cambia para evitar caminar en
// sentido contrario al viaje si el ahorro real a pie vale la pena: no se
// cambia una parada formal por unos pocos metros.
const MIN_BACKTRACK_SAVING_METERS = 80;
const MIN_BACKTRACK_SAVING_RATIO = 0.3;

export interface RouteForRouting {
  id: string;
  code: string;
  name: string;
  color: string;
  path: Point[];
  avgSpeedKmh: number;
  stops: { id: string; name: string; lat: number; lng: number }[];
}

export type LegKind = "WALK" | "RIDE";

export interface ItineraryLeg {
  kind: LegKind;
  distanceMeters: number;
  seconds: number;
  fromLabel: string;
  toLabel: string;
  path: Point[];
  routeId?: string;
  routeCode?: string;
  routeName?: string;
  routeColor?: string;
  informalBoarding?: boolean;
}

export interface TripPlanResult {
  totalSeconds: number;
  totalWalkMeters: number;
  transfers: number;
  legs: ItineraryLeg[];
}

const ORIGIN_NODE = "O";
const DEST_NODE = "D";

interface NodeInfo {
  id: string;
  point: Point;
  label: string;
  stopId?: string;
}

interface WalkEdge {
  to: string;
  weightSeconds: number;
  distanceMeters: number;
}

interface RideEdge {
  to: string;
  weightSeconds: number;
  distanceMeters: number;
  routeId: string;
}

function walkSeconds(distanceMeters: number): number {
  return distanceMeters / WALK_SPEED_MPS;
}

interface ReachableRoutePoint {
  point: Point;
  fraction: number;
  distanceMeters: number;
  path: Point[];
}

/**
 * Busca, sobre el trazado de una ruta, un punto de abordaje que de verdad se
 * pueda caminar desde/hacia `from` — nunca solo el geométricamente más
 * cercano en línea recta. Prueba varios candidatos (empezando por el más
 * cercano y alternando hacia adelante y atrás sobre la vía) contra el ruteo
 * peatonal real; si el candidato más cercano exige un rodeo enorme (una
 * avenida sin cruce marcado, una manzana sin salida), prueba el siguiente en
 * vez de recortar el camino en línea recta — eso evita atravesar manzanas o
 * edificios que en la práctica no se pueden cruzar.
 *
 * Devuelve el primer candidato sin rodeo grande, o si ninguno lo evita, el
 * candidato verificado con la menor distancia real caminando. `null` si
 * ninguno resulta alcanzable dentro de `maxWalkMeters`.
 */
async function evaluateBoardingCandidate(
  path: Point[],
  cum: number[],
  from: Point,
  fraction: number,
  maxWalkMeters: number,
  hazards: RoadHazards | null
): Promise<{ candidate: ReachableRoutePoint; isBigDetour: boolean } | null> {
  const point = pointAtFraction(path, fraction, cum).point;
  // En una rotonda, un distribuidor, un puente o una autopista no se puede
  // subir ni bajar, aunque sea el punto más cercano.
  if (hazards?.isUnsafeStop(point)) return null;
  const straightMeters = haversineMeters(from, point);
  if (straightMeters > maxWalkMeters) return null;

  const walked = await getWalkingPath(from, point);
  if (!walked || walked.distanceMeters > maxWalkMeters) return null;

  const candidate: ReachableRoutePoint = {
    point,
    fraction,
    distanceMeters: walked.distanceMeters,
    path: walked.path,
  };
  // Un rodeo mucho más largo que la línea recta suele indicar que este punto
  // no es realmente accesible desde aquí (calle sin salida, lote privado):
  // se prefiere otro candidato antes que aceptarlo, salvo que sea el único
  // disponible.
  const isBigDetour = walked.distanceMeters > Math.max(straightMeters * 3, 150);
  return { candidate, isBigDetour };
}

/**
 * Busca, sobre el trazado de una ruta, un punto de abordaje que de verdad se
 * pueda caminar desde/hacia `from` — nunca solo el geométricamente más
 * cercano en línea recta. Prueba varios candidatos (empezando por el más
 * cercano y alternando hacia adelante y atrás sobre la vía) contra el ruteo
 * peatonal real; si el candidato más cercano exige un rodeo enorme (una
 * avenida sin cruce marcado, una manzana sin salida), prueba el siguiente en
 * vez de recortar el camino en línea recta — eso evita atravesar manzanas o
 * edificios que en la práctica no se pueden cruzar.
 *
 * Primero se prueba solo el candidato más cercano (un caso normal, sin
 * rodeo, se resuelve con esa única llamada); solo si ese falla se prueban
 * los demás, y ahí sí en paralelo, para no sumar una llamada de red tras
 * otra en el caso ya problemático.
 *
 * Devuelve el primer candidato sin rodeo grande, o si ninguno lo evita, el
 * candidato verificado con la menor distancia real caminando. `null` si
 * ninguno resulta alcanzable dentro de `maxWalkMeters`.
 */
async function findReachableRoutePoint(
  path: Point[],
  cum: number[],
  from: Point,
  baseFraction: number,
  maxWalkMeters: number,
  hazards: RoadHazards | null
): Promise<ReachableRoutePoint | null> {
  const candidateFractions = safeFractionCandidates(
    path,
    baseFraction,
    cum,
    BOARDING_SEARCH_MAX_METERS,
    BOARDING_SEARCH_STEP_METERS
  ).slice(0, MAX_BOARDING_CANDIDATES);
  if (candidateFractions.length === 0) return null;

  const first = await evaluateBoardingCandidate(
    path,
    cum,
    from,
    candidateFractions[0],
    maxWalkMeters,
    hazards
  );
  if (first && !first.isBigDetour) return first.candidate;

  const rest = await Promise.all(
    candidateFractions
      .slice(1)
      .map((fraction) => evaluateBoardingCandidate(path, cum, from, fraction, maxWalkMeters, hazards))
  );

  // Se respeta el orden de prioridad original (el más cercano primero,
  // alternando hacia adelante y atrás) al elegir entre los que sí
  // respondieron, no el orden en que llegaron las respuestas de red.
  let bestFallback: ReachableRoutePoint | null = null;
  for (const result of [first, ...rest]) {
    if (!result) continue;
    if (!result.isBigDetour) return result.candidate;
    if (!bestFallback || result.candidate.distanceMeters < bestFallback.distanceMeters) {
      bestFallback = result.candidate;
    }
  }
  return bestFallback;
}

/**
 * Busca sobre el trazado de un tramo en unidad (ya en el sentido del viaje)
 * un punto que se pueda alcanzar a pie desde `from` con bastante menos
 * caminata que `currentWalkMeters`. Devuelve `null` si no lo hay, o si el
 * ahorro es tan poco que no justifica cambiar el punto elegido.
 */
async function findShorterWalkToRide(
  ridePath: Point[],
  from: Point,
  currentWalkMeters: number,
  hazards: RoadHazards | null
): Promise<ReachableRoutePoint | null> {
  const cum = cumulativeDistances(ridePath);
  const proj = projectPointToPath(ridePath, from, cum);
  const minSaving = Math.max(
    MIN_BACKTRACK_SAVING_METERS,
    currentWalkMeters * MIN_BACKTRACK_SAVING_RATIO
  );
  // Ni en línea recta se ahorraría lo suficiente: no vale la pena consultar
  // el ruteo peatonal.
  if (proj.distanceMeters > currentWalkMeters - minSaving) return null;

  const found = await findReachableRoutePoint(
    ridePath,
    cum,
    from,
    proj.fraction,
    currentWalkMeters - minSaving,
    hazards
  );
  return found && found.distanceMeters <= currentWalkMeters - minSaving ? found : null;
}

export async function planTrip(
  routes: RouteForRouting[],
  origin: Point,
  destination: Point
): Promise<TripPlanResult | null> {
  const nodes = new Map<string, NodeInfo>();
  const walkEdges = new Map<string, WalkEdge[]>();
  const rideEdges = new Map<string, RideEdge[]>();
  // Caminos peatonales ya verificados contra el ruteo real (por
  // `findReachableRoutePoint`), guardados por "idOrigen|idDestino" para no
  // tener que volver a pedirlos al armar los tramos finales del itinerario.
  const walkPathCache = new Map<string, { path: Point[]; distanceMeters: number }>();

  function addNode(info: NodeInfo) {
    if (!nodes.has(info.id)) nodes.set(info.id, info);
  }
  function addWalkEdge(a: string, b: string, distanceMeters: number) {
    const edge = { to: b, weightSeconds: walkSeconds(distanceMeters), distanceMeters };
    const reverseEdge = { to: a, weightSeconds: walkSeconds(distanceMeters), distanceMeters };
    walkEdges.set(a, [...(walkEdges.get(a) ?? []), edge]);
    walkEdges.set(b, [...(walkEdges.get(b) ?? []), reverseEdge]);
  }
  function addRideEdgePair(
    a: string,
    b: string,
    distanceMeters: number,
    speedKmh: number,
    routeId: string
  ) {
    const speedMs = Math.max(1, speedKmh * (1000 / 3600));
    const seconds = distanceMeters / speedMs;
    rideEdges.set(a, [
      ...(rideEdges.get(a) ?? []),
      { to: b, weightSeconds: seconds, distanceMeters, routeId },
    ]);
    rideEdges.set(b, [
      ...(rideEdges.get(b) ?? []),
      { to: a, weightSeconds: seconds, distanceMeters, routeId },
    ]);
  }

  // Zonas donde no se puede subir ni bajar (rotondas, distribuidores,
  // puentes): se consultan antes de elegir cualquier punto de abordaje,
  // bajada o transbordo fuera de una parada.
  const hazards = await loadRoadHazards([
    ...routes.flatMap((r) => r.path),
    origin,
    destination,
  ]);

  addNode({ id: ORIGIN_NODE, point: origin, label: "Tu ubicación" });
  addNode({ id: DEST_NODE, point: destination, label: "Destino" });

  // Direct walk (covers short trips where transit isn't worth it).
  addWalkEdge(ORIGIN_NODE, DEST_NODE, haversineMeters(origin, destination));

  // Global stop registry (a stop can serve several routes -> shared node -> free transfer).
  const allStops = new Map<string, { id: string; name: string; lat: number; lng: number }>();
  for (const route of routes) {
    for (const s of route.stops) allStops.set(s.id, s);
  }
  for (const s of allStops.values()) {
    addNode({ id: `s:${s.id}`, point: [s.lat, s.lng], label: s.name, stopId: s.id });
  }

  // Origin/destination access to every stop within walking range.
  for (const s of allStops.values()) {
    const dO = haversineMeters(origin, [s.lat, s.lng]);
    if (dO < MAX_WALK_TO_ORIGIN_STOP_METERS) addWalkEdge(ORIGIN_NODE, `s:${s.id}`, dO);
    const dD = haversineMeters(destination, [s.lat, s.lng]);
    if (dD <= MAX_WALK_TO_BOARD_METERS) addWalkEdge(`s:${s.id}`, DEST_NODE, dD);
  }

  // Transfers between nearby stops of different routes.
  const stopList = [...allStops.values()];
  for (let i = 0; i < stopList.length; i++) {
    for (let j = i + 1; j < stopList.length; j++) {
      const a = stopList[i];
      const b = stopList[j];
      const d = haversineMeters([a.lat, a.lng], [b.lat, b.lng]);
      if (d > 0 && d <= MAX_TRANSFER_WALK_METERS) {
        addWalkEdge(`s:${a.id}`, `s:${b.id}`, d);
      }
    }
  }

  // --- Geometría de cada ruta y cadena de puntos "abordables" ---
  type ChainNode = { id: string; fraction: number };
  interface RouteGeom {
    route: RouteForRouting;
    cum: number[];
    lengthMeters: number;
    bounds: [number, number, number, number];
    chain: ChainNode[];
  }
  const geomByRoute = new Map<string, RouteGeom>();

  // Cada ruta se procesa en paralelo (no una tras otra): la búsqueda del
  // punto de abordaje real puede hacer varias llamadas al ruteo peatonal, y
  // esperarlas ruta por ruta multiplicaría esa espera por la cantidad de
  // rutas en vez de acotarla a la más lenta de todas.
  await Promise.all(
    routes.map(async (route) => {
      if (route.path.length < 2) return;
      const cum = cumulativeDistances(route.path);
      const lengthMeters = polylineLengthMeters(route.path);
      if (lengthMeters <= 0) return;

      const chain: ChainNode[] = [];
      let bestOwnStopDistO = Infinity;
      let bestOwnStopDistD = Infinity;

      for (const s of route.stops) {
        const { fraction } = projectPointToPath(route.path, [s.lat, s.lng], cum);
        chain.push({ id: `s:${s.id}`, fraction });
        bestOwnStopDistO = Math.min(bestOwnStopDistO, haversineMeters(origin, [s.lat, s.lng]));
        bestOwnStopDistD = Math.min(
          bestOwnStopDistD,
          haversineMeters(destination, [s.lat, s.lng])
        );
      }

      // El punto matemáticamente más cercano puede caer en un cruce, una
      // rotonda, o simplemente no tener por dónde caminar hasta él sin dar
      // un rodeo enorme (una avenida sin cruce marcado, una manzana sin
      // salida) — `findReachableRoutePoint` prueba varios puntos sobre la
      // vía contra el ruteo peatonal real y se queda con uno de verdad
      // alcanzable a pie, nunca con un atajo en línea recta que podría
      // cruzar edificios. El acceso desde el origen y hacia el destino se
      // buscan a la vez: son independientes entre sí.
      // Para abordar: si la ruta tiene una parada a menos de 500 m, la
      // caminata va directo a la parada (ya conectada arriba) y no se
      // ofrece punto informal; si no, se lleva al punto más cercano por
      // donde pasa la ruta.
      const [reachableO, reachableD] = await Promise.all([
        bestOwnStopDistO >= MAX_WALK_TO_ORIGIN_STOP_METERS
          ? findReachableRoutePoint(
              route.path,
              cum,
              origin,
              projectPointToPath(route.path, origin, cum).fraction,
              MAX_WALK_TO_BOARD_METERS,
              hazards
            )
          : null,
        findReachableRoutePoint(
          route.path,
          cum,
          destination,
          projectPointToPath(route.path, destination, cum).fraction,
          MAX_WALK_TO_BOARD_METERS,
          hazards
        ),
      ]);

      if (reachableO) {
        const id = `vo:${route.id}`;
        addNode({ id, point: reachableO.point, label: `Punto sobre ${route.name}` });
        addWalkEdge(ORIGIN_NODE, id, reachableO.distanceMeters);
        walkPathCache.set(`${ORIGIN_NODE}|${id}`, {
          path: reachableO.path,
          distanceMeters: reachableO.distanceMeters,
        });
        walkPathCache.set(`${id}|${ORIGIN_NODE}`, {
          path: [...reachableO.path].reverse(),
          distanceMeters: reachableO.distanceMeters,
        });
        chain.push({ id, fraction: reachableO.fraction });
      }

      if (reachableD && reachableD.distanceMeters < bestOwnStopDistD) {
        const id = `vd:${route.id}`;
        addNode({ id, point: reachableD.point, label: `Punto sobre ${route.name}` });
        addWalkEdge(id, DEST_NODE, reachableD.distanceMeters);
        // El ruteo se pidió desde el destino hacia la vía: para el tramo que
        // va de la vía al destino hay que invertirlo.
        walkPathCache.set(`${id}|${DEST_NODE}`, {
          path: [...reachableD.path].reverse(),
          distanceMeters: reachableD.distanceMeters,
        });
        walkPathCache.set(`${DEST_NODE}|${id}`, {
          path: reachableD.path,
          distanceMeters: reachableD.distanceMeters,
        });
        chain.push({ id, fraction: reachableD.fraction });
      }

      geomByRoute.set(route.id, {
        route,
        cum,
        lengthMeters,
        bounds: pathBounds(route.path),
        chain,
      });
    })
  );

  // --- Transbordos por cercanía física entre rutas, no solo en paradas ---
  // Dos rutas pueden cruzarse o correr paralelas sin que haya una parada
  // justo ahí; si el punto más cercano entre sus trazados queda a pie, se
  // ofrece como transbordo igual que se ofrece el abordaje informal.
  const routeGeoms = [...geomByRoute.values()];
  for (let i = 0; i < routeGeoms.length; i++) {
    for (let j = i + 1; j < routeGeoms.length; j++) {
      const a = routeGeoms[i];
      const b = routeGeoms[j];
      if (!boundsMayBeClose(a.bounds, b.bounds, MAX_TRANSFER_WALK_METERS)) continue;

      const closest = closestApproachBetweenPaths(a.route.path, b.route.path, a.cum, b.cum);
      if (closest.distanceMeters <= 0 || closest.distanceMeters > MAX_TRANSFER_WALK_METERS) continue;

      // Igual que en el abordaje informal: si el cruce entre ambas rutas cae
      // en una intersección o rotonda, se busca un punto seguro cercano —
      // pero manteniendo ambos lados del transbordo cerca entre sí (no cada
      // uno "a salvo" por separado, lo que podría alejarlos mucho).
      const safePair = nearestSafeTransferPair(
        a.route.path,
        a.cum,
        b.route.path,
        b.cum,
        closest.fractionA,
        closest.fractionB,
        MAX_TRANSFER_WALK_METERS
      );
      if (!safePair) continue;

      const safePointA = pointAtFraction(a.route.path, safePair.fractionA, a.cum).point;
      const safePointB = pointAtFraction(b.route.path, safePair.fractionB, b.cum).point;

      // Si el punto donde se cruzan cae en una rotonda o un distribuidor,
      // no se ofrece transbordo ahí: el pasajero sigue en la unidad hasta una
      // parada donde sí pueda bajarse (los transbordos entre paradas
      // cercanas ya están conectados más arriba).
      if (hazards?.isUnsafeStop(safePointA) || hazards?.isUnsafeStop(safePointB)) continue;

      // Dos puntos pueden quedar cerca en línea recta y aun así no ser
      // caminables directamente (una avenida dividida, el óvalo de una
      // rotonda de por medio): se confirma la distancia peatonal real antes
      // de ofrecer el transbordo, para que la decisión de la mejor ruta no
      // se base en una cercanía que en la práctica implica un gran rodeo.
      const walked = await getWalkingPath(safePointA, safePointB);
      const realDistanceMeters = walked?.distanceMeters ?? safePair.distanceMeters;
      const isImplausibleDetour =
        realDistanceMeters > Math.max(MAX_TRANSFER_WALK_METERS, safePair.distanceMeters * 3);
      if (!walked || isImplausibleDetour || realDistanceMeters > MAX_TRANSFER_WALK_METERS) continue;

      const idA = `x:${a.route.id}:${b.route.id}`;
      const idB = `x:${b.route.id}:${a.route.id}`;
      addNode({ id: idA, point: safePointA, label: `Transbordo con ${b.route.name}` });
      addNode({ id: idB, point: safePointB, label: `Transbordo con ${a.route.name}` });
      addWalkEdge(idA, idB, realDistanceMeters);
      // Ya se verificó el camino real para aceptar este transbordo; se
      // reutiliza al armar el itinerario en vez de volver a pedirlo — pedirlo
      // dos veces puede fallar la segunda vez por carga o tiempo de espera y
      // dejar, sin avisar, una línea recta en el mapa donde antes sí hubo un
      // camino real.
      walkPathCache.set(`${idA}|${idB}`, { path: walked.path, distanceMeters: realDistanceMeters });
      walkPathCache.set(`${idB}|${idA}`, {
        path: [...walked.path].reverse(),
        distanceMeters: realDistanceMeters,
      });
      a.chain.push({ id: idA, fraction: safePair.fractionA });
      b.chain.push({ id: idB, fraction: safePair.fractionB });
    }
  }

  // --- Tramos de viaje por ruta, ahora con la cadena ya completa ---
  for (const { route, chain, lengthMeters } of geomByRoute.values()) {
    if (chain.length < 2) continue;
    chain.sort((a, b) => a.fraction - b.fraction);

    for (let i = 1; i < chain.length; i++) {
      const prev = chain[i - 1];
      const curr = chain[i];
      const distanceMeters = Math.abs(curr.fraction - prev.fraction) * lengthMeters;
      if (distanceMeters <= 0) continue;
      addRideEdgePair(prev.id, curr.id, distanceMeters, route.avgSpeedKmh, route.id);
    }
  }

  // --- Dijkstra sobre estados (nodo, ruta actual) ---
  type StateKey = string; // `${nodeId}#${routeId ?? "walk"}`
  type PrevEntry = {
    stateKey: StateKey;
    kind: LegKind;
    routeId?: string;
    distanceMeters: number;
  };
  const dist = new Map<StateKey, number>();
  const prev = new Map<StateKey, PrevEntry | null>();

  const startKey: StateKey = `${ORIGIN_NODE}#walk`;
  dist.set(startKey, 0);
  prev.set(startKey, null);

  const visited = new Set<StateKey>();
  // Cola de prioridad simple (grafos de esta escala no requieren un heap).
  const queue: StateKey[] = [startKey];

  function stateNode(key: StateKey): string {
    return key.split("#")[0];
  }
  function stateRoute(key: StateKey): string | undefined {
    const r = key.split("#")[1];
    return r === "walk" ? undefined : r;
  }

  while (queue.length > 0) {
    queue.sort((a, b) => (dist.get(a) ?? Infinity) - (dist.get(b) ?? Infinity));
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const currentDist = dist.get(current) ?? Infinity;
    const node = stateNode(current);
    const currentRoute = stateRoute(current);

    if (node === DEST_NODE) break;

    for (const edge of walkEdges.get(node) ?? []) {
      const key: StateKey = `${edge.to}#walk`;
      const candidate = currentDist + edge.weightSeconds;
      if (candidate < (dist.get(key) ?? Infinity)) {
        dist.set(key, candidate);
        prev.set(key, {
          stateKey: current,
          kind: "WALK",
          distanceMeters: edge.distanceMeters,
        });
        queue.push(key);
      }
    }

    for (const edge of rideEdges.get(node) ?? []) {
      const key: StateKey = `${edge.to}#${edge.routeId}`;
      const penalty = currentRoute === edge.routeId ? 0 : BOARDING_PENALTY_SECONDS;
      const candidate = currentDist + edge.weightSeconds + penalty;
      if (candidate < (dist.get(key) ?? Infinity)) {
        dist.set(key, candidate);
        prev.set(key, {
          stateKey: current,
          kind: "RIDE",
          routeId: edge.routeId,
          distanceMeters: edge.distanceMeters,
        });
        queue.push(key);
      }
    }
  }

  // Mejor estado que alcanza el destino.
  let bestKey: StateKey | null = null;
  let bestDist = Infinity;
  for (const [key, d] of dist.entries()) {
    if (stateNode(key) === DEST_NODE && d < bestDist) {
      bestDist = d;
      bestKey = key;
    }
  }
  if (!bestKey) return null;

  // Reconstruir la secuencia de pasos.
  const steps: Array<{
    fromKey: StateKey;
    toKey: StateKey;
    kind: LegKind;
    routeId?: string;
    distanceMeters: number;
  }> = [];

  let cursor: StateKey | null = bestKey;
  while (cursor && prev.get(cursor)) {
    const p: PrevEntry = prev.get(cursor)!;
    steps.push({
      fromKey: p.stateKey,
      toKey: cursor,
      kind: p.kind,
      routeId: p.routeId,
      distanceMeters: p.distanceMeters,
    });
    cursor = p.stateKey;
  }
  steps.reverse();

  // Fusionar pasos consecutivos de la misma ruta en un solo tramo "RIDE".
  const legs: ItineraryLeg[] = [];
  const routeById = new Map(routes.map((r) => [r.id, r]));

  let i = 0;
  while (i < steps.length) {
    const step = steps[i];
    const fromNode = nodes.get(stateNode(step.fromKey))!;

    if (step.kind === "WALK") {
      const toNode = nodes.get(stateNode(step.toKey))!;
      // Si el acceso a esta ruta ya se verificó contra el ruteo peatonal
      // real (ver `findReachableRoutePoint`), se reutiliza ese camino en vez
      // de pedirlo de nuevo más abajo.
      const cached = walkPathCache.get(`${fromNode.id}|${toNode.id}`);
      legs.push({
        kind: "WALK",
        distanceMeters: cached ? cached.distanceMeters : step.distanceMeters,
        seconds: walkSeconds(cached ? cached.distanceMeters : step.distanceMeters),
        fromLabel: fromNode.label,
        toLabel: toNode.label,
        path: cached ? cached.path : [fromNode.point, toNode.point],
      });
      i++;
      continue;
    }

    // RIDE: agrupar todos los pasos consecutivos con la misma ruta.
    const routeId = step.routeId!;
    let j = i;
    let totalDist = 0;
    while (j < steps.length && steps[j].kind === "RIDE" && steps[j].routeId === routeId) {
      totalDist += steps[j].distanceMeters;
      j++;
    }
    const boardNode = nodes.get(stateNode(steps[i].fromKey))!;
    const alightNode = nodes.get(stateNode(steps[j - 1].toKey))!;
    const route = routeById.get(routeId)!;
    const speedMs = Math.max(1, route.avgSpeedKmh * (1000 / 3600));

    const cum = cumulativeDistances(route.path);
    const length = polylineLengthMeters(route.path);
    const boardFraction = projectPointToPath(route.path, boardNode.point, cum).fraction;
    const alightFraction = projectPointToPath(route.path, alightNode.point, cum).fraction;
    const slice =
      length > 0 ? slicePathByFraction(route.path, boardFraction, alightFraction, cum) : [];

    legs.push({
      kind: "RIDE",
      distanceMeters: totalDist,
      seconds: totalDist / speedMs + BOARDING_PENALTY_SECONDS,
      fromLabel: boardNode.stopId ? boardNode.label : `Abordaje sobre ${route.name}`,
      toLabel: alightNode.stopId ? alightNode.label : `Bajada sobre ${route.name}`,
      path: slice,
      routeId: route.id,
      routeCode: route.code,
      routeName: route.name,
      routeColor: route.color,
      informalBoarding: !boardNode.stopId,
    });
    i = j;
  }

  // Los tramos de caminata se calcularon como línea recta para elegir la
  // mejor combinación; ahora se reemplazan por el trazado peatonal real
  // (respeta calles, aceras y entradas) para mostrarlos y medirlos bien. Si
  // el servicio de ruteo no responde para algún tramo, se deja la línea
  // recta como respaldo en vez de romper el resultado.
  await Promise.all(
    legs.map(async (leg) => {
      if (leg.kind !== "WALK") return;
      // Un camino con más de dos puntos ya viene de un ruteo peatonal
      // verificado (ver el caché más arriba); no hace falta pedirlo de nuevo.
      if (leg.path.length > 2) return;
      const from = leg.path[0];
      const to = leg.path[leg.path.length - 1];
      // Un solo intento fallido (carga del servicio, tiempo de espera) no
      // debería dejar en pie una línea recta sin más: se reintenta una vez.
      // Como en este punto ya se dispararon muchas llamadas al mismo
      // servicio público a la vez (una por cada tramo pendiente), una falla
      // suele ser ese pico de golpe, no la ruta en sí — se espera un poco
      // antes de reintentar para no repetir el mismo golpe de inmediato.
      let walked = await getWalkingPath(from, to);
      if (!walked) {
        await new Promise((resolve) => setTimeout(resolve, 600));
        walked = await getWalkingPath(from, to);
      }
      if (!walked) return;
      leg.path = walked.path;
      leg.distanceMeters = walked.distanceMeters;
      leg.seconds = walkSeconds(walked.distanceMeters);
    })
  );

  // El grafo elige paradas y puntos de abordaje con distancias en línea
  // recta, sin saber hacia dónde va a avanzar la unidad. Eso puede mandar a
  // caminar hacia atrás hasta una parada para luego pasar en la unidad
  // justo frente al punto de partida, o quedarse en la unidad más allá del
  // destino y regresar caminando. Con el itinerario ya armado se sabe el
  // sentido de cada tramo: si la unidad pasa más cerca (a pie, verificado
  // con el ruteo real), se aborda o se baja ahí.
  for (let k = 0; k < legs.length; k++) {
    const ride = legs[k];
    if (ride.kind !== "RIDE" || ride.path.length < 2) continue;
    const route = routeById.get(ride.routeId!)!;
    let changed = false;

    const walkBefore = legs[k - 1];
    if (walkBefore?.kind === "WALK") {
      const better = await findShorterWalkToRide(
        ride.path,
        walkBefore.path[0],
        walkBefore.distanceMeters,
        hazards
      );
      if (better && better.fraction > 0) {
        const cum = cumulativeDistances(ride.path);
        ride.path = slicePathByFraction(ride.path, better.fraction, 1, cum);
        ride.fromLabel = `Abordaje sobre ${route.name}`;
        ride.informalBoarding = true;
        walkBefore.path = better.path;
        walkBefore.distanceMeters = better.distanceMeters;
        walkBefore.seconds = walkSeconds(better.distanceMeters);
        walkBefore.toLabel = ride.fromLabel;
        changed = true;
      }
    }

    const walkAfter = legs[k + 1];
    if (walkAfter?.kind === "WALK") {
      const end = walkAfter.path[walkAfter.path.length - 1];
      const better = await findShorterWalkToRide(ride.path, end, walkAfter.distanceMeters, hazards);
      if (better && better.fraction < 1) {
        const cum = cumulativeDistances(ride.path);
        ride.path = slicePathByFraction(ride.path, 0, better.fraction, cum);
        ride.toLabel = `Bajada sobre ${route.name}`;
        // El ruteo peatonal se pidió desde el destino del tramo hacia la vía.
        walkAfter.path = [...better.path].reverse();
        walkAfter.distanceMeters = better.distanceMeters;
        walkAfter.seconds = walkSeconds(better.distanceMeters);
        walkAfter.fromLabel = ride.toLabel;
        changed = true;
      }
    }

    if (!changed) continue;
    const speedMs = Math.max(1, route.avgSpeedKmh * (1000 / 3600));
    ride.distanceMeters = polylineLengthMeters(ride.path);
    ride.seconds = ride.distanceMeters / speedMs + BOARDING_PENALTY_SECONDS;
  }

  const totalWalkMeters = legs
    .filter((l) => l.kind === "WALK")
    .reduce((sum, l) => sum + l.distanceMeters, 0);
  const totalSeconds = legs.reduce((sum, l) => sum + l.seconds, 0);
  const transfers = Math.max(0, legs.filter((l) => l.kind === "RIDE").length - 1);

  return {
    totalSeconds,
    totalWalkMeters,
    transfers,
    legs,
  };
}
