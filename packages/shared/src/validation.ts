import { z } from "zod";
import { SOURCE_CHAR_LIMIT } from "./platform-limits.js";

/** Backend-enforced, UI-mirrored request schemas. */

export const createProjectSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(300),
  source_markdown: z
    .string()
    .min(1, "Source explanation is required")
    .max(
      SOURCE_CHAR_LIMIT,
      `Source exceeds the ${SOURCE_CHAR_LIMIT} character limit — shorten the input`,
    ),
  source_url: z.string().url("Source URL must be a valid URL").optional(),
});

export const updateProjectSchema = createProjectSchema.partial();

export const jobEventSchema = z.object({
  eventId: z.string().min(8).max(200),
  jobId: z.string().uuid(),
  status: z.enum(["running", "succeeded", "failed"]),
  stage: z.string().max(200).default(""),
  result: z.unknown().optional(),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type JobEventInput = z.infer<typeof jobEventSchema>;
