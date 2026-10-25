import { Router } from "express";
import { z } from "zod";
import {
  generateVariantSchema,
  saveVariantFromJobSchema,
  updateVariantSchema,
  type SocialContent,
} from "@flowtofeed/shared";
import { asyncHandler } from "../lib/asyncHandler.js";
import { supabaseAdmin } from "../db.js";
import { triggerGeneration } from "../services/n8n.js";
import { getProject } from "../services/projects.js";
import { saveVariantFromJob, startSocialAdapt, updateVariant } from "../services/variants.js";

export const variantsRouter = Router();

// Start a social adaptation job (202 + job id; content arrives via callbacks).
variantsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = generateVariantSchema.parse(req.body);
    const result = await startSocialAdapt(
      req.userId!,
      input.projectId,
      input.platform,
      input.passage,
      input.instruction,
      triggerGeneration,
    );
    if ("error" in result) {
      res.status(404).json({ error: { code: "not_found", message: "Project not found" } });
      return;
    }
    res.status(202).json({ job: result.job });
  }),
);

// Persist a succeeded adaptation job's content as the project's variant.
variantsRouter.post(
  "/save",
  asyncHandler(async (req, res) => {
    const { projectId, jobId } = saveVariantFromJobSchema.parse(req.body);
    const result = await saveVariantFromJob(req.userId!, projectId, jobId);
    if ("error" in result) {
      const message = result.error === "not_found" ? "Project not found" : "Job is not a succeeded social_adapt for this project";
      res.status(result.error === "not_found" ? 404 : 409).json({
        error: { code: result.error, message },
      });
      return;
    }
    res.status(201).json({ variant: result.variant });
  }),
);

// Manual content edits — validated against platform rules backend-side.
variantsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { content } = updateVariantSchema.parse(req.body);
    const result = await updateVariant(req.userId!, id, content as SocialContent[keyof SocialContent]);
    if ("error" in result) {
      if (result.error === "not_found") {
        res.status(404).json({ error: { code: "not_found", message: "Variant not found" } });
        return;
      }
      res.status(400).json({
        error: { code: "validation_failed", message: "Content violates platform rules", details: result.issues },
      });
      return;
    }
    res.json({ variant: result.variant });
  }),
);
