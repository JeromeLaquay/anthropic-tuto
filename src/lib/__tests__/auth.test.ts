// @vitest-environment node
import { describe, test, expect, vi, beforeEach } from "vitest";
import { SignJWT } from "jose";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const mockCookieStore = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve(mockCookieStore)),
}));

const JWT_SECRET = new TextEncoder().encode("development-secret-key");

async function makeToken(payload: object, expiresIn = "7d") {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(expiresIn)
    .setIssuedAt()
    .sign(JWT_SECRET);
}

async function makeExpiredToken(payload: object) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("-1s")
    .setIssuedAt()
    .sign(JWT_SECRET);
}

describe("createSession", () => {
  beforeEach(() => vi.clearAllMocks());

  test("sets an httpOnly cookie with a signed JWT", async () => {
    const { createSession } = await import("@/lib/auth");
    await createSession("user-1", "user@example.com");

    expect(mockCookieStore.set).toHaveBeenCalledOnce();
    const [name, token, options] = mockCookieStore.set.mock.calls[0];
    expect(name).toBe("auth-token");
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3);
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
  });

  test("embeds userId and email in the token payload", async () => {
    const { createSession } = await import("@/lib/auth");
    const { jwtVerify } = await import("jose");

    await createSession("user-42", "hello@test.com");

    const token = mockCookieStore.set.mock.calls[0][1];
    const { payload } = await jwtVerify(token, JWT_SECRET);

    expect(payload.userId).toBe("user-42");
    expect(payload.email).toBe("hello@test.com");
  });

  test("sets cookie path to /", async () => {
    const { createSession } = await import("@/lib/auth");
    await createSession("user-1", "user@example.com");

    const options = mockCookieStore.set.mock.calls[0][2];
    expect(options.path).toBe("/");
  });

  test("sets cookie expiry approximately 7 days from now", async () => {
    const before = Date.now();
    const { createSession } = await import("@/lib/auth");
    await createSession("user-1", "user@example.com");
    const after = Date.now();

    const options = mockCookieStore.set.mock.calls[0][2];
    const expires: Date = options.expires;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    expect(expires.getTime()).toBeGreaterThanOrEqual(before + sevenDaysMs - 1000);
    expect(expires.getTime()).toBeLessThanOrEqual(after + sevenDaysMs + 1000);
  });

  test("token exp claim is approximately 7 days from now", async () => {
    const { createSession } = await import("@/lib/auth");
    const { jwtVerify } = await import("jose");

    const before = Math.floor(Date.now() / 1000);
    await createSession("user-1", "user@example.com");
    const after = Math.floor(Date.now() / 1000);

    const token = mockCookieStore.set.mock.calls[0][1];
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const sevenDaysSec = 7 * 24 * 60 * 60;

    expect(payload.exp).toBeGreaterThanOrEqual(before + sevenDaysSec - 5);
    expect(payload.exp).toBeLessThanOrEqual(after + sevenDaysSec + 5);
  });

  test("sets secure flag when NODE_ENV is production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { createSession } = await import("@/lib/auth");
    await createSession("user-1", "user@example.com");

    const options = mockCookieStore.set.mock.calls[0][2];
    expect(options.secure).toBe(true);
    vi.unstubAllEnvs();
  });

  test("does not set secure flag outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { createSession } = await import("@/lib/auth");
    await createSession("user-1", "user@example.com");

    const options = mockCookieStore.set.mock.calls[0][2];
    expect(options.secure).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe("getSession", () => {
  beforeEach(() => vi.clearAllMocks());

  test("returns null when no cookie is present", async () => {
    mockCookieStore.get.mockReturnValue(undefined);
    const { getSession } = await import("@/lib/auth");
    const session = await getSession();
    expect(session).toBeNull();
  });

  test("returns session payload for a valid token", async () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const token = await makeToken({ userId: "u1", email: "a@b.com", expiresAt });
    mockCookieStore.get.mockReturnValue({ value: token });

    const { getSession } = await import("@/lib/auth");
    const session = await getSession();

    expect(session).not.toBeNull();
    expect(session?.userId).toBe("u1");
    expect(session?.email).toBe("a@b.com");
  });

  test("returns null for an expired token", async () => {
    const token = await makeExpiredToken({ userId: "u1", email: "a@b.com" });
    mockCookieStore.get.mockReturnValue({ value: token });

    const { getSession } = await import("@/lib/auth");
    const session = await getSession();
    expect(session).toBeNull();
  });

  test("returns null for a malformed token", async () => {
    mockCookieStore.get.mockReturnValue({ value: "not.a.jwt" });

    const { getSession } = await import("@/lib/auth");
    const session = await getSession();
    expect(session).toBeNull();
  });
});

describe("deleteSession", () => {
  beforeEach(() => vi.clearAllMocks());

  test("deletes the auth-token cookie", async () => {
    const { deleteSession } = await import("@/lib/auth");
    await deleteSession();
    expect(mockCookieStore.delete).toHaveBeenCalledWith("auth-token");
  });
});

describe("verifySession", () => {
  function makeRequest(cookieHeader?: string) {
    return new NextRequest("http://localhost/", {
      headers: cookieHeader ? { cookie: cookieHeader } : {},
    });
  }

  test("returns null when no cookie is present", async () => {
    const { verifySession } = await import("@/lib/auth");
    const session = await verifySession(makeRequest());
    expect(session).toBeNull();
  });

  test("returns session payload for a valid token", async () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const token = await makeToken({ userId: "u2", email: "b@c.com", expiresAt });

    const { verifySession } = await import("@/lib/auth");
    const session = await verifySession(makeRequest(`auth-token=${token}`));

    expect(session?.userId).toBe("u2");
    expect(session?.email).toBe("b@c.com");
  });

  test("returns null for an expired token", async () => {
    const token = await makeExpiredToken({ userId: "u2", email: "b@c.com" });

    const { verifySession } = await import("@/lib/auth");
    const session = await verifySession(makeRequest(`auth-token=${token}`));
    expect(session).toBeNull();
  });

  test("returns null for a malformed token", async () => {
    const { verifySession } = await import("@/lib/auth");
    const session = await verifySession(makeRequest("auth-token=garbage"));
    expect(session).toBeNull();
  });
});
