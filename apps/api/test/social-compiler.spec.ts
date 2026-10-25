import { describe, expect, it } from "vitest";
// @ts-expect-error plain JS module outside workspace root
import { compileSocial } from "../../../workflows/src/social-compiler.js";

const IG = [
  "Title: Cache-Aside Explained",
  "Caption: Why your reads get fast without breaking correctness.",
  "Slide 1: The idea | App checks Redis before Postgres every single read.",
  "Slide 2: On a miss | Read Postgres, copy the value into Redis with a TTL, return it.",
  "Slide 3: On writes | Update Postgres, delete the Redis key. Never serve stale copies.",
  "Slide 4: The trade-off | One stale read is possible; the cache must stay disposable.",
  "Summary: Reads check the cache first.",
].join("\n");

const X = [
  "Title: Cache-Aside thread",
  "Post 1: Cache-aside = the app owns the cache. It checks Redis first, and Postgres never sees most reads.",
  "Post 2: On a miss: read Postgres, copy the value into Redis with a TTL, return it.",
  "Post 3: On writes: update Postgres and delete the Redis key instead of updating the cached copy.",
  "Post 4: Caveat: the cache is disposable. If Redis dies, correctness survives and the cache warms up again.",
].join("\n");

describe("compileSocial", () => {
  it("parses instagram slides with heading|body split", () => {
    const out = compileSocial("instagram", IG, "m");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const ig = out.result.content.instagram!;
    expect(ig.title).toBe("Cache-Aside Explained");
    expect(ig.slides.length).toBe(4);
    expect(ig.slides[1].heading).toBe("On a miss");
    expect(out.result.promptVersion).toBe("social-instagram-v2");
  });

  it("appends continuation lines to the previous label", () => {
    const withWrap = IG.replace("App checks Redis before Postgres every single read.", "App checks Redis\nbefore Postgres every single read.");
    const out = compileSocial("instagram", withWrap, "m");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.content.instagram!.slides[0].body).toContain("before Postgres");
  });

  it("parses an X thread and rejects over-length posts", () => {
    const ok = compileSocial("x", X, "m");
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.result.content.x!.posts.length).toBe(4);

    const long = "x".repeat(300);
    const bad = compileSocial("x", `Title: t\nPost 1: ${long}\nPost 2: ok\nPost 3: ok\nPost 4: ok`, "m");
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.error.message).toContain("280");
  });

  it("parses facebook paragraphs and rejects structureless replies", () => {
    const fb = "Title: Cache-Aside\nParagraph 1: Reads check the cache first.\nParagraph 2: Misses fall back to Postgres.";
    const ok = compileSocial("facebook", fb, "m");
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.result.content.facebook!.paragraphs.length).toBe(2);

    const bad = compileSocial("facebook", "no structure here", "m");
    expect(bad.ok).toBe(false);
  });
});
