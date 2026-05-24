import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import AdminUsers from "./AdminUsers";

export default async function AdminUsersPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");
  return <AdminUsers />;
}
