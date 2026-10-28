// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { describe, expect, it } from "vitest";
import { cloudLabel, formatDate, gigabytes, initials, memoryAndStorage, plural, relativeTime, size } from "./format";

describe("sizes", () => {
  it("puts a space before GB", () => {
    expect(size("8GB")).toBe("8 GB");
    expect(size("16 gb")).toBe("16 GB");
    expect(size("0.5GB")).toBe("0.5 GB");
  });
  it("leaves anything else as Aura sent it, and handles nothing", () => {
    expect(size("big")).toBe("big");
    expect(size(null)).toBe("");
    expect(size(undefined)).toBe("");
  });
  it("shows memory and storage together, or memory alone for a free instance", () => {
    expect(memoryAndStorage("8GB", "16GB")).toBe("8 GB · 16 GB");
    expect(memoryAndStorage("1GB", null)).toBe("1 GB");
    expect(memoryAndStorage(null, null)).toBe("");
  });
  it("reads gigabytes as a number for sorting", () => {
    expect(gigabytes("16GB")).toBe(16);
    expect(gigabytes("2GB")).toBe(2);
    expect(gigabytes("x")).toBeNaN();
    expect(gigabytes(null)).toBeNaN();
  });
});

describe("dates", () => {
  it("formats a date in UTC", () => {
    expect(formatDate("2026-03-12T09:03:00Z")).toBe("12 Mar 2026");
    expect(formatDate("2026-01-01T00:30:00Z")).toBe("1 Jan 2026");
  });
  it("is empty for nothing or nonsense", () => {
    expect(formatDate(null)).toBe("");
    expect(formatDate("not a date")).toBe("");
  });
});

describe("relativeTime", () => {
  const now = Date.parse("2026-10-28T12:00:00Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();
  const S = 1000, M = 60 * S, H = 60 * M, D = 24 * H;

  it.each([
    [10 * S, "just now"],
    [60 * S, "a minute ago"],
    [2 * M, "2 minutes ago"],
    [44 * M, "44 minutes ago"],
    [60 * M, "an hour ago"],
    [5 * H, "5 hours ago"],
    [30 * H, "a day ago"],
    [3 * D, "3 days ago"],
  ])("says %i ms ago as %s", (ms, text) => {
    expect(relativeTime(ago(ms), now)).toBe(text);
  });

  it("gives the date after about a month", () => {
    expect(relativeTime("2026-03-12T09:03:00Z", now)).toBe("12 Mar 2026");
  });
  it("reads a time in the future (a skewed clock) as just now", () => {
    expect(relativeTime(new Date(now + 5 * M).toISOString(), now)).toBe("just now");
  });
  it("is empty for nothing", () => {
    expect(relativeTime(null, now)).toBe("");
    expect(relativeTime("garbage", now)).toBe("");
  });
});

describe("initials", () => {
  it.each([
    ["orders-prod", "OP"],
    ["analytics-gds", "AG"],
    ["billing_staging v2", "BS"],
    ["sandbox", "SA"],
    ["x", "X"],
    ["--", "?"],
    ["", "?"],
    ["élan vital", "ÉV"],
  ])("makes %s into %s", (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});

describe("small helpers", () => {
  it("pluralises", () => {
    expect(plural(1, "instance")).toBe("1 instance");
    expect(plural(0, "instance")).toBe("0 instances");
    expect(plural(2, "match", "matches")).toBe("2 matches");
  });
  it("names clouds, and passes an unknown one through", () => {
    expect(cloudLabel("gcp")).toBe("GCP");
    expect(cloudLabel("aws")).toBe("AWS");
    expect(cloudLabel("azure")).toBe("Azure");
    expect(cloudLabel("oracle")).toBe("oracle");
    expect(cloudLabel(null)).toBe("");
  });
});
