import { describe, expect, it } from "vitest";
// @ts-expect-error plain JS module outside workspace root
import { compileAnalysis, slug } from "../../../workflows/src/analysis-compiler.js";

const ANALYSIS = [
  "Title: Cache-Aside Read Path",
  "*   Components: Application, Cache (Redis), Database (PostgreSQL).",
  "*   Flow 1 (Read hit): Application $\\rightarrow$ Cache",
  "*   Flow 2 (Read miss): Application $\\rightarrow$ Cache $\\rightarrow$ Database",
  "*   Flow 3 (Write): Application $\\rightarrow$ Database, invalidate Cache",
  "*   Assumptions: TTL value not stated.",
  "*   Summary: Reads check Redis first, then PostgreSQL on miss.",
].join("\n");

describe("compileAnalysis", () => {
  it("compiles architecture mode with services and deduped edges", () => {
    const out = compileAnalysis(ANALYSIS, { mode: "architecture", model: "test-model" });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.mermaid).toContain("architecture-beta");
    expect(out.result.mermaid).toContain("service cache(cache)[Cache] in app");
    expect((out.result.mermaid.match(/ -- /g) || []).length).toBeLessThanOrEqual(6);
    expect(out.result.title).toBe("Cache-Aside Read Path");
    expect(out.result.assumptions).toEqual(["TTL value not stated."]);
    expect(out.result.promptVersion).toBe("architecture-v2-compiled");
  });

  it("normalizes LaTeX arrows and dedupes repeated flows", () => {
    const out = compileAnalysis(ANALYSIS, { mode: "architecture", model: "m" });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect((out.result.mermaid.match(/application/g) || []).length).toBeGreaterThan(0);
    // app->cache and cache->db and app->db = 3 unique edges
    expect((out.result.mermaid.match(/\n    \w+:[RLTB] -- [RLTB]:\w+/g) || []).length).toBe(3);
  });

  it("compiles flowchart mode with labeled edges", () => {
    const out = compileAnalysis(ANALYSIS, { mode: "flowchart", model: "m" });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.mermaid).toContain("flowchart TD");
    expect(out.result.mermaid).toContain("-->|Read hit|");
    expect(out.result.promptVersion).toBe("flowchart-v2-compiled");
  });

  it("compiles sequence mode with participants in order", () => {
    const out = compileAnalysis(ANALYSIS, { mode: "sequence", model: "m" });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.mermaid).toContain("sequenceDiagram");
    expect(out.result.mermaid).toContain("->>");
    expect(out.result.mermaid.indexOf("participant application")).toBeGreaterThan(-1);
  });

  it("rejects structureless replies", () => {
    const out = compileAnalysis("Total garbage, no labels at all", { mode: "architecture", model: "m" });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.code).toBe("analysis_unusable");
  });

  it("maps component icons by keyword", () => {
    expect(slug("Cache (Redis)")).toBe("cache-redis");
    const out = compileAnalysis(
      "Title: T\nComponents: App server, Redis cache, Postgres database\nFlow 1: App server -> Redis cache -> Postgres database",
      { mode: "architecture", model: "m" },
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.mermaid).toContain("redis-cache(cache)");
    expect(out.result.mermaid).toContain("postgres-database(database)");
  });
});
