import { describe, expect, it } from "vitest";
import {
  createProjectSchema,
  jobEventSchema,
  updateProjectSchema,
  SOURCE_CHAR_LIMIT,
} from "@flowtofeed/shared";

const uuid = "123e4567-e89b-42d3-a456-426614174000";

describe("createProjectSchema", () => {
  it("accepts a valid project", () => {
    const parsed = createProjectSchema.parse({
      title: "Cache-Aside",
      source_markdown: "# Cache-Aside\n\nBody",
      source_url: "https://example.com/post",
    });
    expect(parsed.title).toBe("Cache-Aside");
  });

  it("rejects an over-limit source", () => {
    expect(() =>
      createProjectSchema.parse({
        title: "Too long",
        source_markdown: "x".repeat(SOURCE_CHAR_LIMIT + 1),
      }),
    ).toThrow();
  });

  it("rejects an empty title and a bad url", () => {
    expect(() =>
      createProjectSchema.parse({ title: "  ", source_markdown: "body" }),
    ).toThrow();
    expect(() =>
      createProjectSchema.parse({
        title: "t",
        source_markdown: "body",
        source_url: "not-a-url",
      }),
    ).toThrow();
  });
});

describe("updateProjectSchema", () => {
  it("allows partial updates", () => {
    expect(updateProjectSchema.parse({ title: "New title" })).toEqual({
      title: "New title",
    });
    expect(updateProjectSchema.parse({})).toEqual({});
  });

  it("still enforces the source cap", () => {
    expect(() =>
      updateProjectSchema.parse({ source_markdown: "y".repeat(SOURCE_CHAR_LIMIT + 1) }),
    ).toThrow();
  });
});

describe("jobEventSchema", () => {
  it("accepts a valid event and defaults stage", () => {
    const parsed = jobEventSchema.parse({
      eventId: "evt-12345678",
      jobId: uuid,
      status: "running",
    });
    expect(parsed.stage).toBe("");
  });

  it("rejects a malformed job id or unknown status", () => {
    expect(() =>
      jobEventSchema.parse({ eventId: "evt-12345678", jobId: "nope", status: "running" }),
    ).toThrow();
    expect(() =>
      jobEventSchema.parse({
        eventId: "evt-12345678",
        jobId: uuid,
        status: "exploded",
      }),
    ).toThrow();
  });
});
