import { Router } from "express";
import { z } from "zod";
import {
  createProjectSchema,
  generateDiagramSchema,
  updateProjectSchema,
} from "@flowtofeed/shared";
import { asyncHandler } from "../lib/asyncHandler.js";
import { supabaseAdmin } from "../db.js";
import { triggerGeneration } from "../services/n8n.js";
import {
  createProject,
  getProject,
  getProjectDetail,
  listProjects,
  updateProject,
} from "../services/projects.js";

export const projectsRouter = Router();

projectsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const projects = await listProjects(req.userId!);
    res.json({ projects });
  }),
);

projectsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = createProjectSchema.parse(req.body);
    const project = await createProject(req.userId!, input);
    res.status(201).json({ project });
  }),
);

projectsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const project = await getProject(id);
    // not-found and not-owned are indistinguishable to the caller
    if (!project || project.owner_id !== req.userId) {
      res.status(404).json({ error: { code: "not_found", message: "Project not found" } });
      return;
    }
    const detail = await getProjectDetail(project);
    res.json(detail);
  }),
);

projectsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const input = updateProjectSchema.parse(req.body);
    const project = await getProject(id);
    if (!project || project.owner_id !== req.userId) {
      res.status(404).json({ error: { code: "not_found", message: "Project not found" } });
      return;
    }
    const updated = await updateProject(project, input);
    res.json({ project: updated });
  }),
);

// Start a diagram generation job (202 + job id; progress arrives via callbacks).
projectsRouter.post(
  "/:id/diagrams",
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const input = generateDiagramSchema.parse(req.body);

    const project = await getProject(id);
    if (!project || project.owner_id !== req.userId) {
      res.status(404).json({ error: { code: "not_found", message: "Project not found" } });
      return;
    }

    const { data: job, error: jobError } = await supabaseAdmin()
      .from("jobs")
      .insert({
        project_id: id,
        operation: "diagram_generate",
        input: { mode: input.mode, passage: input.passage, instruction: input.instruction },
      })
      .select("*")
      .single();
    if (jobError) throw jobError;

    try {
      await triggerGeneration({
        jobId: job.id,
        mode: input.mode,
        passage: input.passage,
        instruction: input.instruction,
      });
    } catch (err) {
      console.error("n8n trigger failed:", err);
      await supabaseAdmin()
        .from("jobs")
        .update({
          state: "failed",
          error: {
            code: "trigger_failed",
            message: err instanceof Error ? err.message : "n8n trigger failed",
          },
        })
        .eq("id", job.id);
      res.status(202).json({ job: { ...job, state: "failed" } });
      return;
    }
    res.status(202).json({ job });
  }),
);
