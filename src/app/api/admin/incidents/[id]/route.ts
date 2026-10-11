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
  if (!body?.status) {
    return NextResponse.json({ error: "status es requerido" }, { status: 400 });
  }

  const incident = await prisma.incident.update({
    where: { id },
    data: {
      status: body.status,
      resolvedAt: body.status === "RESUELTA" ? new Date() : null,
    },
  });

  return NextResponse.json(incident);
}
