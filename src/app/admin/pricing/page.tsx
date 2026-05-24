import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import AdminPricing from "./AdminPricing";

export default async function AdminPricingPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");
  return <AdminPricing />;
}
