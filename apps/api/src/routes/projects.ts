import { Router } from "express";
import { z } from "zod";
import { createProjectSchema, updateProjectSchema } from "@flowtofeed/shared";
import { asyncHandler } from "../lib/asyncHandler.js";
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
