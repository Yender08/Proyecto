"use client";

import { useEffect, useRef, useState } from "react";
import { haversineMeters, type Point } from "./geo";

/**
 * Graba un recorrido en tiempo real usando la geolocalización del dispositivo
 * (pensado para que el operador vaya físicamente en la unidad con el
 * celular/laptop abierto). Cada punto nuevo solo se agrega si se alejó lo
 * suficiente del último punto grabado, para no llenar la ruta de ruido del
 * GPS cuando el vehículo está detenido.
 */
export function useLiveTrack(onPoint: (p: Point) => void, minDistanceMeters = 12) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accuracyMeters, setAccuracyMeters] = useState<number | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastPointRef = useRef<Point | null>(null);

  function start() {
    if (!navigator.geolocation) {
      setError("Este navegador no soporta geolocalización.");
      return;
    }
    setError(null);
    setRecording(true);
    lastPointRef.current = null;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setAccuracyMeters(pos.coords.accuracy);
        const p: Point = [pos.coords.latitude, pos.coords.longitude];
        if (!lastPointRef.current || haversineMeters(lastPointRef.current, p) >= minDistanceMeters) {
          lastPointRef.current = p;
          onPoint(p);
        }
      },
      (err) => {
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Permiso de ubicación denegado. Actívalo en el navegador para grabar en vivo."
            : "No se pudo obtener tu ubicación en este momento."
        );
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    );
  }

  function stop() {
    if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
    setRecording(false);
    lastPointRef.current = null;
  }

  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  return { recording, error, accuracyMeters, start, stop };
}
