import { describe, expect, it } from "vitest";
import { addr, AUTH_LABEL, DEFAULT_PREFS, ENV_COLOR, NEW_HOST } from "./types";

describe("addr", () => {
  it("formats user@host:port", () => {
    expect(addr({ user: "alice", host: "example.com", port: 22 })).toBe("alice@example.com:22");
  });

  it("keeps non-default ports", () => {
    expect(addr({ user: "u", host: "10.0.0.1", port: 2222 })).toBe("u@10.0.0.1:2222");
  });
});

describe("NEW_HOST", () => {
  it("creates a blank host with sensible defaults", () => {
    const h = NEW_HOST(DEFAULT_PREFS);
    expect(h.id).toBeUndefined();
    expect(h.label).toBe("");
    expect(h.port).toBe(22);
    expect(h.env).toBe("dev");
    expect(h.auth).toBe("key");
    expect(h.identity).toBe("~/.ssh/id_ed25519");
    expect(h.fav).toBe(false);
    expect(h.forwards).toEqual([]);
    expect(h.x11).toBe(false);
  });

  it("inherits compression from prefs", () => {
    expect(NEW_HOST({ ...DEFAULT_PREFS, compression: false }).compression).toBe(false);
    expect(NEW_HOST({ ...DEFAULT_PREFS, compression: true }).compression).toBe(true);
  });

  it("derives keepalive flag from the prefs interval", () => {
    expect(NEW_HOST({ ...DEFAULT_PREFS, keepalive: 30 }).keepalive).toBe(true);
    expect(NEW_HOST({ ...DEFAULT_PREFS, keepalive: 0 }).keepalive).toBe(false);
  });

  it("returns a fresh forwards array each call", () => {
    expect(NEW_HOST(DEFAULT_PREFS).forwards).not.toBe(NEW_HOST(DEFAULT_PREFS).forwards);
  });
});

describe("lookup tables", () => {
  it("covers every env", () => {
    expect(Object.keys(ENV_COLOR).sort()).toEqual(["dev", "personal", "prod", "staging"]);
  });

  it("covers every auth method", () => {
    expect(Object.keys(AUTH_LABEL).sort()).toEqual(["agent", "key", "password"]);
  });
});
