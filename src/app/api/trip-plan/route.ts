import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { planTrip, type RouteForRouting } from "@/lib/routing";
import type { Point } from "@/lib/geo";

// El planificador puede verificar varios puntos de abordaje contra el
// ruteo peatonal real antes de responder; se amplía el límite por defecto
// de la función para que esas consultas tengan tiempo de completarse.
export const maxDuration = 60;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const fromLat = Number(searchParams.get("fromLat"));
  const fromLng = Number(searchParams.get("fromLng"));
  const toLat = Number(searchParams.get("toLat"));
  const toLng = Number(searchParams.get("toLng"));

  if ([fromLat, fromLng, toLat, toLng].some((n) => Number.isNaN(n))) {
    return NextResponse.json(
      { error: "Parámetros fromLat/fromLng/toLat/toLng inválidos" },
      { status: 400 }
    );
  }

  const routes = await prisma.route.findMany({
    where: { active: true },
    include: { stops: { include: { stop: true } } },
  });

  const routesForRouting: RouteForRouting[] = routes.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    color: r.color,
    path: r.path as unknown as Point[],
    avgSpeedKmh: r.avgSpeedKmh,
    stops: r.stops.map((rs) => ({
      id: rs.stop.id,
      name: rs.stop.name,
      lat: rs.stop.lat,
      lng: rs.stop.lng,
    })),
  }));

  const result = await planTrip(routesForRouting, [fromLat, fromLng], [toLat, toLng]);

  if (!result) {
    return NextResponse.json(
      { error: "No se encontró una ruta posible entre esos puntos" },
      { status: 404 }
    );
  }

  return NextResponse.json(result);
}
