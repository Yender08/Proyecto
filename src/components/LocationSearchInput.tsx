"use client";

import { useEffect, useRef, useState } from "react";
import type { Point } from "@/lib/geo";

// Caja delimitadora aproximada de Maracaibo, para acotar la búsqueda de direcciones.
const MARACAIBO_VIEWBOX = "-71.70,10.75,-71.54,10.53";

interface Suggestion {
  label: string;
  point: Point;
}

export default function LocationSearchInput({
  placeholder,
  value,
  onSelect,
}: {
  placeholder: string;
  value: string;
  onSelect: (point: Point, label: string) => void;
}) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza el buffer de texto cuando el padre fija un valor externamente (geolocalización, clic en mapa)
    setQuery(value);
  }, [value]);

  function handleChange(text: string) {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (text.trim().length < 3) {
      setSuggestions([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const url = new URL("https://nominatim.openstreetmap.org/search");
        url.searchParams.set("format", "json");
        url.searchParams.set("q", text);
        url.searchParams.set("viewbox", MARACAIBO_VIEWBOX);
        url.searchParams.set("bounded", "1");
        url.searchParams.set("limit", "6");
        const res = await fetch(url.toString());
        const data = await res.json();
        setSuggestions(
          data.map((d: { display_name: string; lat: string; lon: string }) => ({
            label: d.display_name,
            point: [Number(d.lat), Number(d.lon)] as Point,
          }))
        );
        setOpen(true);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 450);
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {loading && (
        <span className="absolute right-3 top-2.5 text-[10px] text-slate-400">buscando…</span>
      )}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-[1100] mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {suggestions.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setQuery(s.label);
                  onSelect(s.point, s.label);
                  setOpen(false);
                }}
                className="block w-full text-left px-3 py-2 text-xs hover:bg-blue-50"
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
