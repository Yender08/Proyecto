// Carga el plugin leaflet-rotate, que agrega la rotación a L.Map. Usa el `L`
// global, así que debe importarse después de Leaflet (este módulo lo garantiza).
import L from "leaflet";
import "leaflet-rotate";

// El plugin activa por defecto su brújula y Shift + rueda en *todos* los mapas;
// se apagan aquí para que solo los tengan los mapas que piden `rotate`.
L.Map.mergeOptions({ rotateControl: false, shiftKeyRotate: false });

/** Opciones de MapContainer para un mapa que se puede girar. */
export const ROTATABLE_MAP_OPTIONS = {
  rotate: true,
  bearing: 0,
  touchRotate: true,
  shiftKeyRotate: true,
  rotateControl: false,
} as const;
