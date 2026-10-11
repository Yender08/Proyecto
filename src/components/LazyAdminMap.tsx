"use client";

import dynamic from "next/dynamic";

const LazyAdminMap = dynamic(() => import("./AdminMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[60vh] rounded-xl border border-slate-200 bg-slate-100 animate-pulse flex items-center justify-center text-slate-400">
      Cargando mapa…
    </div>
  ),
});

export default LazyAdminMap;
