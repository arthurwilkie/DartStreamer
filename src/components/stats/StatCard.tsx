interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
}

export function StatCard({ label, value, subtitle }: StatCardProps) {
  return (
    <div className="rounded-lg bg-zinc-800 p-4">
      <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-white">{value}</div>
      {subtitle && (
        <div className="mt-0.5 text-xs text-zinc-500">{subtitle}</div>
      )}
    </div>
  );
}
