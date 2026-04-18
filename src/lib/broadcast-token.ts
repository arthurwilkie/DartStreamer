import { createHmac, timingSafeEqual } from "crypto";

// HS256 JWT signed with SUPABASE_JWT_SECRET so the token is natively accepted
// by Supabase (RLS policies see the embedded `sub` as the player's user id).

export interface BroadcastClaims {
  sub: string;
  role: "authenticated";
  aud: "authenticated";
  game_id: string;
  purpose: "broadcast-render";
  iat: number;
  exp: number;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function getSecret(): string {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) throw new Error("SUPABASE_JWT_SECRET not configured");
  return secret;
}

export function signBroadcastToken(params: {
  userId: string;
  gameId: string;
  ttlSeconds?: number;
}): { token: string; expiresAt: number } {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (params.ttlSeconds ?? 8 * 60 * 60);
  const header = { alg: "HS256", typ: "JWT" };
  const payload: BroadcastClaims = {
    sub: params.userId,
    role: "authenticated",
    aud: "authenticated",
    game_id: params.gameId,
    purpose: "broadcast-render",
    iat: now,
    exp,
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = createHmac("sha256", getSecret()).update(signingInput).digest();
  return { token: `${signingInput}.${b64url(sig)}`, expiresAt: exp };
}

export function verifyBroadcastToken(token: string): BroadcastClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const signingInput = `${h}.${p}`;
  const expected = createHmac("sha256", getSecret()).update(signingInput).digest();
  const actual = b64urlDecode(s);
  if (expected.length !== actual.length) return null;
  if (!timingSafeEqual(expected, actual)) return null;
  let claims: BroadcastClaims;
  try {
    claims = JSON.parse(b64urlDecode(p).toString("utf8"));
  } catch {
    return null;
  }
  if (claims.purpose !== "broadcast-render") return null;
  if (claims.exp <= Math.floor(Date.now() / 1000)) return null;
  return claims;
}
