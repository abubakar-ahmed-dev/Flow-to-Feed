import express, { type Express } from "express";
import cors from "cors";
import { ZodError } from "zod";
import { env } from "./config/env.js";
import { healthRouter } from "./routes/health.js";
import { projectsRouter } from "./routes/projects.js";
import { jobsRouter } from "./routes/jobs.js";
import { internalRouter } from "./routes/internal.js";
import { diagramsRouter } from "./routes/diagrams.js";
import { requireOwner } from "./middleware/auth.js";

export function createApp(): Express {
  const app = express();

  app.use(
    cors({
      origin: env.appBaseUrl,
      credentials: true,
    }),
  );
  // Source explanations can approach the 20k-character cap; allow headroom.
  app.use(express.json({ limit: "1mb" }));

  app.use("/api", healthRouter);
  app.use("/api/projects", requireOwner, projectsRouter);
  app.use("/api/jobs", requireOwner, jobsRouter);
  app.use("/api/diagrams", requireOwner, diagramsRouter);
  // internal routes carry their own shared-secret auth
  app.use("/api/internal", internalRouter);

  // 404 for unknown API routes.
  app.use((_req, res) => {
    res.status(404).json({ error: { code: "not_found", message: "Route not found" } });
  });

  // Central error handler — keep responses structured, log details server-side.
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (err instanceof ZodError) {
        res.status(400).json({
          error: { code: "validation_failed", message: "Invalid request", details: err.issues },
        });
        return;
      }
      if ((err as { type?: string } | null)?.type === "entity.parse.failed") {
        res.status(400).json({
          error: { code: "invalid_json", message: "Malformed JSON body" },
        });
        return;
      }
      console.error(err);
      res
        .status(500)
        .json({ error: { code: "internal_error", message: "Internal server error" } });
    },
  );

  return app;
}
