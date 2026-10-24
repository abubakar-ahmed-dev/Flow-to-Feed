import express, { type Express } from "express";
import cors from "cors";
import { env } from "./config/env.js";
import { healthRouter } from "./routes/health.js";

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

  // 404 for unknown API routes.
  app.use((_req, res) => {
    res.status(404).json({ error: { code: "not_found", message: "Route not found" } });
  });

  // Central error handler — keep responses structured, log details server-side.
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: { code: "internal_error", message: "Internal server error" } });
  });

  return app;
}
