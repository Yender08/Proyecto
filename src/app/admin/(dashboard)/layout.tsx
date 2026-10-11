import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import AdminSidebar from "@/components/AdminSidebar";
import AdminMobileTopBar from "@/components/AdminMobileTopBar";

export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/admin/login");

  return (
    <div className="min-h-screen bg-slate-100 lg:flex">
      <AdminMobileTopBar name={session.name} role={session.role} />
      <AdminSidebar name={session.name} role={session.role} />
      <main className="flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}
