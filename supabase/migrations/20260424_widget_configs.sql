-- CropsIntel V2 — Widget Library foundation (Wave 5)
-- Stores per-widget published configuration so any widget can merge DB
-- config over its hardcoded defaults via the useWidgetConfig hook.
--
-- Layout:
--   widget_key: stable identifier, e.g. 'dashboard.share_pie',
--               'destinations.country_trend', 'supply.variety_pie'
--   version:    integer, strictly monotonic per widget_key
--   status:     draft | published | archived
--   config:     arbitrary JSONB (shape is widget-specific)
--
-- Policy:
--   • authenticated users can SELECT rows with status='published'
--   • admins (role='admin' OR access_tier='admin') can do everything
--   • service role bypasses RLS (scrapers, migrations, workshop tools)

-- ----------------------------------------------------------------
-- Step 1. Table
-- ----------------------------------------------------------------
create table if not exists widget_configs (
  id            uuid primary key default gen_random_uuid(),
  widget_key    text not null,
  version       int  not null default 1,
  status        text not null default 'draft'
                  check (status in ('draft', 'published', 'archived')),
  title         text,
  description   text,
  config        jsonb not null default '{}'::jsonb,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  published_at  timestamptz,
  unique (widget_key, version)
);

comment on table widget_configs is
  'Per-widget published configuration merged over hardcoded defaults at runtime via useWidgetConfig(widgetKey). Admin-only write surface, authenticated-read for published rows.';

-- ----------------------------------------------------------------
-- Step 2. Indexes
-- ----------------------------------------------------------------
create index if not exists idx_widget_configs_key_status
  on widget_configs (widget_key, status);

create index if not exists idx_widget_configs_key_published
  on widget_configs (widget_key, published_at desc)
  where status = 'published';

-- ----------------------------------------------------------------
-- Step 3. updated_at trigger
-- ----------------------------------------------------------------
create or replace function update_widget_configs_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_widget_configs_updated_at on widget_configs;
create trigger trg_widget_configs_updated_at
  before update on widget_configs
  for each row execute function update_widget_configs_updated_at();

-- ----------------------------------------------------------------
-- Step 4. RLS
-- ----------------------------------------------------------------
alter table widget_configs enable row level security;

-- Authenticated users can read published rows.
drop policy if exists "authenticated read published widget configs" on widget_configs;
create policy "authenticated read published widget configs"
  on widget_configs for select
  using (
    status = 'published'
    and auth.uid() is not null
  );

-- Admins can read all rows (including drafts and archived).
drop policy if exists "admins read all widget configs" on widget_configs;
create policy "admins read all widget configs"
  on widget_configs for select
  using (
    exists (
      select 1 from user_profiles p
      where p.id = auth.uid()
        and (p.role = 'admin' or p.access_tier = 'admin')
    )
  );

-- Admins can insert new widget configs.
drop policy if exists "admins insert widget configs" on widget_configs;
create policy "admins insert widget configs"
  on widget_configs for insert
  with check (
    exists (
      select 1 from user_profiles p
      where p.id = auth.uid()
        and (p.role = 'admin' or p.access_tier = 'admin')
    )
  );

-- Admins can update any widget config.
drop policy if exists "admins update widget configs" on widget_configs;
create policy "admins update widget configs"
  on widget_configs for update
  using (
    exists (
      select 1 from user_profiles p
      where p.id = auth.uid()
        and (p.role = 'admin' or p.access_tier = 'admin')
    )
  )
  with check (
    exists (
      select 1 from user_profiles p
      where p.id = auth.uid()
        and (p.role = 'admin' or p.access_tier = 'admin')
    )
  );

-- Admins can delete (soft-delete via status='archived' preferred).
drop policy if exists "admins delete widget configs" on widget_configs;
create policy "admins delete widget configs"
  on widget_configs for delete
  using (
    exists (
      select 1 from user_profiles p
      where p.id = auth.uid()
        and (p.role = 'admin' or p.access_tier = 'admin')
    )
  );

-- ----------------------------------------------------------------
-- Step 5. Convenience: auto-publish helper function
-- ----------------------------------------------------------------
-- Publishes a draft row by widget_key+version: sets status='published',
-- published_at=now(), and archives any previously-published row for the
-- same widget_key (keeping version history intact).
create or replace function publish_widget_config(p_widget_key text, p_version int)
returns uuid language plpgsql security definer as $$
declare
  target_id uuid;
begin
  -- Only admins can call this
  if not exists (
    select 1 from user_profiles p
    where p.id = auth.uid()
      and (p.role = 'admin' or p.access_tier = 'admin')
  ) then
    raise exception 'publish_widget_config: caller is not admin';
  end if;

  -- Archive currently published row (if any) for this widget_key
  update widget_configs
  set status = 'archived'
  where widget_key = p_widget_key
    and status = 'published';

  -- Publish the target
  update widget_configs
  set status = 'published', published_at = now()
  where widget_key = p_widget_key
    and version = p_version
  returning id into target_id;

  if target_id is null then
    raise exception 'publish_widget_config: no matching draft (widget_key=%, version=%)',
                    p_widget_key, p_version;
  end if;

  return target_id;
end;
$$;

comment on function publish_widget_config(text, int) is
  'Atomically publish a widget_configs version: archives previous published row + promotes the specified version. Admin-only.';

-- ----------------------------------------------------------------
-- Step 6. Grants
-- ----------------------------------------------------------------
grant select on widget_configs to authenticated;
grant execute on function publish_widget_config(text, int) to authenticated;

-- End of migration.
