export const PAIRING_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

export interface PairingCode {
  code: string;
  sessionId: string;
  playerId: string;
  cameraPosition: "left" | "right";
  createdAt: number;
  expiresAt: number;
}

export function generatePairingCode(): string {
  if (
    typeof globalThis !== "undefined" &&
    "crypto" in globalThis &&
    typeof (globalThis.crypto as Crypto).getRandomValues === "function"
  ) {
    const array = new Uint32Array(1);
    (globalThis.crypto as Crypto).getRandomValues(array);
    return String(array[0] % 1_000_000).padStart(6, "0");
  }
  // Node.js environment
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { randomInt } = require("crypto") as { randomInt: (min: number, max: number) => number };
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function validateCode(code: string): boolean {
  return /^\d{6}$/.test(code);
}
