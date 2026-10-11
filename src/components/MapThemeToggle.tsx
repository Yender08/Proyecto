"use client";

export default function MapThemeToggle({
  dark,
  onToggle,
}: {
  dark: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={dark ? "Cambiar a mapa claro" : "Cambiar a mapa oscuro"}
      className={`absolute top-3 right-3 z-[1000] flex h-9 w-9 items-center justify-center rounded-full shadow-md border ${
        dark
          ? "bg-slate-800 text-slate-200 border-slate-600 hover:bg-slate-700"
          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
      }`}
    >
      {dark ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
        </svg>
      )}
    </button>
  );
}
