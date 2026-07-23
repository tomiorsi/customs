import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-server";
import { landingPath } from "@/lib/roles";
import { Landing } from "@/components/landing/landing";

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect(landingPath(user.role));
  return <Landing />;
}
