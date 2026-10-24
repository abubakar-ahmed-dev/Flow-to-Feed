import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { getJobForUser } from "../services/jobs.js";

export const jobsRouter = Router();

jobsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const job = await getJobForUser(id, req.userId!);
    if (!job) {
      res.status(404).json({ error: { code: "not_found", message: "Job not found" } });
      return;
    }
    res.json({ job });
  }),
);
