import { describe, expect, it } from "vitest";
import { applyJobEvent } from "../src/services/jobs.js";
import { withStale } from "../src/services/projects.js";

const uuid = "123e4567-e89b-42d3-a456-426614174000";
const baseJob = { state: "queued", stage: null as string | null, attempts: 0 };

describe("applyJobEvent", () => {
  it("counts an attempt on running", () => {
    const patch = applyJobEvent(baseJob, {
      eventId: "evt-1",
      jobId: uuid,
      status: "running",
      stage: "calling_model",
    });
    expect(patch).toEqual({ state: "running", stage: "calling_model", attempts: 1 });
  });

  it("freezes result on success and keeps prior stage when event has none", () => {
    const patch = applyJobEvent(
      { state: "running", stage: "calling_model", attempts: 2 },
      { eventId: "evt-2", jobId: uuid, status: "succeeded", stage: "", result: { mermaid: "graph TD" } },
    );
    expect(patch.state).toBe("succeeded");
    expect(patch.result).toEqual({ mermaid: "graph TD" });
    expect(patch.stage).toBe("calling_model");
  });

  it("records error detail on failure and supplies a fallback error", () => {
    const explicit = applyJobEvent(baseJob, {
      eventId: "evt-3",
      jobId: uuid,
      status: "failed",
      stage: "validating",
      error: { code: "schema_mismatch", message: "missing title" },
    });
    expect(explicit.error).toEqual({ code: "schema_mismatch", message: "missing title" });

    const fallback = applyJobEvent(baseJob, {
      eventId: "evt-4",
      jobId: uuid,
      status: "failed",
      stage: "",
    });
    expect(fallback.error).toEqual({
      code: "unknown",
      message: "Job failed without error detail",
    });
  });
});

describe("withStale", () => {
  it("flags rows whose source_revision no longer matches the project", () => {
    const rows = [
      { id: "d1", source_revision: "rev-old" },
      { id: "d2", source_revision: "rev-new" },
    ];
    const flagged = withStale("rev-new", rows);
    expect(flagged[0]?.stale).toBe(true);
    expect(flagged[1]?.stale).toBe(false);
  });
});
