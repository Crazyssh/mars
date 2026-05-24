import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import Dashboard from "./Dashboard";

export default async function Home() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return <Dashboard user={user} />;
}
