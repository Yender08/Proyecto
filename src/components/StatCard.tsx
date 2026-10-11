export default function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "warning" | "danger" | "success";
}) {
  const toneClasses: Record<string, string> = {
    default: "text-slate-900",
    warning: "text-amber-600",
    danger: "text-red-600",
    success: "text-green-600",
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-semibold uppercase text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${toneClasses[tone]}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}
