"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export const ADMIN_LINKS = [
  { href: "/admin", label: "Panel general", exact: true },
  { href: "/admin/vehiculos", label: "Flota / Unidades" },
  { href: "/admin/rutas", label: "Rutas" },
  { href: "/admin/incidentes", label: "Incidencias" },
];

export default function AdminSidebar({ name, role }: { name: string; role: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <aside className="hidden lg:flex lg:w-60 shrink-0 border-r border-slate-200 bg-white flex-col">
      <div className="px-4 h-16 flex items-center gap-2 border-b border-slate-200">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white text-sm font-bold">
          MM
        </span>
        <div className="leading-tight">
          <div className="text-sm font-semibold">Movilidad Mcbo</div>
          <div className="text-[11px] text-slate-400">Panel operativo</div>
        </div>
      </div>

      <nav className="flex-1 py-4 space-y-1 px-2">
        {ADMIN_LINKS.map((l) => {
          const active = l.exact ? pathname === l.href : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`block rounded-lg px-3 py-2 text-sm font-medium ${
                active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 p-3">
        <div className="text-sm font-medium">{name}</div>
        <div className="text-[11px] text-slate-400 mb-2">{role}</div>
        <button
          onClick={logout}
          className="w-full rounded-lg border border-slate-300 text-xs font-medium py-1.5 hover:bg-slate-50"
        >
          Cerrar sesión
        </button>
        <Link
          href="/"
          className="mt-2 block text-center text-[11px] text-slate-400 hover:text-blue-600"
        >
          Ver sitio público
        </Link>
      </div>
    </aside>
  );
}
