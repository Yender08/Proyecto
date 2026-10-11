import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/requireAuth";

export async function GET() {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const vehicles = await prisma.vehicle.findMany({
    include: { route: true },
    orderBy: { code: "asc" },
  });

  return NextResponse.json(
    vehicles.map((v) => ({
      id: v.id,
      code: v.code,
      plate: v.plate,
      capacity: v.capacity,
      status: v.status,
      routeId: v.routeId,
      routeCode: v.route?.code ?? null,
      routeName: v.route?.name ?? null,
    }))
  );
}

export async function POST(req: Request) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  if (!body?.code || !body?.plate) {
    return NextResponse.json({ error: "code y plate son requeridos" }, { status: 400 });
  }

  const vehicle = await prisma.vehicle.create({
    data: {
      code: body.code,
      plate: body.plate,
      capacity: body.capacity ?? 30,
      status: body.status ?? "ACTIVE",
      routeId: body.routeId ?? null,
    },
  });

  return NextResponse.json(vehicle, { status: 201 });
}
