import { redirect } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { getCurrentUser } from "@/lib/auth-server";

export default async function InicioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "admin") redirect("/admin");

  return (
    <div className="min-h-screen">
      <Topbar user={user} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
