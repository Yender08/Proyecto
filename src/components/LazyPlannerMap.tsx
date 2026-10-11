"use client";

import dynamic from "next/dynamic";

const LazyPlannerMap = dynamic(() => import("./PlannerMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full lg:h-[70vh] lg:rounded-xl lg:border lg:border-slate-200 bg-slate-100 animate-pulse flex items-center justify-center text-slate-400">
      Cargando mapa…
    </div>
  ),
});

export default LazyPlannerMap;
