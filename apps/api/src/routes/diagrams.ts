import { Router } from "express";
import { z } from "zod";
import {
  applyRepairSchema,
  repairDiagramSchema,
  saveDiagramFromJobSchema,
  updateDiagramSchema,
} from "@flowtofeed/shared";
import { asyncHandler } from "../lib/asyncHandler.js";
import { supabaseAdmin } from "../db.js";
import { triggerGeneration } from "../services/n8n.js";
import {
  applyRepair,
  requestRepair,
  saveDiagramFromJob,
  updateDiagram,
} from "../services/diagrams.js";

export const diagramsRouter = Router();

diagramsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const { projectId, jobId } = saveDiagramFromJobSchema.parse(req.body);
    const result = await saveDiagramFromJob(req.userId!, projectId, jobId);
    if ("error" in result) {
      const message =
        result.error === "not_found" ? "Project not found" : "Job is not a succeeded generation for this project";
      res.status(result.error === "not_found" ? 404 : 409).json({
        error: { code: result.error, message },
      });
      return;
    }
    res.status(201).json({ diagram: result.diagram });
  }),
);

diagramsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const patch = updateDiagramSchema.parse(req.body);
    const result = await updateDiagram(req.userId!, id, patch);
    if ("error" in result) {
      res.status(404).json({ error: { code: "not_found", message: "Diagram not found" } });
      return;
    }
    res.json({ diagram: result.diagram });
  }),
);

// Start a bounded repair job for a diagram whose Mermaid failed to render.
diagramsRouter.post(
  "/:id/repair",
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { renderError } = repairDiagramSchema.parse(req.body);
    const result = await requestRepair(req.userId!, id, renderError, triggerGeneration);
    if ("error" in result) {
      res.status(404).json({ error: { code: "not_found", message: "Diagram not found" } });
      return;
    }
    res.status(202).json({ job: result.job });
  }),
);

// Apply a succeeded repair job's Mermaid back onto the diagram.
diagramsRouter.post(
  "/:id/apply-repair",
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { jobId } = applyRepairSchema.parse(req.body);
    const result = await applyRepair(req.userId!, id, jobId);
    if ("error" in result) {
      res.status(result.error === "not_found" ? 404 : 409).json({
        error: {
          code: result.error,
          message: result.error === "not_found" ? "Diagram not found" : "Job is not a succeeded repair for this diagram",
        },
      });
      return;
    }
    res.json({ diagram: result.diagram });
  }),
);
