"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { type Point, headingAlongPaths } from "@/lib/geo";

/** Gira el mapa hasta `target` por el camino más corto, con una animación breve. */
function animateBearing(map: L.Map, target: number, durationMs = 350): Promise<void> {
  const start = map.getBearing();
  const delta = ((target - start + 540) % 360) - 180;
  if (Math.abs(delta) < 0.5) {
    map.setBearing(target);
    return Promise.resolve();
  }
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) {
    map.setBearing(target);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / durationMs);
      const eased = 1 - (1 - t) ** 3;
      map.setBearing(start + delta * eased);
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

/**
 * Con el ratón: arrastrar con el botón derecho (o Ctrl + arrastrar) gira el
 * mapa alrededor de su centro, siguiendo al cursor. En pantallas táctiles el
 * giro con dos dedos ya lo hace el plugin.
 */
function useMouseRotate(map: L.Map) {
  useEffect(() => {
    const el = map.getContainer();
    let start: { angle: number; bearing: number } | null = null;
    let rotated = false;

    const angleOf = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      return (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI;
    };
    const onMove = (e: MouseEvent) => {
      if (!start) return;
      rotated = true;
      map.setBearing(start.bearing + angleOf(e) - start.angle);
    };
    const onUp = () => {
      start = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    const onDown = (e: MouseEvent) => {
      rotated = false;
      if (!(e.button === 2 || (e.button === 0 && e.ctrlKey))) return;
      if ((e.target as HTMLElement).closest("button, .leaflet-control")) return;
      // En captura y antes que Leaflet: así el arrastre gira en vez de desplazar.
      e.preventDefault();
      e.stopPropagation();
      start = { angle: angleOf(e), bearing: map.getBearing() };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    };
    // Un giro con Ctrl + arrastre termina en un clic: no debe fijar el
    // origen/destino en modo selección.
    const onClick = (e: MouseEvent) => {
      if (rotated) {
        rotated = false;
        e.stopPropagation();
      }
    };
    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    el.addEventListener("mousedown", onDown, true);
    el.addEventListener("click", onClick, true);
    el.addEventListener("contextmenu", onContextMenu);
    return () => {
      onUp();
      el.removeEventListener("mousedown", onDown, true);
      el.removeEventListener("click", onClick, true);
      el.removeEventListener("contextmenu", onContextMenu);
    };
  }, [map]);
}

function ControlButton({
  dark,
  title,
  onClick,
  children,
}: {
  dark: boolean;
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  // Vive dentro del contenedor de Leaflet: sin esto el toque también llega
  // al mapa (y en modo selección fijaría el origen/destino ahí).
  useEffect(() => {
    if (!ref.current) return;
    L.DomEvent.disableClickPropagation(ref.current);
    L.DomEvent.disableScrollPropagation(ref.current);
  }, []);
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`flex h-9 w-9 items-center justify-center rounded-full shadow-md border ${
        dark
          ? "bg-slate-800 text-slate-200 border-slate-600 hover:bg-slate-700"
          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

export interface MapRotationControlsProps {
  /** Trazados a los que se puede orientar el mapa (tramos del viaje o rutas). */
  paths: Point[][];
  dark: boolean;
  /** Ubicación del usuario: si está a la vista, se orienta según el tramo más cercano a ella. */
  userPoint?: Point | null;
  /** Posición de la columna de botones dentro del mapa (clases de Tailwind). */
  className?: string;
}

/**
 * Giro del mapa: botón para ponerlo "de frente" a la ruta (la dirección de
 * avance del tramo más cercano queda hacia arriba) y brújula para volver al
 * norte, que solo aparece cuando el mapa está girado.
 */
export default function MapRotationControls({
  paths,
  dark,
  userPoint,
  className = "top-14 right-3",
}: MapRotationControlsProps) {
  const map = useMap();
  const [bearing, setBearingState] = useState(() => map.getBearing());
  useMouseRotate(map);

  useEffect(() => {
    const onRotate = () => setBearingState(map.getBearing());
    map.on("rotate", onRotate);
    return () => {
      map.off("rotate", onRotate);
    };
  }, [map]);

  const orientToRoute = async () => {
    const userInView = userPoint && map.getBounds().contains(userPoint);
    const center = map.getCenter();
    const ref: Point = userInView ? userPoint : [center.lat, center.lng];
    const near = headingAlongPaths(paths, ref);
    if (!near) return;
    // setBearing(θ) gira el mapa θ° en sentido horario, lo que deja arriba la
    // dirección -θ: para ver hacia `heading` el giro es su opuesto.
    await animateBearing(map, 360 - near.heading);
    if (!map.getBounds().contains(near.point)) map.panTo(near.point);
  };

  const rotated = Math.abs(((bearing + 540) % 360) - 180) > 0.5;

  return (
    <div className={`absolute z-[1000] flex flex-col gap-2 ${className}`}>
      {paths.some((p) => p.length >= 2) && (
        <ControlButton dark={dark} title="Orientar el mapa según la ruta" onClick={orientToRoute}>
          {/* Flecha de navegación apuntando hacia arriba */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2 4.5 20.3a.6.6 0 0 0 .85.75L12 17.5l6.65 3.55a.6.6 0 0 0 .85-.75Z" />
          </svg>
        </ControlButton>
      )}
      {rotated && (
        <ControlButton dark={dark} title="Volver al norte" onClick={() => animateBearing(map, 0)}>
          {/* La aguja roja señala el norte real del mapa girado */}
          <svg width="20" height="20" viewBox="0 0 24 24" style={{ transform: `rotate(${bearing}deg)` }}>
            <path d="M12 2 8.5 12h7Z" fill="#dc2626" />
            <path d="M12 22 8.5 12h7Z" fill="currentColor" opacity="0.55" />
          </svg>
        </ControlButton>
      )}
    </div>
  );
}
