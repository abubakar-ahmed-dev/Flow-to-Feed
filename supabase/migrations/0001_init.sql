-- FlowToFeed initial schema.
-- Application data is authoritative; provider ids (Buffer) attach delivery state.
-- Ownership enforced by RLS: owner_id = auth.uid(); public read limited to the
-- flagged sample project. The backend uses the service-role key, which bypasses RLS.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  source_markdown text not null,
  source_url text,
  -- sha256 of source_markdown; derived artifacts store it to detect staleness
  source_revision text not null,
  is_public_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_owner_idx on public.projects (owner_id);

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- diagrams
-- ---------------------------------------------------------------------------

create table if not exists public.diagrams (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  mode text not null check (mode in ('architecture', 'flowchart', 'sequence')),
  title text,
  -- selected passage kept with its revision for provenance
  source_text text not null,
  source_revision text not null,
  mermaid text,
  explanation text,
  assumptions jsonb not null default '[]'::jsonb,
  icon_ids jsonb not null default '[]'::jsonb,
  review_state text not null default 'draft'
    check (review_state in ('draft', 'approved', 'rejected')),
  render_state text not null default 'pending'
    check (render_state in ('pending', 'rendered', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists diagrams_project_idx on public.diagrams (project_id);

drop trigger if exists diagrams_set_updated_at on public.diagrams;
create trigger diagrams_set_updated_at
  before update on public.diagrams
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- variants (one per platform per project)
-- ---------------------------------------------------------------------------

create table if not exists public.variants (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  platform text not null check (platform in ('instagram', 'facebook', 'x')),
  source_revision text not null,
  revision integer not null default 1,
  diagram_ids jsonb not null default '[]'::jsonb,
  -- structured editable content: caption / paragraphs / thread / slides / caveats
  content jsonb not null default '{}'::jsonb,
  -- frozen at distribution time (see distribution_attempts)
  approved_snapshot jsonb,
  approved_snapshot_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint variants_project_platform_key unique (project_id, platform)
);

create index if not exists variants_project_idx on public.variants (project_id);

drop trigger if exists variants_set_updated_at on public.variants;
create trigger variants_set_updated_at
  before update on public.variants
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- assets (rendered images uploaded to Supabase Storage)
-- ---------------------------------------------------------------------------

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  variant_id uuid references public.variants (id) on delete cascade,
  diagram_id uuid references public.diagrams (id) on delete set null,
  revision integer not null default 1,
  slide_index integer,
  storage_path text not null,
  public_url text,
  width integer,
  height integer,
  mime_type text not null,
  hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists assets_project_idx on public.assets (project_id);
create index if not exists assets_variant_idx on public.assets (variant_id);
create index if not exists assets_diagram_idx on public.assets (diagram_id);

-- ---------------------------------------------------------------------------
-- jobs (generation/adaptation lifecycle) + idempotent events
-- ---------------------------------------------------------------------------

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  operation text not null
    check (operation in ('diagram_generate', 'diagram_repair', 'social_adapt')),
  state text not null default 'queued'
    check (state in ('queued', 'running', 'succeeded', 'failed')),
  stage text,
  attempts integer not null default 0,
  result jsonb,
  error jsonb,
  model text,
  prompt_version text,
  usage jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jobs_project_idx on public.jobs (project_id);

drop trigger if exists jobs_set_updated_at on public.jobs;
create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

-- event_id is supplied by n8n; primary key makes duplicate callbacks no-ops.
create table if not exists public.job_events (
  event_id text primary key,
  job_id uuid not null references public.jobs (id) on delete cascade,
  status text not null check (status in ('running', 'succeeded', 'failed')),
  stage text,
  result jsonb,
  error jsonb,
  created_at timestamptz not null default now()
);

create index if not exists job_events_job_idx on public.job_events (job_id);

-- ---------------------------------------------------------------------------
-- distribution_attempts (Buffer submissions; idempotent by construction)
-- ---------------------------------------------------------------------------

create table if not exists public.distribution_attempts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  variant_id uuid not null references public.variants (id) on delete cascade,
  variant_revision integer not null,
  platform text not null check (platform in ('instagram', 'facebook', 'x')),
  -- server-side allowed Buffer channel id (never taken from the client)
  channel_id text not null,
  action text not null check (action in ('buffer_draft', 'publish_now', 'schedule')),
  scheduled_at timestamptz, -- always UTC
  -- duplicate submissions return the existing attempt via this key
  idempotency_key text not null unique,
  state text not null default 'draft'
    check (state in ('draft', 'submitting', 'scheduled', 'published', 'failed', 'needs_verification')),
  buffer_post_id text,
  buffer_url text,
  error jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists distribution_attempts_project_idx
  on public.distribution_attempts (project_id);
create index if not exists distribution_attempts_variant_idx
  on public.distribution_attempts (variant_id);

drop trigger if exists distribution_attempts_set_updated_at on public.distribution_attempts;
create trigger distribution_attempts_set_updated_at
  before update on public.distribution_attempts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- Owner: full access to rows under their projects.
-- Public (anon): read-only access to rows under the flagged sample project.

alter table public.projects enable row level security;
alter table public.diagrams enable row level security;
alter table public.variants enable row level security;
alter table public.assets enable row level security;
alter table public.jobs enable row level security;
alter table public.job_events enable row level security;
alter table public.distribution_attempts enable row level security;

-- projects -------------------------------------------------------------------

create policy projects_owner_all
  on public.projects
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy projects_public_read
  on public.projects
  for select
  using (is_public_sample = true);

-- child tables: ownership/public-ness resolved through the parent project ----

create policy diagrams_owner_all
  on public.diagrams for all
  using (exists (select 1 from public.projects p where p.id = diagrams.project_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = diagrams.project_id and p.owner_id = auth.uid()));

create policy diagrams_public_read
  on public.diagrams for select
  using (exists (select 1 from public.projects p where p.id = diagrams.project_id and p.is_public_sample));

create policy variants_owner_all
  on public.variants for all
  using (exists (select 1 from public.projects p where p.id = variants.project_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = variants.project_id and p.owner_id = auth.uid()));

create policy variants_public_read
  on public.variants for select
  using (exists (select 1 from public.projects p where p.id = variants.project_id and p.is_public_sample));

create policy assets_owner_all
  on public.assets for all
  using (exists (select 1 from public.projects p where p.id = assets.project_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = assets.project_id and p.owner_id = auth.uid()));

create policy assets_public_read
  on public.assets for select
  using (exists (select 1 from public.projects p where p.id = assets.project_id and p.is_public_sample));

create policy jobs_owner_all
  on public.jobs for all
  using (exists (select 1 from public.projects p where p.id = jobs.project_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = jobs.project_id and p.owner_id = auth.uid()));

create policy jobs_public_read
  on public.jobs for select
  using (exists (select 1 from public.projects p where p.id = jobs.project_id and p.is_public_sample));

create policy job_events_owner_all
  on public.job_events for all
  using (exists (
    select 1 from public.jobs j
    join public.projects p on p.id = j.project_id
    where j.id = job_events.job_id and p.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.jobs j
    join public.projects p on p.id = j.project_id
    where j.id = job_events.job_id and p.owner_id = auth.uid()
  ));

create policy job_events_public_read
  on public.job_events for select
  using (exists (
    select 1 from public.jobs j
    join public.projects p on p.id = j.project_id
    where j.id = job_events.job_id and p.is_public_sample
  ));

create policy distribution_attempts_owner_all
  on public.distribution_attempts for all
  using (exists (select 1 from public.projects p where p.id = distribution_attempts.project_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = distribution_attempts.project_id and p.owner_id = auth.uid()));

create policy distribution_attempts_public_read
  on public.distribution_attempts for select
  using (exists (select 1 from public.projects p where p.id = distribution_attempts.project_id and p.is_public_sample));
