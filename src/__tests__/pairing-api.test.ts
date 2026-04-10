import { describe, it, expect, vi, beforeEach } from "vitest";

// Chain builder for query mocks
function createChainedQuery() {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.gt = vi.fn(() => chain);
  chain.single = vi.fn(() => ({ data: null, error: null }));
  chain.update = vi.fn(() => chain);
  chain.insert = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.or = vi.fn(() => chain);
  return chain;
}

let queryChain = createChainedQuery();

const mockSupabase = {
  from: vi.fn(() => queryChain),
  auth: {
    getUser: vi.fn(),
  },
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}));

// Import after mocking
const { POST, PUT } = await import("@/app/api/pairing/route");
const { GET } = await import("@/app/api/pairing/status/route");

beforeEach(() => {
  vi.clearAllMocks();
  queryChain = createChainedQuery();
  mockSupabase.from.mockReturnValue(queryChain);
});

describe("POST /api/pairing (camera creates code)", () => {
  it("creates a pairing code and returns it", async () => {
    queryChain.single.mockResolvedValue({
      data: { id: "pairing-123" },
      error: null,
    });

    const res = await POST();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.code).toMatch(/^\d{6}$/);
    expect(body.pairingId).toBe("pairing-123");
    expect(body.expiresAt).toBeDefined();

    // Verify insert was called with correct params
    expect(mockSupabase.from).toHaveBeenCalledWith("camera_pairings");
    expect(queryChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "pending",
        pairing_code: expect.stringMatching(/^\d{6}$/),
      })
    );
  });

  it("returns 500 on database error", async () => {
    queryChain.single.mockResolvedValue({
      data: null,
      error: { message: "DB error" },
    });

    const res = await POST();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("DB error");
  });
});

describe("PUT /api/pairing (scoring device claims code)", () => {
  it("returns 401 when not authenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
    });

    const req = new Request("http://localhost/api/pairing", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "123456" }),
    });

    const res = await PUT(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 400 for invalid code format", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const req = new Request("http://localhost/api/pairing", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "abc" }),
    });

    const res = await PUT(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid code format");
  });

  it("returns 404 when code not found or expired", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    queryChain.single.mockResolvedValue({
      data: null,
      error: { message: "No rows" },
    });

    const req = new Request("http://localhost/api/pairing", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "123456" }),
    });

    const res = await PUT(req);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Code not found or expired");
  });

  it("claims a valid code successfully", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    // First call: lookup pending pairing
    const lookupChain = createChainedQuery();
    lookupChain.single.mockResolvedValue({
      data: { id: "pairing-456" },
      error: null,
    });

    // Second call: update pairing
    const updateChain = createChainedQuery();
    updateChain.eq.mockResolvedValue({
      error: null,
    });

    let callCount = 0;
    mockSupabase.from.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? lookupChain : updateChain;
    });

    const req = new Request("http://localhost/api/pairing", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "123456", sessionId: "session-1" }),
    });

    const res = await PUT(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.paired).toBe(true);
  });
});

describe("GET /api/pairing/status (camera polls)", () => {
  it("returns 400 for missing code", async () => {
    const { NextRequest } = await import("next/server");
    const nextReq = new NextRequest("http://localhost/api/pairing/status");

    const res = await GET(nextReq);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid code");
  });

  it("returns 400 for invalid code format", async () => {
    const { NextRequest } = await import("next/server");
    const nextReq = new NextRequest(
      "http://localhost/api/pairing/status?code=abc"
    );

    const res = await GET(nextReq);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid code");
  });

  it("returns 404 when code not found", async () => {
    queryChain.single.mockResolvedValue({
      data: null,
      error: { message: "Not found" },
    });

    const { NextRequest } = await import("next/server");
    const nextReq = new NextRequest(
      "http://localhost/api/pairing/status?code=123456"
    );

    const res = await GET(nextReq);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Code not found");
  });

  it("returns status for valid code", async () => {
    queryChain.single.mockResolvedValue({
      data: { status: "pending" },
      error: null,
    });

    const { NextRequest } = await import("next/server");
    const nextReq = new NextRequest(
      "http://localhost/api/pairing/status?code=123456"
    );

    const res = await GET(nextReq);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("pending");
  });

  it("returns paired status when code has been claimed", async () => {
    queryChain.single.mockResolvedValue({
      data: { status: "paired" },
      error: null,
    });

    const { NextRequest } = await import("next/server");
    const nextReq = new NextRequest(
      "http://localhost/api/pairing/status?code=654321"
    );

    const res = await GET(nextReq);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("paired");
  });
});
