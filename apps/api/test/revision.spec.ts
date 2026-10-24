import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { sourceRevision } from "../src/services/revision.js";

describe("sourceRevision", () => {
  it("matches the sha256 hex digest of the markdown", () => {
    const md = "# Cache-Aside\n\nCheck the cache first.";
    expect(sourceRevision(md)).toBe(
      createHash("sha256").update(md, "utf8").digest("hex"),
    );
  });

  it("changes when the source changes", () => {
    expect(sourceRevision("version a")).not.toBe(sourceRevision("version b"));
  });

  it("is stable for identical sources", () => {
    expect(sourceRevision("same")).toBe(sourceRevision("same"));
  });
});
