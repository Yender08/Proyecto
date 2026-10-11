import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/requireAuth";
import type { Point } from "@/lib/geo";

export async function GET() {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const routes = await prisma.route.findMany({
    include: {
      _count: { select: { vehicles: true, stops: true } },
      vehicles: { select: { status: true } },
    },
    orderBy: { code: "asc" },
  });

  return NextResponse.json(
    routes.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      color: r.color,
      path: r.path as unknown as Point[],
      active: r.active,
      avgSpeedKmh: r.avgSpeedKmh,
      stopCount: r._count.stops,
      vehicleCount: r._count.vehicles,
      activeVehicleCount: r.vehicles.filter((v) => v.status === "ACTIVE").length,
    }))
  );
}

export async function POST(req: Request) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const path = body?.path as [number, number][] | undefined;

  if (!body?.code || !body?.name || !Array.isArray(path) || path.length < 2) {
    return NextResponse.json(
      { error: "code, name y un trazado (path) con al menos 2 puntos son requeridos" },
      { status: 400 }
    );
  }

  const route = await prisma.route.create({
    data: {
      code: body.code,
      name: body.name,
      description: body.description || null,
      color: body.color || "#2563eb",
      avgSpeedKmh: body.avgSpeedKmh ?? 18,
      path,
    },
  });

  return NextResponse.json(route, { status: 201 });
}
