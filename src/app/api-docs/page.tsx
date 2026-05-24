import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import ApiDocs from "./ApiDocs";

export default async function ApiDocsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return <ApiDocs userName={user.name} />;
}
