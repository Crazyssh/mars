import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import AdminOrders from "./AdminOrders";

export default async function AdminOrdersPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");
  return <AdminOrders />;
}
