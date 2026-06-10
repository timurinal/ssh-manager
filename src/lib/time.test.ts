import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fmtDur, relTime, shortStamp } from "./time";

const NOW = new Date("2026-06-11T12:00:00Z");
const minsAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

describe("relTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("returns 'never' for undefined", () => {
    expect(relTime(undefined)).toBe("never");
  });

  it("returns 'never' for unparseable input", () => {
    expect(relTime("not-a-date")).toBe("never");
  });

  it("returns 'just now' under a minute", () => {
    expect(relTime(NOW.toISOString())).toBe("just now");
    expect(relTime(minsAgo(0.5))).toBe("just now");
  });

  it("formats minutes", () => {
    expect(relTime(minsAgo(1))).toBe("1m ago");
    expect(relTime(minsAgo(59))).toBe("59m ago");
  });

  it("formats hours", () => {
    expect(relTime(minsAgo(60))).toBe("1h ago");
    expect(relTime(minsAgo(23 * 60 + 59))).toBe("23h ago");
  });

  it("returns 'yesterday' for exactly one day", () => {
    expect(relTime(minsAgo(24 * 60))).toBe("yesterday");
    expect(relTime(minsAgo(47 * 60))).toBe("yesterday");
  });

  it("formats days under a week", () => {
    expect(relTime(minsAgo(2 * 24 * 60))).toBe("2d ago");
    expect(relTime(minsAgo(6 * 24 * 60))).toBe("6d ago");
  });

  it("formats weeks under five", () => {
    expect(relTime(minsAgo(7 * 24 * 60))).toBe("1w ago");
    expect(relTime(minsAgo(34 * 24 * 60))).toBe("4w ago");
  });

  it("falls back to a calendar date at five weeks", () => {
    const out = relTime(minsAgo(35 * 24 * 60));
    expect(out).not.toMatch(/ago|never|yesterday|just now/);
    expect(out.length).toBeGreaterThan(0);
  });
});

describe("shortStamp", () => {
  it("renders date and 24h time separated by a comma", () => {
    const out = shortStamp("2026-06-03T19:42:00");
    const [date, time] = out.split(", ");
    expect(date).toBeTruthy();
    // 24h clock: no AM/PM marker, minutes preserved
    expect(time).toMatch(/42/);
    expect(out).not.toMatch(/AM|PM/i);
  });
});

describe("fmtDur", () => {
  it("formats sub-minute durations with zero-padded seconds", () => {
    expect(fmtDur(0)).toBe("0m 00s");
    expect(fmtDur(5)).toBe("0m 05s");
    expect(fmtDur(59)).toBe("0m 59s");
  });

  it("formats minutes with zero-padded seconds", () => {
    expect(fmtDur(60)).toBe("1m 00s");
    expect(fmtDur(24 * 60 + 11)).toBe("24m 11s");
    expect(fmtDur(59 * 60 + 59)).toBe("59m 59s");
  });

  it("formats hours with zero-padded minutes, dropping seconds", () => {
    expect(fmtDur(3600)).toBe("1h 00m");
    expect(fmtDur(3600 + 2 * 60 + 30)).toBe("1h 02m");
    expect(fmtDur(25 * 3600 + 15 * 60)).toBe("25h 15m");
  });
});
