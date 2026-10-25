import { Router } from "express";
import { z } from "zod";
import { saveDiagramFromJobSchema, updateDiagramSchema } from "@flowtofeed/shared";
import { asyncHandler } from "../lib/asyncHandler.js";
import { saveDiagramFromJob, updateDiagram } from "../services/diagrams.js";

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
