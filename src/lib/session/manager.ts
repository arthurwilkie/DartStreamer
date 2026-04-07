import { createClient } from "@/lib/supabase/server";

export interface Session {
  id: string;
  userId: string;
  status: "active" | "ended";
  createdAt: string;
  endedAt: string | null;
}

export async function createSession(userId: string): Promise<string> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sessions")
    .insert({
      user_id: userId,
      status: "active",
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create session");
  }

  return data.id as string;
}

export async function endSession(sessionId: string): Promise<void> {
  const supabase = await createClient();

  // Stop stream if live before marking session ended
  try {
    const MEDIA_SERVER_URL =
      process.env.NEXT_PUBLIC_MEDIA_SERVER_URL ?? "http://localhost:4000";
    await fetch(`${MEDIA_SERVER_URL}/api/stream/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId: sessionId }),
    });
  } catch {
    // Best-effort — don't fail the session end if stream stop fails
  }

  const { error } = await supabase
    .from("sessions")
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .eq("id", sessionId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function getActiveSession(userId: string): Promise<Session | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sessions")
    .select("id, user_id, status, created_at, ended_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) return null;

  return {
    id: data.id as string,
    userId: data.user_id as string,
    status: data.status as "active" | "ended",
    createdAt: data.created_at as string,
    endedAt: data.ended_at as string | null,
  };
}
