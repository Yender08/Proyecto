import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret";
export const SESSION_COOKIE = "mvb_session";

export interface SessionPayload {
  sub: string;
  email: string;
  name: string;
  role: "ADMIN" | "OPERATOR";
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "12h" });
}

export function verifySession(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as SessionPayload;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}
