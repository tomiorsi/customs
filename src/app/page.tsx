import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-server";
import { landingPath } from "@/lib/roles";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  redirect(landingPath(user.role));
}
