import { describe, it, expect } from "vitest";
import { generatePairingCode, validateCode, PAIRING_EXPIRY_MS } from "@/lib/pairing/codes";

describe("generatePairingCode", () => {
  it("returns a 6-digit string", () => {
    const code = generatePairingCode();
    expect(code).toMatch(/^\d{6}$/);
    expect(code).toHaveLength(6);
  });

  it("pads codes shorter than 6 digits with leading zeros", () => {
    // Generate many codes and verify all are 6 digits
    for (let i = 0; i < 50; i++) {
      const code = generatePairingCode();
      expect(code).toHaveLength(6);
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it("generates different codes on successive calls", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 20; i++) {
      codes.add(generatePairingCode());
    }
    // With 6-digit codes, 20 calls should produce at least 2 unique values
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe("validateCode", () => {
  it("accepts valid 6-digit codes", () => {
    expect(validateCode("123456")).toBe(true);
    expect(validateCode("000000")).toBe(true);
    expect(validateCode("999999")).toBe(true);
  });

  it("rejects non-6-digit strings", () => {
    expect(validateCode("12345")).toBe(false);
    expect(validateCode("1234567")).toBe(false);
    expect(validateCode("")).toBe(false);
    expect(validateCode("abcdef")).toBe(false);
    expect(validateCode("123 456")).toBe(false);
    expect(validateCode("12-456")).toBe(false);
  });
});

describe("PAIRING_EXPIRY_MS", () => {
  it("is 5 minutes in milliseconds", () => {
    expect(PAIRING_EXPIRY_MS).toBe(5 * 60 * 1000);
  });
});
