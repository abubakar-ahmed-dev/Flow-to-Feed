-- Generation requests carry their input (mode/passage/instruction) with the job
-- so results can be persisted without the caller re-sending them.
alter table public.jobs add column if not exists input jsonb;
