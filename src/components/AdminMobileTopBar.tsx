"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ADMIN_LINKS } from "@/components/AdminSidebar";

export default function AdminMobileTopBar({ name, role }: { name: string; role: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <div className="lg:hidden">
      <div className="h-14 px-3 flex items-center justify-between border-b border-slate-200 bg-white sticky top-0 z-[1500]">
        <button
          onClick={() => setOpen(true)}
          aria-label="Abrir menú"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-white text-xs font-bold">
            MM
          </span>
          <span className="text-sm font-semibold">Movilidad Mcbo</span>
        </div>
        <div className="w-9" />
      </div>

      {open && (
        // z-index muy por encima de los controles internos de Leaflet
        // (z-index: 1000), que de otro modo se montan encima del menú.
        <div className="fixed inset-0 z-[2000]">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-white flex flex-col shadow-xl">
            <div className="px-4 h-14 flex items-center justify-between border-b border-slate-200">
              <span className="text-sm font-semibold">Menú</span>
              <button
                onClick={() => setOpen(false)}
                aria-label="Cerrar menú"
                className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <nav className="flex-1 py-4 space-y-1 px-2">
              {ADMIN_LINKS.map((l) => {
                const active = l.exact ? pathname === l.href : pathname.startsWith(l.href);
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
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
                onClick={() => setOpen(false)}
                className="mt-2 block text-center text-[11px] text-slate-400 hover:text-blue-600"
              >
                Ver sitio público
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
