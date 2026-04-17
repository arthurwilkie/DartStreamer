"use client";

import { useState } from "react";

interface ProfileFormProps {
  initialDisplayName: string;
  initialNickname: string;
}

export function ProfileForm({ initialDisplayName, initialNickname }: ProfileFormProps) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [nickname, setNickname] = useState(initialNickname);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setStatus("saving");
    setError(null);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName, nickname }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to save");
      setStatus("error");
      return;
    }
    setStatus("saved");
    setTimeout(() => setStatus("idle"), 1500);
  }

  return (
    <div className="mt-8 space-y-4">
      <div>
        <label className="text-sm text-zinc-400">Display name</label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={50}
          className="mt-1 w-full rounded-lg bg-zinc-800 px-3 py-2 text-white outline-none ring-emerald-500 focus:ring-2"
        />
      </div>
      <div>
        <label className="text-sm text-zinc-400">Nickname</label>
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={24}
          placeholder="Short name for scoreboards (optional)"
          className="mt-1 w-full rounded-lg bg-zinc-800 px-3 py-2 text-white outline-none ring-emerald-500 focus:ring-2"
        />
        <p className="mt-1 text-xs text-zinc-500">
          Used in compact scoreboard & broadcast displays. Up to 24 characters.
        </p>
      </div>
      {error && <div className="rounded-lg bg-red-900/40 p-2 text-sm text-red-200">{error}</div>}
      <button
        onClick={save}
        disabled={status === "saving"}
        className="rounded-xl bg-emerald-600 px-6 py-2 font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
      >
        {status === "saving" ? "Saving…" : status === "saved" ? "Saved ✓" : "Save"}
      </button>
    </div>
  );
}
