// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { describe, expect, it } from "vitest";
import { applyTheme, loadTheme, nextTheme, saveTheme } from "./theme";

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
};

describe("theme", () => {
  it("follows the system until a choice is saved", () => {
    expect(loadTheme(memory())).toBe("auto");
  });
  it("remembers a choice", () => {
    const s = memory();
    saveTheme("dark", s);
    expect(loadTheme(s)).toBe("dark");
  });
  it("ignores a saved value that is not a theme", () => {
    const s = memory();
    s.setItem("gwa-theme", "neon");
    expect(loadTheme(s)).toBe("auto");
  });
  it("copes with storage that throws (private windows, blocked site data)", () => {
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(loadTheme(broken)).toBe("auto");
    expect(() => saveTheme("dark", broken)).not.toThrow();
  });
  it("cycles auto, light, dark and back", () => {
    expect(nextTheme("auto")).toBe("light");
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("auto");
  });
  it("sets data-theme for light and dark and removes it for auto", () => {
    const attrs: Record<string, string | undefined> = {};
    const root = { dataset: attrs, removeAttribute: () => { delete attrs.theme; } };
    applyTheme("dark", root);
    expect(attrs.theme).toBe("dark");
    applyTheme("light", root);
    expect(attrs.theme).toBe("light");
    applyTheme("auto", root);
    expect(attrs.theme).toBeUndefined();
  });
});
