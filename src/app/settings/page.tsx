"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const router = useRouter();
  const [streamKey, setStreamKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const { data: player } = await supabase
        .from("players")
        .select("stream_key_encrypted")
        .eq("id", user.id)
        .single();

      if (player?.stream_key_encrypted) {
        setStreamKey("••••••••••••••••");
      }
      setLoading(false);
    }
    load();
  }, [router]);

  async function saveStreamKey() {
    if (!streamKey || streamKey === "••••••••••••••••") return;

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    // In production, encrypt before storing. For now, store as-is.
    // The compositing server will handle decryption.
    await supabase
      .from("players")
      .update({ stream_key_encrypted: streamKey })
      .eq("id", user.id);

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="text-zinc-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-md px-4 py-12">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Settings</h1>
          <button
            onClick={() => router.push("/")}
            className="text-sm text-zinc-400 hover:text-white"
          >
            Back
          </button>
        </div>

        <div className="mt-8">
          <label className="block text-sm font-medium text-zinc-400">
            YouTube Stream Key
          </label>
          <p className="mt-1 text-xs text-zinc-500">
            Find this in YouTube Studio &gt; Go Live &gt; Stream Key
          </p>
          <input
            type="password"
            value={streamKey}
            onChange={(e) => setStreamKey(e.target.value)}
            onFocus={() => {
              if (streamKey === "••••••••••••••••") setStreamKey("");
            }}
            placeholder="xxxx-xxxx-xxxx-xxxx-xxxx"
            className="mt-2 w-full rounded-lg bg-zinc-800 px-4 py-3 text-white placeholder-zinc-600 outline-none ring-1 ring-zinc-700 focus:ring-emerald-500"
          />
          <button
            onClick={saveStreamKey}
            className="mt-3 w-full rounded-lg bg-emerald-600 py-3 text-sm font-bold transition-colors hover:bg-emerald-500"
          >
            {saved ? "Saved!" : "Save Stream Key"}
          </button>
        </div>

      </div>
    </div>
  );
}
