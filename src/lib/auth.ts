import { cookies } from "next/headers";
import { getIronSession, SessionOptions } from "iron-session";
import { config } from "./config";
import { prisma } from "./prisma";
import { NextResponse } from "next/server";

export interface SessionData {
  userId?: string;
  email?: string;
  role?: "admin" | "user";
}

const sessionOptions: SessionOptions = {
  password: config.sessionSecret,
  cookieName: "mars_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
};

export async function getSession() {
  const c = await cookies();
  return getIronSession<SessionData>(c, sessionOptions);
}

/**
 * Get current user dari session + DB.
 * Return null kalau belum login atau user udah dihapus.
 */
export async function currentUser(): Promise<{
  id: string;
  email: string;
  name: string;
  role: "admin" | "user";
} | null> {
  const session = await getSession();
  if (!session.userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!user) return null;
  return user as {
    id: string;
    email: string;
    name: string;
    role: "admin" | "user";
  };
}

/**
 * Helper untuk API routes — return 401 kalau belum login, atau user object.
 */
export async function requireAuth() {
  const user = await currentUser();
  if (!user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      user: null as never,
    };
  }
  return { error: null, user };
}

export async function requireAdmin() {
  const auth = await requireAuth();
  if (auth.error) return auth;
  if (auth.user.role !== "admin") {
    return {
      error: NextResponse.json(
        { error: "Forbidden — admin only" },
        { status: 403 }
      ),
      user: null as never,
    };
  }
  return auth;
}
