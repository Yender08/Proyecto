import type { Point } from "./geo";

export interface RouteDTO {
  id: string;
  code: string;
  name: string;
  description: string | null;
  color: string;
  path: Point[];
  active: boolean;
  stops: StopDTO[];
}

/** Solo la geometría de una ruta, para dibujarla de referencia en el editor admin. */
export interface RouteGeometryDTO {
  id: string;
  path: Point[];
  color: string;
}

export interface StopDTO {
  id: string;
  name: string;
  lat: number;
  lng: number;
  sequence?: number;
}

export interface IncidentDTO {
  id: string;
  type: "ACCIDENTE" | "AVERIA" | "TRAFICO" | "DESVIO" | "OTRO";
  status: "ABIERTA" | "EN_ATENCION" | "RESUELTA";
  description: string;
  lat: number;
  lng: number;
  routeId: string | null;
  routeCode: string | null;
  vehicleId: string | null;
  createdAt: string;
  resolvedAt: string | null;
}
