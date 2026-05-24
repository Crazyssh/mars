import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/stats — aggregate success orders per service / country / user.
 */
export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const where = { outcome: "otp_received" };

  const [total, successful, byService, byCountry, byUser] = await Promise.all([
    prisma.orderLog.count(),
    prisma.orderLog.count({ where }),
    prisma.orderLog.groupBy({
      by: ["serviceName"],
      where,
      _count: { _all: true },
    }),
    prisma.orderLog.groupBy({
      by: ["country"],
      where,
      _count: { _all: true },
    }),
    prisma.orderLog.groupBy({
      by: ["userId"],
      where,
      _count: { _all: true },
    }),
  ]);

  // Fetch user details untuk byUser
  const userIds = byUser.map((u) => u.userId);
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  return NextResponse.json({
    data: {
      total,
      successful,
      successRate:
        total === 0 ? 0 : Math.round((successful / total) * 100),
      byService: byService
        .map((s) => ({ name: s.serviceName, count: s._count._all }))
        .sort((a, b) => b.count - a.count),
      byCountry: byCountry
        .map((c) => ({ name: c.country, count: c._count._all }))
        .sort((a, b) => b.count - a.count),
      byUser: byUser
        .map((u) => ({
          userId: u.userId,
          user: userMap.get(u.userId) ?? null,
          count: u._count._all,
        }))
        .sort((a, b) => b.count - a.count),
    },
  });
}
