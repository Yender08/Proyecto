// Tipos de lo que agrega el plugin leaflet-rotate a Leaflet (no trae los suyos).
import "leaflet";

declare module "leaflet" {
  interface MapOptions {
    /** Habilita la rotación del mapa (necesario para el resto de opciones). */
    rotate?: boolean;
    /** Rotación inicial en grados. */
    bearing?: number;
    /** Girar con dos dedos en pantallas táctiles. */
    touchRotate?: boolean;
    /** Girar con Shift + rueda del ratón. */
    shiftKeyRotate?: boolean;
    /** Brújula propia del plugin (se usa una del proyecto en su lugar). */
    rotateControl?: boolean | Record<string, unknown>;
  }

  interface Map {
    /**
     * Gira el mapa `theta` grados en sentido horario: con 90 el norte queda a
     * la derecha y lo que se ve arriba es el oeste.
     */
    setBearing(theta: number): void;
    getBearing(): number;
  }
}
