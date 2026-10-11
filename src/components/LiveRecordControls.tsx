"use client";

import { useEffect, useState } from "react";
import { formatDistance } from "@/lib/format";

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function LiveRecordControls({
  recording,
  error,
  accuracyMeters,
  distanceMeters,
  pointCount,
  onStart,
  onStop,
}: {
  recording: boolean;
  error: string | null;
  accuracyMeters: number | null;
  distanceMeters: number;
  pointCount: number;
  onStart: () => void;
  onStop: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!recording) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reinicia el cronómetro cuando el padre detiene la grabación
      setElapsed(0);
      return;
    }
    const startedAt = Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [recording]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <h2 className="text-xs font-semibold uppercase text-slate-500">
        Grabar recorrido en tiempo real
      </h2>
      <p className="text-xs text-slate-500">
        Lleva el celular o laptop en la unidad y graba el trazado real mientras recorre la ruta.
      </p>

      {!recording ? (
        <button
          type="button"
          onClick={onStart}
          className="w-full rounded-lg bg-red-600 text-white text-xs font-medium py-2 hover:bg-red-700 flex items-center justify-center gap-2"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-white" />
          Iniciar grabación en vivo
        </button>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-lg bg-red-50 border border-red-100 px-3 py-2">
            <span className="flex items-center gap-2 text-xs font-medium text-red-700">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-600" />
              </span>
              Grabando · {formatElapsed(elapsed)}
            </span>
            <span className="text-xs text-red-700">{formatDistance(distanceMeters)}</span>
          </div>
          <p className="text-[11px] text-slate-400">
            {pointCount} puntos capturados
            {accuracyMeters != null && ` · precisión ±${Math.round(accuracyMeters)} m`}
          </p>
          <button
            type="button"
            onClick={onStop}
            className="w-full rounded-lg bg-slate-900 text-white text-xs font-medium py-2 hover:bg-slate-700"
          >
            Detener grabación
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
