import { Router, raw } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { listAssets, uploadAsset } from "../services/assets.js";

export const assetsRouter = Router();

const uploadQuery = z.object({
  projectId: z.string().uuid(),
  platform: z.enum(["instagram", "facebook", "x"]),
  variantId: z.string().uuid().optional(),
  diagramId: z.string().uuid().optional(),
  slideIndex: z.coerce.number().int().min(0).max(9).optional(),
  width: z.coerce.number().int().positive(),
  height: z.coerce.number().int().positive(),
  hash: z.string().length(64),
});

// Raw image bytes; metadata travels as query params. Route-level raw parser
// accepts image bodies the global JSON parser would skip.
assetsRouter.post(
  "/upload",
  raw({ type: ["image/jpeg", "image/png"], limit: "10mb" }),
  asyncHandler(async (req, res) => {
    const meta = uploadQuery.parse(req.query);
    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      res.status(400).json({ error: { code: "bad_request", message: "empty or non-binary body" } });
      return;
    }
    const result = await uploadAsset(req.userId!, meta, body);
    if ("error" in result) {
      res.status(result.error === "not_found" ? 404 : 400).json({
        error: { code: result.error, message: result.message ?? result.error },
      });
      return;
    }
    res.status(201).json({ asset: result.asset, publicUrl: result.publicUrl });
  }),
);

assetsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const variantId = z.string().uuid().parse(req.query.variantId);
    const assets = await listAssets(req.userId!, variantId);
    if (assets === null) {
      res.status(404).json({ error: { code: "not_found", message: "Variant not found" } });
      return;
    }
    res.json({ assets });
  }),
);
