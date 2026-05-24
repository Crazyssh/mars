import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import AdminCookies from "./AdminCookies";

export default async function AdminCookiesPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");
  return <AdminCookies />;
}
