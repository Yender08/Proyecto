import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/requireAuth";
import type { Point } from "@/lib/geo";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const route = await prisma.route.findUnique({
    where: { id },
    include: { stops: { include: { stop: true }, orderBy: { sequence: "asc" } } },
  });

  if (!route) {
    return NextResponse.json({ error: "Ruta no encontrada" }, { status: 404 });
  }

  return NextResponse.json({
    id: route.id,
    code: route.code,
    name: route.name,
    description: route.description,
    color: route.color,
    avgSpeedKmh: route.avgSpeedKmh,
    active: route.active,
    path: route.path as unknown as Point[],
    stops: route.stops.map((rs) => ({
      id: rs.stop.id,
      name: rs.stop.name,
      lat: rs.stop.lat,
      lng: rs.stop.lng,
      sequence: rs.sequence,
    })),
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.description !== undefined) data.description = body.description;
  if (body.color !== undefined) data.color = body.color;
  if (body.avgSpeedKmh !== undefined) data.avgSpeedKmh = Number(body.avgSpeedKmh);
  if (body.active !== undefined) data.active = Boolean(body.active);
  if (Array.isArray(body.path) && body.path.length >= 2) data.path = body.path;

  const route = await prisma.route.update({ where: { id }, data });
  return NextResponse.json(route);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  await prisma.route.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
