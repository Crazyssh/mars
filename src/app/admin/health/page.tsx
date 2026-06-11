import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import AdminHealth from "./AdminHealth";

export default async function AdminHealthPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");
  return <AdminHealth />;
}
