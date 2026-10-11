import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/requireAuth";
import { projectPointToPath, type Point } from "@/lib/geo";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id: routeId } = await params;
  const body = await req.json().catch(() => null);

  if (!body?.name || typeof body.lat !== "number" || typeof body.lng !== "number") {
    return NextResponse.json(
      { error: "name, lat y lng son requeridos" },
      { status: 400 }
    );
  }

  const route = await prisma.route.findUnique({ where: { id: routeId } });
  if (!route) {
    return NextResponse.json({ error: "Ruta no encontrada" }, { status: 404 });
  }

  const stop = await prisma.stop.create({
    data: { name: body.name, lat: body.lat, lng: body.lng },
  });

  await prisma.routeStop.create({
    data: { routeId, stopId: stop.id, sequence: 0 },
  });

  // Reordenar todas las paradas de la ruta según su posición real sobre el trazado.
  const path = route.path as unknown as Point[];
  const routeStops = await prisma.routeStop.findMany({
    where: { routeId },
    include: { stop: true },
  });

  const ordered = routeStops
    .map((rs) => ({
      id: rs.id,
      fraction: projectPointToPath(path, [rs.stop.lat, rs.stop.lng]).fraction,
    }))
    .sort((a, b) => a.fraction - b.fraction);

  await prisma.$transaction(
    ordered.map((o, index) =>
      prisma.routeStop.update({ where: { id: o.id }, data: { sequence: index } })
    )
  );

  return NextResponse.json(stop, { status: 201 });
}
