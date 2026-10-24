import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env.js";
import { safeEqual } from "../lib/secrets.js";

/**
 * Guards the /api/internal routes used by n8n callbacks.
 * Shared secret travels in the x-callback-secret header.
 */
export function requireCallbackSecret(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const expected = env.n8n.callbackSecret;
  if (!expected) {
    res.status(503).json({
      error: { code: "not_configured", message: "N8N_CALLBACK_SECRET is not set" },
    });
    return;
  }
  const provided = req.header("x-callback-secret");
  if (!provided || !safeEqual(provided, expected)) {
    res.status(401).json({
      error: { code: "unauthenticated", message: "Invalid callback secret" },
    });
    return;
  }
  next();
}
