import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatStats, type PlayerStats } from "@/lib/stats/calculator";
import { StatCard } from "@/components/stats/StatCard";
import Link from "next/link";

export default async function StatsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: statsRows } = await supabase
    .from("statistics")
    .select("*")
    .eq("player_id", user.id);

  const stats: Record<string, PlayerStats> = {};
  statsRows?.forEach((row) => {
    const s = formatStats(row);
    stats[s.gameMode] = s;
  });

  const modes = [
    { key: "501", label: "501 SIDO" },
    { key: "301", label: "301 DIDO" },
    { key: "cricket", label: "Cricket" },
  ] as const;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Statistics</h1>
          <Link
            href="/"
            className="text-sm text-zinc-400 hover:text-white"
          >
            Back
          </Link>
        </div>

        {modes.map(({ key, label }) => {
          const s = stats[key];

          if (!s || s.gamesPlayed === 0) {
            return (
              <div key={key} className="mt-8">
                <h2 className="text-lg font-semibold text-zinc-300">{label}</h2>
                <p className="mt-2 text-sm text-zinc-500">
                  No games played yet.
                </p>
              </div>
            );
          }

          const isX01 = key !== "cricket";

          return (
            <div key={key} className="mt-8">
              <h2 className="text-lg font-semibold text-zinc-300">{label}</h2>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <StatCard
                  label="W / L"
                  value={`${s.wins} / ${s.losses}`}
                  subtitle={`${s.gamesPlayed} games`}
                />
                {isX01 && (
                  <>
                    <StatCard
                      label="3-Dart Avg"
                      value={s.threeDartAvg.toFixed(1)}
                    />
                    <StatCard
                      label="First 9 Avg"
                      value={s.first9Avg.toFixed(1)}
                    />
                    <StatCard
                      label="Checkout %"
                      value={`${s.checkoutPct.toFixed(0)}%`}
                    />
                    <StatCard
                      label="Highest CO"
                      value={s.highestCheckout || "-"}
                    />
                    <StatCard
                      label="Best Leg"
                      value={s.bestLeg ? `${s.bestLeg} darts` : "-"}
                    />
                    <StatCard label="180s" value={s.count180} />
                    <StatCard label="Ton+" value={s.tonPlus} />
                  </>
                )}
                {!isX01 && (
                  <StatCard
                    label="Marks/Round"
                    value={s.marksPerRound.toFixed(2)}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
