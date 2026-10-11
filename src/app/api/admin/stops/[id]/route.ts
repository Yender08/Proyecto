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
  if (!body?.name) {
    return NextResponse.json({ error: "name es requerido" }, { status: 400 });
  }

  const stop = await prisma.stop.update({ where: { id }, data: { name: body.name } });
  return NextResponse.json(stop);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  await prisma.stop.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
