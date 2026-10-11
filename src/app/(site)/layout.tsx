import SiteNavbar from "@/components/SiteNavbar";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteNavbar />
      <main className="flex-1">{children}</main>
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-400">
        Muévete Maracaibo — rutas y paradas registradas por los operadores del sistema de transporte.
      </footer>
    </div>
  );
}
