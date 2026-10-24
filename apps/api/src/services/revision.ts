import { createHash } from "node:crypto";

/** Canonical source revision: sha256 hex of the Markdown source. */
export function sourceRevision(markdown: string): string {
  return createHash("sha256").update(markdown, "utf8").digest("hex");
}
