import Link from "next/link";

export default function SiteNavbar() {
  return (
    <header className="sticky top-0 z-[1000] bg-white border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg text-blue-700">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white text-sm">
            MM
          </span>
          Muévete Maracaibo
        </Link>
        <nav className="flex items-center gap-6 text-sm font-medium text-slate-600">
          <Link href="/" className="hover:text-blue-700">
            Planificador
          </Link>
          <Link
            href="/admin/login"
            className="rounded-lg bg-slate-900 text-white px-3 py-1.5 hover:bg-slate-700"
          >
            Panel operador
          </Link>
        </nav>
      </div>
    </header>
  );
}
