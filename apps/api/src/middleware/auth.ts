import type { NextFunction, Request, Response } from "express";
import { supabaseAdmin } from "../db.js";
import { env } from "../config/env.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Supabase user id of the authenticated caller (set by requireOwner). */
      userId?: string;
    }
  }
}

/**
 * Verifies the Supabase access token in the Authorization header and, when
 * OWNER_USER_ID is configured, restricts access to that single owner.
 * Stamps req.userId for downstream ownership checks.
 */
export async function requireOwner(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      res
        .status(401)
        .json({ error: { code: "unauthenticated", message: "Missing bearer token" } });
      return;
    }

    const { data, error } = await supabaseAdmin().auth.getUser(header.slice(7));
    if (error || !data.user) {
      res
        .status(401)
        .json({ error: { code: "unauthenticated", message: "Invalid session" } });
      return;
    }

    if (env.ownerUserId && data.user.id !== env.ownerUserId) {
      res
        .status(403)
        .json({ error: { code: "not_owner", message: "Owner-only action" } });
      return;
    }

    req.userId = data.user.id;
    next();
  } catch (err) {
    next(err);
  }
}
