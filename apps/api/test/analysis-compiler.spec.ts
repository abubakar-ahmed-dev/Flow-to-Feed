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

function edgeLines(mermaid: string): string[] {
  return mermaid.split("\n").filter((l) => /-->| --- /.test(l));
}

describe("compileAnalysis", () => {
  it("compiles architecture mode as labeled color-coded flowchart LR", () => {
    const out = compileAnalysis(ANALYSIS, { mode: "architecture", model: "test-model" });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.mermaid).toContain("flowchart LR");
    expect(out.result.mermaid).toContain('cache("Cache")'); // rounded cache node
    expect(out.result.mermaid).toContain('database[("Database")]'); // cylinder DB node
    expect(out.result.mermaid).toContain("linkStyle"); // per-flow coloring
    expect(out.result.mermaid).toContain("-->|Read hit|"); // labeled first hop
    // deduped edges: app->cache, cache->db, app->db
    expect(edgeLines(out.result.mermaid).length).toBe(3);
    expect(out.result.title).toBe("Cache-Aside Read Path");
    expect(out.result.assumptions).toEqual(["TTL value not stated."]);
    expect(out.result.promptVersion).toBe("architecture-v3-labeled");
  });

  it("normalizes LaTeX arrows and assigns one color per flow", () => {
    const out = compileAnalysis(ANALYSIS, { mode: "architecture", model: "m" });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect((out.result.mermaid.match(/application/g) || []).length).toBeGreaterThan(0);
    const colors = out.result.mermaid.match(/linkStyle [\d,]+ stroke:(#[0-9a-f]{6})/g) || [];
    const distinct = new Set(colors.map((c) => c.split("stroke:")[1]));
    expect(distinct.size).toBeGreaterThanOrEqual(2); // hit vs miss vs write paths differ
  });

  it("compiles flowchart mode with labeled colored edges", () => {
    const out = compileAnalysis(ANALYSIS, { mode: "flowchart", model: "m" });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.mermaid).toContain("flowchart TD");
    expect(out.result.mermaid).toContain("-->|Read hit|");
    expect(out.result.mermaid).toContain("linkStyle");
    expect(out.result.promptVersion).toBe("flowchart-v3-labeled");
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

  it("maps node shapes by keyword", () => {
    expect(slug("Cache (Redis)")).toBe("cache-redis");
    const out = compileAnalysis(
      "Title: T\nComponents: App server, Redis cache, Postgres database\nFlow 1: App server -> Redis cache -> Postgres database",
      { mode: "architecture", model: "m" },
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.mermaid).toContain('redis-cache("Redis cache")');
    expect(out.result.mermaid).toContain('postgres-database[("Postgres database")]');
  });

  it("filters echoed rule text and connector fragments from components", () => {
    const out = compileAnalysis(
      [
        "Title: Cache Mechanism (4 words).*",
        "Components: Application, Redis, PostgreSQL, Database, then Application, max 3 words each, <Component>, Yes",
        "Flow 1 (cache miss): Application -> PostgreSQL -> Redis - Yes -> None",
        "Flow 2 (write): Application -> PostgreSQL, invalidate Redis",
        "Assumptions: None",
        "Summary: Reads check Redis first.",
      ].join("\n"),
      { mode: "architecture", model: "m" },
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.title).toBe("Cache Mechanism"); // meta parens + trailing .* stripped
    const mermaid = out.result.mermaid;
    expect(mermaid).not.toContain("then");
    expect(mermaid).not.toContain("max 3");
    expect(mermaid).not.toContain("<Component>");
    expect(mermaid).not.toContain("None");
    expect(mermaid).toContain('application["Application"]');
    expect(mermaid).toContain('redis("Redis")');
    expect(mermaid).toContain('postgresql[("PostgreSQL")]');
  });
});
