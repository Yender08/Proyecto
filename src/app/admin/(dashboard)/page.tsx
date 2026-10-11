import { prisma } from "@/lib/db";
import StatCard from "@/components/StatCard";
import LazyMap from "@/components/LazyMap";
import type { RouteDTO } from "@/lib/types";
import type { Point } from "@/lib/geo";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const [routes, vehicleCounts, incidentCounts, stops, routeCount] = await Promise.all([
    prisma.route.findMany({ where: { active: true } }),
    prisma.vehicle.groupBy({ by: ["status"], _count: true }),
    prisma.incident.groupBy({ by: ["status"], _count: true }),
    prisma.stop.findMany(),
    prisma.route.count({ where: { active: true } }),
  ]);

  const activeVehicles = vehicleCounts.find((v) => v.status === "ACTIVE")?._count ?? 0;
  const maintenanceVehicles = vehicleCounts.find((v) => v.status === "MAINTENANCE")?._count ?? 0;
  const outOfServiceVehicles =
    vehicleCounts.find((v) => v.status === "OUT_OF_SERVICE")?._count ?? 0;
  const openIncidents =
    (incidentCounts.find((i) => i.status === "ABIERTA")?._count ?? 0) +
    (incidentCounts.find((i) => i.status === "EN_ATENCION")?._count ?? 0);

  const routeDTOs: RouteDTO[] = routes.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description,
    color: r.color,
    path: r.path as unknown as Point[],
    active: r.active,
    stops: [],
  }));

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Panel general</h1>
        <p className="text-sm text-slate-500">
          Cobertura de la red y estado operativo de la flota registrada.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Unidades activas" value={activeVehicles} tone="success" />
        <StatCard label="En mantenimiento" value={maintenanceVehicles} tone="warning" />
        <StatCard label="Fuera de servicio" value={outOfServiceVehicles} tone="danger" />
        <StatCard label="Incidencias abiertas" value={openIncidents} tone="warning" />
        <StatCard label="Rutas activas" value={routeCount} />
        <StatCard label="Paradas registradas" value={stops.length} />
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Red de rutas registrada</h2>
        <LazyMap routes={routeDTOs} stops={stops} heightClassName="h-[55vh]" />
      </div>
    </div>
  );
}
