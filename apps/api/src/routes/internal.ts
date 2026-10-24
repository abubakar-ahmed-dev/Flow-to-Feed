import { Router } from "express";
import { z } from "zod";
import { jobEventSchema } from "@flowtofeed/shared";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireCallbackSecret } from "../middleware/callbackAuth.js";
import { supabaseAdmin } from "../db.js";
import { applyJobEvent } from "../services/jobs.js";

/**
 * n8n -> API callbacks. Authenticated by shared secret, idempotent by
 * job_events.event_id primary key: a replayed event is acknowledged as
 * "duplicate" and never re-applied to the job.
 */
export const internalRouter = Router();

const jobIdParam = z.string().uuid();

internalRouter.post(
  "/jobs/:id/events",
  requireCallbackSecret,
  asyncHandler(async (req, res) => {
    const jobId = jobIdParam.parse(req.params.id);
    const event = jobEventSchema.parse(req.body);

    if (event.jobId !== jobId) {
      res.status(400).json({
        error: { code: "job_id_mismatch", message: "URL job id does not match body jobId" },
      });
      return;
    }

    const { data: job, error: jobError } = await supabaseAdmin()
      .from("jobs")
      .select("*")
      .eq("id", jobId)
      .maybeSingle();
    if (jobError) throw jobError;
    if (!job) {
      res.status(404).json({ error: { code: "not_found", message: "Job not found" } });
      return;
    }

    const { data: inserted, error: insertError } = await supabaseAdmin()
      .from("job_events")
      .insert({
        event_id: event.eventId,
        job_id: event.jobId,
        status: event.status,
        stage: event.stage,
        result: event.result ?? null,
        error: event.error ?? null,
      })
      .select("event_id");

    if (insertError) {
      // unique violation: the same eventId was already applied — idempotent replay
      if (insertError.code === "23505") {
        res.json({ status: "duplicate" });
        return;
      }
      throw insertError;
    }
    if (!inserted || inserted.length === 0) {
      res.json({ status: "duplicate" });
      return;
    }

    const patch = applyJobEvent(job, event);
    const { error: updateError } = await supabaseAdmin()
      .from("jobs")
      .update(patch)
      .eq("id", jobId);
    if (updateError) throw updateError;

    res.json({ status: "applied", state: patch.state });
  }),
);
