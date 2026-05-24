import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_NAME = process.env.ADMIN_NAME || "Admin";

async function main() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error("❌ ADMIN_EMAIL & ADMIN_PASSWORD wajib di .env");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const email = ADMIN_EMAIL.toLowerCase().trim();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.role === "admin") {
      console.log(`✅ Admin ${email} sudah ada. Skip.`);
    } else {
      await prisma.user.update({
        where: { id: existing.id },
        data: { role: "admin" },
      });
      console.log(`✅ User ${email} di-promote jadi admin.`);
    }
    await prisma.$disconnect();
    return;
  }

  const hashed = await bcrypt.hash(ADMIN_PASSWORD, 12);
  await prisma.user.create({
    data: {
      email,
      password: hashed,
      name: ADMIN_NAME,
      role: "admin",
    },
  });
  console.log(`✅ Admin baru dibuat: ${email}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
