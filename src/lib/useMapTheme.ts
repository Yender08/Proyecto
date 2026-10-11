"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "mvb-map-theme";

/** Preferencia de tema del mapa (claro/oscuro), compartida entre todos los mapas y recordada por navegador. */
export function useMapTheme() {
  const [dark, setDark] = useState(false);

  // localStorage/matchMedia solo existen en cliente; leerlos en el render
  // inicial (en vez de en este efecto) rompería la hidratación SSR.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setDark(stored === "dark");
      } else {
        setDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
      }
    } catch {
      // localStorage no disponible (modo privado, etc.): se queda en claro.
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  function toggle() {
    setDark((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
      } catch {
        // ignorar si no se puede persistir
      }
      return next;
    });
  }

  return { dark, toggle };
}
