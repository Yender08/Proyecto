import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/requireAuth";
import type { IncidentDTO } from "@/lib/types";

function toDTO(i: {
  id: string;
  type: string;
  status: string;
  description: string;
  lat: number;
  lng: number;
  routeId: string | null;
  vehicleId: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  route: { code: string } | null;
}): IncidentDTO {
  return {
    id: i.id,
    type: i.type as IncidentDTO["type"],
    status: i.status as IncidentDTO["status"],
    description: i.description,
    lat: i.lat,
    lng: i.lng,
    routeId: i.routeId,
    routeCode: i.route?.code ?? null,
    vehicleId: i.vehicleId,
    createdAt: i.createdAt.toISOString(),
    resolvedAt: i.resolvedAt ? i.resolvedAt.toISOString() : null,
  };
}

export async function GET() {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const incidents = await prisma.incident.findMany({
    include: { route: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(incidents.map(toDTO));
}

export async function POST(req: Request) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  if (!body?.type || !body?.description || body.lat == null || body.lng == null) {
    return NextResponse.json(
      { error: "type, description, lat y lng son requeridos" },
      { status: 400 }
    );
  }

  const incident = await prisma.incident.create({
    data: {
      type: body.type,
      description: body.description,
      lat: body.lat,
      lng: body.lng,
      routeId: body.routeId ?? null,
      vehicleId: body.vehicleId ?? null,
      reportedBy: auth.session.email,
    },
    include: { route: true },
  });

  return NextResponse.json(toDTO(incident), { status: 201 });
}
