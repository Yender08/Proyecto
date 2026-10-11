import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/requireAuth";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });

  const vehicle = await prisma.vehicle.update({
    where: { id },
    data: {
      status: body.status,
      routeId: body.routeId,
      capacity: body.capacity,
    },
  });

  return NextResponse.json(vehicle);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  await prisma.vehicle.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
