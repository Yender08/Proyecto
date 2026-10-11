import { NextResponse } from "next/server";
import { getSession, type SessionPayload } from "./auth";

export async function requireSession(): Promise<
  { session: SessionPayload } | { error: NextResponse }
> {
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  }
  return { session };
}
