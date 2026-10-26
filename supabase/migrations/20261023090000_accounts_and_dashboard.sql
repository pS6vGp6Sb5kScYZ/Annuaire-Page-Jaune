create type public.staff_role as enum (
  'admin',
  'moderator',
  'verifier',
  'field_agent'
);

create type public.event_status as enum (
  'draft',
  'pending',
  'published',
  'cancelled',
  'archived'
);

create type public.job_status as enum (
  'draft',
  'pending',
  'published',
  'paused',
  'expired',
  'closed'
);

create type public.review_status as enum (
  'pending',
  'published',
  'rejected'
);

create type public.listing_moderation_decision as enum (
  'approved',
  'rejected',
  'changes_requested'
);

create type public.task_status as enum (
  'open',
  'in_progress',
  'done',
  'cancelled'
);

create type public.task_priority as enum (
  'low',
  'normal',
  'high',
  'urgent'
);

create type public.device_category as enum (
  'android',
  'mobile_web',
  'desktop',
  'ios',
  'other'
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  phone text,
  avatar_url text,
  locale text not null default 'fr',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_full_name_length check (char_length(full_name) <= 120),
  constraint profiles_phone_length check (phone is null or char_length(phone) <= 32),
  constraint profiles_locale check (locale in ('fr', 'sw', 'en'))
);

create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.staff_role not null,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create index user_roles_role_idx on public.user_roles (role, user_id);

create function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), ''), 120)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger auth_user_created_profile
after insert on auth.users
for each row execute function public.create_profile_for_new_user();

create function public.set_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_profile_updated_at();

create function public.has_staff_role(required_roles public.staff_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles as ur
    where ur.user_id = auth.uid()
      and ur.role = any(required_roles)
  );
$$;

create or replace function public.is_directory_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_staff_role(array[
    'admin'::public.staff_role,
    'moderator'::public.staff_role,
    'verifier'::public.staff_role,
    'field_agent'::public.staff_role
  ]);
$$;

create function public.manage_staff_role(
  target_user_id uuid,
  target_role public.staff_role,
  should_grant boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('lubumbashi-connect-admin-roles')::bigint);

  if not public.has_staff_role(array['admin'::public.staff_role]) then
    raise exception 'Only an administrator can manage staff roles'
      using errcode = '42501';
  end if;

  if should_grant then
    insert into public.user_roles (user_id, role, granted_by)
    values (target_user_id, target_role, auth.uid())
    on conflict (user_id, role) do nothing;
  else
    if target_role = 'admin'
      and exists (
        select 1
        from public.user_roles
        where user_id = target_user_id and role = 'admin'
      )
      and (
        select count(*)
        from public.user_roles
        where role = 'admin'
      ) <= 1 then
      raise exception 'The last administrator cannot be removed'
        using errcode = '23514';
    end if;

    delete from public.user_roles
    where user_id = target_user_id and role = target_role;
  end if;
end;
$$;

revoke all on function public.has_staff_role(public.staff_role[]) from public, anon;
revoke all on function public.is_directory_staff() from public, anon;
revoke all on function public.manage_staff_role(uuid, public.staff_role, boolean) from public, anon;
grant execute on function public.has_staff_role(public.staff_role[]) to authenticated;
grant execute on function public.is_directory_staff() to authenticated;
grant execute on function public.manage_staff_role(uuid, public.staff_role, boolean) to authenticated;

create table public.saved_listings (
  user_id uuid not null references auth.users (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create index saved_listings_listing_idx on public.saved_listings (listing_id);
create index listings_owner_status_idx on public.listings (owner_id, status);

create table public.listing_reviews (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  author_display_name text not null default 'Membre',
  rating smallint not null check (rating between 1 and 5),
  title text,
  body text not null,
  status public.review_status not null default 'pending',
  moderated_by uuid references auth.users (id) on delete set null,
  moderated_at timestamptz,
  moderation_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, author_id),
  check (char_length(body) between 10 and 3000),
  check (title is null or char_length(title) <= 120),
  check (
    (status = 'pending' and moderated_by is null and moderated_at is null)
    or (status <> 'pending' and moderated_by is not null and moderated_at is not null)
  )
);

create index listing_reviews_queue_idx on public.listing_reviews (status, created_at);
create index listing_reviews_public_idx on public.listing_reviews (listing_id, created_at desc)
  where status = 'published';

create table public.listing_moderation_history (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  decision public.listing_moderation_decision not null,
  owner_message text not null default '',
  internal_note text,
  decided_by uuid not null references auth.users (id) on delete restrict,
  decided_at timestamptz not null default now(),
  check (char_length(owner_message) <= 3000),
  check (internal_note is null or char_length(internal_note) <= 3000)
);

create index listing_moderation_listing_idx
  on public.listing_moderation_history (listing_id, decided_at desc);

create trigger listing_reviews_set_updated_at
before update on public.listing_reviews
for each row execute function public.set_updated_at();

create function public.set_review_author_display_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select coalesce(nullif(trim(p.full_name), ''), 'Membre')
  into new.author_display_name
  from public.profiles as p
  where p.id = new.author_id;
  new.author_display_name := coalesce(new.author_display_name, 'Membre');
  return new;
end;
$$;

create trigger listing_reviews_set_author_display_name
before insert on public.listing_reviews
for each row execute function public.set_review_author_display_name();

create view public.public_listing_reviews
with (security_invoker = true)
as
select
  r.id,
  r.listing_id,
  r.author_display_name as author_name,
  r.rating,
  r.title,
  r.body,
  r.created_at
from public.listing_reviews as r
where r.status = 'published';

create view public.public_listing_ratings
with (security_invoker = true)
as
select
  listing_id,
  round(avg(rating)::numeric, 1) as average_rating,
  count(*)::integer as reviews_count
from public.listing_reviews
where status = 'published'
group by listing_id;

create view public.admin_listing_reviews
with (security_barrier = true)
as
select r.*
from public.listing_reviews as r
where public.is_directory_staff();

create view public.admin_listings
with (security_barrier = true)
as
select l.*
from public.listings as l
where public.is_directory_staff();

create view public.public_listing_photos
with (security_barrier = true)
as
select p.id, p.listing_id, p.storage_path, p.alt_text, p.sort_order
from public.listing_photos as p
join public.listings as l on l.id = p.listing_id
where l.is_example
  or (
    l.status = 'verified'
    and l.last_verified_at >= now() - interval '6 months'
  );

create view public.my_listing_moderation_history
with (security_invoker = true)
as
select id, listing_id, decision, owner_message, decided_at
from public.listing_moderation_history;

create view public.admin_listing_moderation_history
with (security_barrier = true)
as
select h.*
from public.listing_moderation_history as h
where public.is_directory_staff();

create table public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  category text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  timezone text not null default 'Africa/Lubumbashi',
  venue text,
  address text,
  commune text,
  quartier text,
  latitude double precision,
  longitude double precision,
  price_label text,
  ticket_url text,
  cover_image_path text,
  organizer_name text,
  organizer_id uuid references auth.users (id) on delete set null default auth.uid(),
  source public.listing_source not null default 'declared_by_owner',
  source_details text,
  status public.event_status not null default 'pending',
  is_example boolean not null default false,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  moderated_by uuid references auth.users (id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at),
  check (latitude is null or latitude between -90 and 90),
  check (longitude is null or longitude between -180 and 180),
  check (char_length(title) between 3 and 180),
  check (status <> 'published' or published_at is not null)
);

create index events_public_dates_idx on public.events (starts_at)
  where status = 'published';
create index events_moderation_queue_idx on public.events (status, created_at);
create index events_owner_status_idx on public.events (created_by, status);

create trigger events_set_updated_at
before update on public.events
for each row execute function public.set_updated_at();

create view public.public_events
with (security_invoker = true)
as
select
  id, slug, title, category, description, starts_at, ends_at, timezone,
  venue, address, commune, quartier, latitude, longitude, price_label,
  ticket_url, cover_image_path, organizer_name, created_at
from public.events
where status = 'published'
  and (ends_at is null or ends_at >= now());

create view public.admin_events
with (security_barrier = true)
as
select e.*
from public.events as e
where public.is_directory_staff();

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  organization text not null,
  description text,
  requirements text,
  location text,
  commune text,
  contract_type text,
  salary_min numeric(14, 2),
  salary_max numeric(14, 2),
  salary_currency text not null default 'USD',
  application_url text,
  application_email text,
  source public.listing_source not null default 'declared_by_owner',
  source_url text,
  source_details text,
  status public.job_status not null default 'pending',
  published_at timestamptz,
  expires_at timestamptz,
  employer_id uuid references auth.users (id) on delete set null default auth.uid(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  moderated_by uuid references auth.users (id) on delete set null,
  is_example boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (salary_min is null or salary_min >= 0),
  check (salary_max is null or salary_max >= 0),
  check (salary_min is null or salary_max is null or salary_max >= salary_min),
  check (salary_currency in ('USD', 'CDF')),
  check (expires_at is null or expires_at > created_at),
  check (char_length(title) between 3 and 180),
  check (status <> 'published' or published_at is not null)
);

create index jobs_public_idx on public.jobs (expires_at, created_at desc)
  where status = 'published';
create index jobs_moderation_queue_idx on public.jobs (status, created_at);
create index jobs_owner_status_idx on public.jobs (created_by, status);

create trigger jobs_set_updated_at
before update on public.jobs
for each row execute function public.set_updated_at();

create view public.public_jobs
with (security_invoker = true)
as
select
  id, slug, title, organization, description, requirements, location,
  commune, contract_type, salary_min, salary_max, salary_currency,
  application_url, source, source_url, published_at, expires_at, created_at
from public.jobs
where status = 'published'
  and (expires_at is null or expires_at > now());

create view public.admin_jobs
with (security_barrier = true)
as
select j.*
from public.jobs as j
where public.is_directory_staff();

create table public.job_applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  applicant_id uuid not null references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  cover_letter text,
  cv_storage_path text,
  status text not null default 'submitted'
    check (status in ('submitted', 'reviewing', 'shortlisted', 'rejected', 'withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, applicant_id),
  check (char_length(full_name) between 2 and 120),
  check (char_length(email) <= 320),
  check (cover_letter is null or char_length(cover_letter) <= 10000)
);

create index job_applications_job_status_idx
  on public.job_applications (job_id, status, created_at desc);
create index job_applications_applicant_idx
  on public.job_applications (applicant_id, created_at desc);

create trigger job_applications_set_updated_at
before update on public.job_applications
for each row execute function public.set_updated_at();

create table public.editorial_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  task_type text not null default 'content',
  status public.task_status not null default 'open',
  priority public.task_priority not null default 'normal',
  due_at timestamptz,
  assignee_id uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  completed_by uuid references auth.users (id) on delete set null,
  completed_at timestamptz,
  related_listing_id uuid references public.listings (id) on delete set null,
  related_event_id uuid references public.events (id) on delete set null,
  related_job_id uuid references public.jobs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(title) between 3 and 240),
  check (
    (status = 'done' and completed_at is not null)
    or (status <> 'done' and completed_at is null)
  )
);

create index editorial_tasks_queue_idx
  on public.editorial_tasks (status, due_at, priority);
create index editorial_tasks_assignee_idx
  on public.editorial_tasks (assignee_id, status);

create trigger editorial_tasks_set_updated_at
before update on public.editorial_tasks
for each row execute function public.set_updated_at();

create table public.editorial_calendar (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  item_type text not null
    check (item_type in ('content', 'moderation', 'team', 'job', 'event', 'other')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  description text,
  status public.task_status not null default 'open',
  related_event_id uuid references public.events (id) on delete set null,
  related_job_id uuid references public.jobs (id) on delete set null,
  assignee_id uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at),
  check (
    (status = 'done' and completed_at is not null)
    or (status <> 'done' and completed_at is null)
  )
);

create index editorial_calendar_starts_idx on public.editorial_calendar (starts_at);

create trigger editorial_calendar_set_updated_at
before update on public.editorial_calendar
for each row execute function public.set_profile_updated_at();

create table public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  body text not null default '',
  notification_type text not null,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (char_length(title) between 1 and 180),
  check (char_length(body) <= 2000)
);

create index user_notifications_recipient_idx
  on public.user_notifications (recipient_id, created_at desc);
create index user_notifications_unread_idx
  on public.user_notifications (recipient_id, created_at desc)
  where read_at is null;

create table public.admin_activity_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  summary text not null default '',
  created_at timestamptz not null default now()
);

create index admin_activity_created_idx on public.admin_activity_log (created_at desc);
create index admin_activity_entity_idx
  on public.admin_activity_log (entity_type, entity_id, created_at desc);

create function public.record_admin_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb;
  row_id uuid;
  action_name text;
  display_name text;
begin
  if tg_op = 'DELETE' then
    row_data := to_jsonb(old);
    action_name := 'DELETE';
  else
    row_data := to_jsonb(new);
    action_name := tg_op;
  end if;

  row_id := nullif(row_data ->> 'id', '')::uuid;
  display_name := left(coalesce(row_data ->> 'title', row_data ->> 'name', ''), 180);

  insert into public.admin_activity_log (
    actor_id, action, entity_type, entity_id, summary
  )
  values (
    auth.uid(), action_name, tg_table_name, row_id, display_name
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger events_activity_log
after insert or update or delete on public.events
for each row execute function public.record_admin_activity();
create trigger jobs_activity_log
after insert or update or delete on public.jobs
for each row execute function public.record_admin_activity();
create trigger editorial_tasks_activity_log
after insert or update or delete on public.editorial_tasks
for each row execute function public.record_admin_activity();
create trigger editorial_calendar_activity_log
after insert or update or delete on public.editorial_calendar
for each row execute function public.record_admin_activity();
create trigger listing_reviews_activity_log
after insert or update or delete on public.listing_reviews
for each row execute function public.record_admin_activity();

create table public.dashboard_daily_metrics (
  metric_date date not null,
  metric_key text not null,
  metric_value numeric(18, 4) not null default 0,
  source text not null,
  updated_at timestamptz not null default now(),
  primary key (metric_date, metric_key, source),
  check (metric_value >= 0),
  check (metric_key in (
    'visitors',
    'sessions',
    'page_views',
    'listing_views',
    'job_views',
    'event_views',
    'contact_clicks',
    'applications',
    'average_session_seconds'
  ))
);

create table public.dashboard_device_daily_metrics (
  metric_date date not null,
  device public.device_category not null,
  sessions bigint not null default 0 check (sessions >= 0),
  visitors bigint not null default 0 check (visitors >= 0),
  source text not null,
  updated_at timestamptz not null default now(),
  primary key (metric_date, device, source)
);

create index dashboard_device_metrics_date_idx
  on public.dashboard_device_daily_metrics (metric_date desc, device);

create index dashboard_daily_metrics_date_idx
  on public.dashboard_daily_metrics (metric_date desc, metric_key);

create view public.dashboard_metrics_30d
with (security_invoker = true)
as
select
  metric_key,
  metric_date,
  metric_value,
  source,
  updated_at
from public.dashboard_daily_metrics
where metric_date >= current_date - 29;

create function public.dashboard_overview()
returns table (
  listings_total bigint,
  listings_verified bigint,
  listings_pending bigint,
  reviews_pending bigint,
  events_published bigint,
  events_pending bigint,
  jobs_published bigint,
  jobs_pending bigint,
  applications_total bigint,
  tasks_open bigint,
  notifications_unread bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_directory_staff() then
    raise exception 'Staff access is required'
      using errcode = '42501';
  end if;

  return query
  select
    (select count(*) from public.listings where not is_example),
    (select count(*) from public.listings where status = 'verified' and not is_example),
    (select count(*) from public.listings where status = 'pending' and not is_example),
    (select count(*) from public.listing_reviews where status = 'pending'),
    (select count(*) from public.events where status = 'published'),
    (select count(*) from public.events where status = 'pending'),
    (select count(*) from public.jobs where status = 'published'),
    (select count(*) from public.jobs where status = 'pending'),
    (select count(*) from public.job_applications),
    (select count(*) from public.editorial_tasks where status in ('open', 'in_progress')),
    (
      select count(*)
      from public.user_notifications
      where recipient_id = auth.uid() and read_at is null
    );
end;
$$;

revoke all on function public.dashboard_overview() from public, anon;
grant execute on function public.dashboard_overview() to authenticated;

create function public.owns_job(target_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.jobs as j
    where j.id = target_job_id
      and j.created_by = auth.uid()
  );
$$;

create function public.can_apply_to_job(target_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.jobs as j
    where j.id = target_job_id
      and j.status = 'published'
      and (j.created_by is null or j.created_by <> auth.uid())
      and (j.expires_at is null or j.expires_at > now())
  );
$$;

revoke all on function public.owns_job(uuid) from public, anon;
revoke all on function public.can_apply_to_job(uuid) from public, anon;
grant execute on function public.owns_job(uuid) to authenticated;
grant execute on function public.can_apply_to_job(uuid) to authenticated;

create function public.uuid_from_storage_path(object_name text, segment integer)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when segment between 1 and 10
      and split_part(object_name, '/', segment) ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(object_name, '/', segment)::uuid
    else null
  end;
$$;

revoke all on function public.uuid_from_storage_path(text, integer) from public, anon;
grant execute on function public.uuid_from_storage_path(text, integer) to authenticated;

create table public.practical_information (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  category text not null,
  summary text,
  content text,
  phone text,
  website text,
  address text,
  commune text,
  quartier text,
  latitude double precision,
  longitude double precision,
  source_url text,
  source_details text,
  source_checked_at timestamptz,
  status public.event_status not null default 'draft',
  created_by uuid references auth.users (id) on delete set null,
  moderated_by uuid references auth.users (id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (latitude is null or latitude between -90 and 90),
  check (longitude is null or longitude between -180 and 180),
  check (status <> 'published' or published_at is not null)
);

create index practical_information_public_idx
  on public.practical_information (category, title)
  where status = 'published';

create trigger practical_information_set_updated_at
before update on public.practical_information
for each row execute function public.set_updated_at();

create function public.protect_member_content_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_table_name = 'listings'
    and public.is_directory_staff() then
    return new;
  end if;

  if tg_table_name in ('events', 'jobs')
    and public.has_staff_role(array[
      'admin'::public.staff_role,
      'moderator'::public.staff_role
    ]) then
    return new;
  end if;

  if tg_table_name = 'listings' then
    if tg_op = 'INSERT' then
      new.owner_id := auth.uid();
      new.created_by := auth.uid();
      new.status := 'pending';
      new.is_example := false;
      new.source := 'declared_by_owner';
      new.source_details := null;
      new.partner_name := null;
      new.source_permission_reference := null;
      new.internal_notes := null;
      new.verified_by := null;
      new.last_verified_at := null;
      new.created_at := now();
      new.updated_at := now();
      return new;
    end if;

    if new.id is distinct from old.id
      or new.created_at is distinct from old.created_at
      or new.owner_id is distinct from old.owner_id
      or new.created_by is distinct from old.created_by
      or new.is_example is distinct from old.is_example
      or new.source is distinct from old.source
      or new.source_details is distinct from old.source_details
      or new.partner_name is distinct from old.partner_name
      or new.source_permission_reference is distinct from old.source_permission_reference
      or new.internal_notes is distinct from old.internal_notes
      or new.verified_by is distinct from old.verified_by
      or new.last_verified_at is distinct from old.last_verified_at then
      raise exception 'Members cannot change listing provenance or verification fields'
        using errcode = '42501';
    end if;
  elsif tg_table_name = 'events' then
    if tg_op = 'INSERT' then
      new.organizer_id := auth.uid();
      new.created_by := auth.uid();
      new.status := 'pending';
      new.is_example := false;
      new.source := 'declared_by_owner';
      new.source_details := null;
      new.moderated_by := null;
      new.published_at := null;
      new.created_at := now();
      new.updated_at := now();
      return new;
    end if;

    if new.id is distinct from old.id
      or new.created_at is distinct from old.created_at
      or new.organizer_id is distinct from old.organizer_id
      or new.created_by is distinct from old.created_by
      or new.is_example is distinct from old.is_example
      or new.source is distinct from old.source
      or new.source_details is distinct from old.source_details
      or new.moderated_by is distinct from old.moderated_by
      or new.published_at is distinct from old.published_at then
      raise exception 'Members cannot change event provenance or moderation fields'
        using errcode = '42501';
    end if;
  elsif tg_table_name = 'jobs' then
    if tg_op = 'INSERT' then
      new.employer_id := auth.uid();
      new.created_by := auth.uid();
      new.status := 'pending';
      new.is_example := false;
      new.source := 'declared_by_owner';
      new.source_details := null;
      new.moderated_by := null;
      new.published_at := null;
      new.created_at := now();
      new.updated_at := now();
      return new;
    end if;

    if new.id is distinct from old.id
      or new.created_at is distinct from old.created_at
      or new.employer_id is distinct from old.employer_id
      or new.created_by is distinct from old.created_by
      or new.is_example is distinct from old.is_example
      or new.source is distinct from old.source
      or new.source_details is distinct from old.source_details
      or new.moderated_by is distinct from old.moderated_by
      or new.published_at is distinct from old.published_at then
      raise exception 'Members cannot change job provenance or moderation fields'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger listings_protect_member_fields
before insert or update on public.listings
for each row execute function public.protect_member_content_fields();
create trigger events_protect_member_fields
before insert or update on public.events
for each row execute function public.protect_member_content_fields();
create trigger jobs_protect_member_fields
before insert or update on public.jobs
for each row execute function public.protect_member_content_fields();

create function public.protect_review_moderation_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null or public.has_staff_role(array[
    'admin'::public.staff_role,
    'moderator'::public.staff_role
  ]) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.author_id := auth.uid();
    new.status := 'pending';
    new.moderated_by := null;
    new.moderated_at := null;
    new.moderation_note := null;
    return new;
  end if;

  if new.listing_id is distinct from old.listing_id
    or new.author_id is distinct from old.author_id
    or new.author_display_name is distinct from old.author_display_name
    or new.status is distinct from old.status
    or new.moderated_by is distinct from old.moderated_by
    or new.moderated_at is distinct from old.moderated_at
    or new.moderation_note is distinct from old.moderation_note then
    raise exception 'Members cannot change review identity or moderation fields'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger listing_reviews_protect_moderation_fields
before insert or update on public.listing_reviews
for each row execute function public.protect_review_moderation_fields();

create function public.protect_job_application_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null or public.has_staff_role(array[
    'admin'::public.staff_role,
    'moderator'::public.staff_role
  ]) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.applicant_id := auth.uid();
    new.status := 'submitted';
    new.created_at := now();
    new.updated_at := now();
    if new.cv_storage_path is not null
      and (
        new.cv_storage_path !~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$'
        or split_part(new.cv_storage_path, '/', 1) <> auth.uid()::text
        or split_part(new.cv_storage_path, '/', 2) <> new.job_id::text
      ) then
      raise exception 'CV path must belong to this applicant and job'
        using errcode = '22023';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id
    or new.created_at is distinct from old.created_at
    or new.job_id is distinct from old.job_id
    or new.applicant_id is distinct from old.applicant_id
    or new.full_name is distinct from old.full_name
    or new.email is distinct from old.email
    or new.phone is distinct from old.phone
    or new.cover_letter is distinct from old.cover_letter
    or new.cv_storage_path is distinct from old.cv_storage_path then
    raise exception 'Applicants and employers cannot change application identity or submitted content'
      using errcode = '42501';
  end if;

  if old.applicant_id = auth.uid() then
    if old.status <> 'submitted' or new.status <> 'withdrawn' then
      raise exception 'Applicants may only withdraw a submitted application'
        using errcode = '42501';
    end if;
  elsif new.status not in ('reviewing', 'shortlisted', 'rejected') then
    raise exception 'Employers may only update an application review status'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger job_applications_protect_fields
before insert or update on public.job_applications
for each row execute function public.protect_job_application_fields();

create view public.public_practical_information
with (security_invoker = true)
as
select
  id, slug, title, category, summary, content, phone, website, address,
  commune, quartier, latitude, longitude, source_url, source_checked_at
from public.practical_information
where status = 'published';

create view public.admin_practical_information
with (security_barrier = true)
as
select i.*
from public.practical_information as i
where public.is_directory_staff();

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.saved_listings enable row level security;
alter table public.listing_reviews enable row level security;
alter table public.listing_moderation_history enable row level security;
alter table public.events enable row level security;
alter table public.jobs enable row level security;
alter table public.job_applications enable row level security;
alter table public.editorial_tasks enable row level security;
alter table public.editorial_calendar enable row level security;
alter table public.user_notifications enable row level security;
alter table public.admin_activity_log enable row level security;
alter table public.dashboard_daily_metrics enable row level security;
alter table public.dashboard_device_daily_metrics enable row level security;
alter table public.practical_information enable row level security;

create policy "Users read own profile"
on public.profiles for select to authenticated
using (id = (select auth.uid()) or public.is_directory_staff());
create policy "Users update own profile"
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));
grant select on public.profiles to authenticated;
grant update (full_name, phone, avatar_url, locale) on public.profiles to authenticated;
revoke all on public.profiles from anon;

create policy "Staff read roles"
on public.user_roles for select to authenticated
using (public.is_directory_staff());
create policy "Admins manage roles"
on public.user_roles for all to authenticated
using (public.has_staff_role(array['admin'::public.staff_role]))
with check (public.has_staff_role(array['admin'::public.staff_role]));
revoke all on public.user_roles from anon, authenticated;
grant select on public.user_roles to authenticated;

create policy "Users manage own saved listings"
on public.saved_listings for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
grant select, insert, delete on public.saved_listings to authenticated;
revoke update on public.saved_listings from authenticated;

create policy "Published reviews are public"
on public.listing_reviews for select to anon, authenticated
using (status = 'published');
create policy "Users read own reviews"
on public.listing_reviews for select to authenticated
using (author_id = (select auth.uid()));
create policy "Users submit own reviews"
on public.listing_reviews for insert to authenticated
with check (author_id = (select auth.uid()) and status = 'pending');
create policy "Users edit own pending reviews"
on public.listing_reviews for update to authenticated
using (author_id = (select auth.uid()) and status = 'pending')
with check (author_id = (select auth.uid()) and status = 'pending');
create policy "Staff moderate reviews"
on public.listing_reviews for update to authenticated
using (public.has_staff_role(array['admin'::public.staff_role, 'moderator'::public.staff_role]))
with check (public.has_staff_role(array['admin'::public.staff_role, 'moderator'::public.staff_role]));
create policy "Staff read all reviews"
on public.listing_reviews for select to authenticated
using (public.is_directory_staff());
revoke all on public.listing_reviews from anon, authenticated;
grant select (
  id, listing_id, author_display_name, rating, title, body, status, created_at, updated_at
) on public.listing_reviews to anon, authenticated;
grant insert (listing_id, author_id, rating, title, body)
  on public.listing_reviews to authenticated;
grant update (rating, title, body, status, moderated_by, moderated_at, moderation_note)
  on public.listing_reviews to authenticated;
grant select on public.admin_listing_reviews to authenticated;
revoke insert, update, delete on public.admin_listing_reviews from anon, authenticated;
grant select on public.admin_listings to authenticated;
revoke insert, update, delete on public.admin_listings from anon, authenticated;
grant select on public.public_listing_reviews, public.public_listing_ratings,
  public.public_listing_photos to anon, authenticated;

create policy "Staff read moderation history"
on public.listing_moderation_history for select to authenticated
using (public.is_directory_staff());
create policy "Owners read own moderation history"
on public.listing_moderation_history for select to authenticated
using (
  exists (
    select 1 from public.listings as l
    where l.id = listing_id and l.owner_id = (select auth.uid())
  )
);
grant select (id, listing_id, decision, owner_message, decided_at)
  on public.listing_moderation_history to authenticated;
grant select on public.my_listing_moderation_history,
  public.admin_listing_moderation_history to authenticated;
revoke insert, update, delete on public.listing_moderation_history,
  public.my_listing_moderation_history,
  public.admin_listing_moderation_history from anon, authenticated;

create policy "Public read published events"
on public.events for select to anon, authenticated
using (status = 'published');
create policy "Owners read own events"
on public.events for select to authenticated
using (created_by = (select auth.uid()));
create policy "Staff read all events"
on public.events for select to authenticated
using (public.is_directory_staff());
create policy "Members submit events"
on public.events for insert to authenticated
with check (
  created_by = (select auth.uid())
  and status = 'pending'
  and is_example = false
);
create policy "Owners edit pending events"
on public.events for update to authenticated
using (created_by = (select auth.uid()) and status in ('draft', 'pending'))
with check (created_by = (select auth.uid()) and status in ('draft', 'pending'));
create policy "Staff manage events"
on public.events for all to authenticated
using (public.has_staff_role(array['admin'::public.staff_role, 'moderator'::public.staff_role]))
with check (public.has_staff_role(array['admin'::public.staff_role, 'moderator'::public.staff_role]));
revoke all on public.events from anon, authenticated;
grant select (
  id, slug, title, category, description, starts_at, ends_at, timezone,
  venue, address, commune, quartier, latitude, longitude, price_label,
  ticket_url, cover_image_path, organizer_name, created_at, status
) on public.events to anon, authenticated;
grant insert, update, delete on public.events to authenticated;
grant select on public.public_events to anon, authenticated;
grant select on public.admin_events to authenticated;
revoke insert, update, delete on public.admin_events from anon, authenticated;

create policy "Public read published jobs"
on public.jobs for select to anon, authenticated
using (status = 'published' and (expires_at is null or expires_at > now()));
create policy "Employers read own jobs"
on public.jobs for select to authenticated
using (created_by = (select auth.uid()));
create policy "Staff read all jobs"
on public.jobs for select to authenticated
using (public.is_directory_staff());
create policy "Members submit jobs"
on public.jobs for insert to authenticated
with check (
  created_by = (select auth.uid())
  and status = 'pending'
  and is_example = false
);
create policy "Owners edit pending jobs"
on public.jobs for update to authenticated
using (created_by = (select auth.uid()) and status in ('draft', 'pending'))
with check (created_by = (select auth.uid()) and status in ('draft', 'pending'));
create policy "Staff manage jobs"
on public.jobs for all to authenticated
using (public.has_staff_role(array['admin'::public.staff_role, 'moderator'::public.staff_role]))
with check (public.has_staff_role(array['admin'::public.staff_role, 'moderator'::public.staff_role]));
revoke all on public.jobs from anon, authenticated;
grant select (
  id, slug, title, organization, description, requirements, location, commune,
  contract_type, salary_min, salary_max, salary_currency, application_url,
  source, source_url, published_at, expires_at, created_at, status
) on public.jobs to anon, authenticated;
grant insert, update, delete on public.jobs to authenticated;
grant select on public.public_jobs to anon, authenticated;
grant select on public.admin_jobs to authenticated;
revoke insert, update, delete on public.admin_jobs from anon, authenticated;

create policy "Applicants read own applications"
on public.job_applications for select to authenticated
using (applicant_id = (select auth.uid()));
create policy "Employers and staff read applications"
on public.job_applications for select to authenticated
using (
  public.has_staff_role(array['admin'::public.staff_role, 'moderator'::public.staff_role])
  or public.owns_job(job_id)
);
create policy "Users submit own applications to published jobs"
on public.job_applications for insert to authenticated
with check (
  applicant_id = (select auth.uid())
  and status = 'submitted'
  and public.can_apply_to_job(job_id)
);
create policy "Employers update applications for own jobs"
on public.job_applications for update to authenticated
using (public.owns_job(job_id))
with check (public.owns_job(job_id));
create policy "Applicants withdraw own applications"
on public.job_applications for update to authenticated
using (applicant_id = (select auth.uid()) and status = 'submitted')
with check (applicant_id = (select auth.uid()) and status = 'withdrawn');
create policy "Staff manage applications"
on public.job_applications for update to authenticated
using (public.has_staff_role(array['admin'::public.staff_role, 'moderator'::public.staff_role]))
with check (public.has_staff_role(array['admin'::public.staff_role, 'moderator'::public.staff_role]));
grant select, insert, update on public.job_applications to authenticated;
revoke delete on public.job_applications from anon, authenticated;

create policy "Staff manage editorial tasks"
on public.editorial_tasks for all to authenticated
using (public.is_directory_staff())
with check (public.is_directory_staff());
grant select, insert, update, delete on public.editorial_tasks to authenticated;

create policy "Staff manage editorial calendar"
on public.editorial_calendar for all to authenticated
using (public.is_directory_staff())
with check (public.is_directory_staff());
grant select, insert, update, delete on public.editorial_calendar to authenticated;

create policy "Users read own notifications"
on public.user_notifications for select to authenticated
using (recipient_id = (select auth.uid()));
create policy "Users mark own notifications read"
on public.user_notifications for update to authenticated
using (recipient_id = (select auth.uid()))
with check (recipient_id = (select auth.uid()));
create policy "Staff create notifications"
on public.user_notifications for insert to authenticated
with check (public.is_directory_staff());
grant select on public.user_notifications to authenticated;
grant insert on public.user_notifications to authenticated;
grant update (read_at) on public.user_notifications to authenticated;
revoke delete on public.user_notifications from anon, authenticated;

create policy "Staff read admin activity"
on public.admin_activity_log for select to authenticated
using (public.is_directory_staff());
grant select on public.admin_activity_log to authenticated;
revoke insert, update, delete on public.admin_activity_log from anon, authenticated;

create policy "Staff read dashboard metrics"
on public.dashboard_daily_metrics for select to authenticated
using (public.is_directory_staff());
create policy "Admins manage dashboard metrics"
on public.dashboard_daily_metrics for all to authenticated
using (public.has_staff_role(array['admin'::public.staff_role]))
with check (public.has_staff_role(array['admin'::public.staff_role]));
grant select, insert, update, delete on public.dashboard_daily_metrics to authenticated;
grant select on public.dashboard_metrics_30d to authenticated;

create policy "Staff read dashboard device metrics"
on public.dashboard_device_daily_metrics for select to authenticated
using (public.is_directory_staff());
create policy "Admins manage dashboard device metrics"
on public.dashboard_device_daily_metrics for all to authenticated
using (public.has_staff_role(array['admin'::public.staff_role]))
with check (public.has_staff_role(array['admin'::public.staff_role]));
grant select, insert, update, delete on public.dashboard_device_daily_metrics to authenticated;

create policy "Public read published practical information"
on public.practical_information for select to anon, authenticated
using (status = 'published');
create policy "Staff read all practical information"
on public.practical_information for select to authenticated
using (public.is_directory_staff());
create policy "Staff manage practical information"
on public.practical_information for all to authenticated
using (public.is_directory_staff())
with check (public.is_directory_staff());
revoke all on public.practical_information from anon, authenticated;
grant select (
  id, slug, title, category, summary, content, phone, website, address,
  commune, quartier, latitude, longitude, source_url, source_checked_at, status
) on public.practical_information to anon, authenticated;
grant insert, update, delete on public.practical_information to authenticated;
grant select on public.public_practical_information to anon, authenticated;
grant select on public.admin_practical_information to authenticated;
revoke insert, update, delete on public.admin_practical_information from anon, authenticated;

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values
  (
    'listing-photos',
    'listing-photos',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'job-applications',
    'job-applications',
    false,
    10485760,
    array['application/pdf']
  )
on conflict (id) do nothing;

create policy "Public read listing photos"
on storage.objects for select to anon, authenticated
using (bucket_id = 'listing-photos');

create policy "Staff upload listing photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'listing-photos'
  and public.is_directory_staff()
);

create policy "Owners upload listing photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'listing-photos'
  and split_part(name, '/', 1) ~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and exists (
    select 1
    from public.listings as l
    where l.id = public.uuid_from_storage_path(name, 1)
      and l.owner_id = (select auth.uid())
      and l.status in ('draft', 'pending')
      and not l.is_example
  )
);

create policy "Staff manage listing photo objects"
on storage.objects for update to authenticated
using (bucket_id = 'listing-photos' and public.is_directory_staff())
with check (bucket_id = 'listing-photos' and public.is_directory_staff());

create policy "Owners update pending listing photo objects"
on storage.objects for update to authenticated
using (
  bucket_id = 'listing-photos'
  and split_part(name, '/', 1) ~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and exists (
    select 1 from public.listings as l
    where l.id = public.uuid_from_storage_path(name, 1)
      and l.owner_id = (select auth.uid())
      and l.status in ('draft', 'pending')
      and not l.is_example
  )
)
with check (
  bucket_id = 'listing-photos'
  and split_part(name, '/', 1) ~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and exists (
    select 1 from public.listings as l
    where l.id = public.uuid_from_storage_path(name, 1)
      and l.owner_id = (select auth.uid())
      and l.status in ('draft', 'pending')
      and not l.is_example
  )
);

create policy "Staff delete listing photo objects"
on storage.objects for delete to authenticated
using (bucket_id = 'listing-photos' and public.is_directory_staff());

create policy "Owners delete pending listing photo objects"
on storage.objects for delete to authenticated
using (
  bucket_id = 'listing-photos'
  and split_part(name, '/', 1) ~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and exists (
    select 1 from public.listings as l
    where l.id = split_part(name, '/', 1)::uuid
      and l.owner_id = (select auth.uid())
      and l.status in ('draft', 'pending')
      and not l.is_example
  )
);

create policy "Applicants upload own CV"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'job-applications'
  and name ~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$'
  and split_part(name, '/', 1) = (select auth.uid())::text
  and public.can_apply_to_job(public.uuid_from_storage_path(name, 2))
);

create policy "Applicants read own CV"
on storage.objects for select to authenticated
using (
  bucket_id = 'job-applications'
  and split_part(name, '/', 1) = (select auth.uid())::text
);

create policy "Employers and moderators read submitted CVs"
on storage.objects for select to authenticated
using (
  bucket_id = 'job-applications'
  and name ~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$'
  and (
    public.has_staff_role(array['admin'::public.staff_role, 'moderator'::public.staff_role])
    or public.owns_job(public.uuid_from_storage_path(name, 2))
  )
);

create policy "Applicants replace own CV"
on storage.objects for update to authenticated
using (
  bucket_id = 'job-applications'
  and split_part(name, '/', 1) = (select auth.uid())::text
)
with check (
  bucket_id = 'job-applications'
  and split_part(name, '/', 1) = (select auth.uid())::text
  and public.can_apply_to_job(public.uuid_from_storage_path(name, 2))
);

create policy "Applicants delete own CV"
on storage.objects for delete to authenticated
using (
  bucket_id = 'job-applications'
  and split_part(name, '/', 1) = (select auth.uid())::text
);


create function public.verify_listing(
  target_listing_id uuid,
  verification_type public.verification_method,
  verification_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  verification_time timestamptz := now();
begin
  if not public.has_staff_role(array[
    'admin'::public.staff_role,
    'verifier'::public.staff_role
  ]) then
    raise exception 'Only an administrator or verifier can verify a listing'
      using errcode = '42501';
  end if;

  insert into public.listing_verifications (
    listing_id, method, verified_by, verified_at, notes
  )
  values (
    target_listing_id, verification_type, auth.uid(), verification_time,
    left(verification_notes, 2000)
  );

  update public.listings
  set status = 'verified',
      verified_by = auth.uid(),
      last_verified_at = verification_time
  where id = target_listing_id
    and is_example = false;

  if not found then
    raise exception 'Listing does not exist or is a demonstration record'
      using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.verify_listing(uuid, public.verification_method, text) from public, anon;
grant execute on function public.verify_listing(uuid, public.verification_method, text) to authenticated;
revoke insert, update, delete on public.listing_verifications from authenticated;

create or replace function public.require_listing_verification_evidence()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'verified' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.status = 'verified'
      and new.last_verified_at is not distinct from old.last_verified_at
      and new.verified_by is not distinct from old.verified_by then
      return new;
    end if;

    if old.last_verified_at is not null
      and new.last_verified_at <= old.last_verified_at then
      raise exception 'A renewed verification must have a newer timestamp';
    end if;
  end if;

  if not exists (
    select 1
    from public.listing_verifications as v
    where v.listing_id = new.id
      and v.verified_by = new.verified_by
      and v.verified_at = new.last_verified_at
  ) then
    raise exception 'A verified listing must have a matching verification record';
  end if;

  return new;
end;
$$;

create function public.decide_listing_review(
  target_listing_id uuid,
  target_decision public.listing_moderation_decision,
  message_for_owner text default '',
  staff_note text default null,
  verification_type public.verification_method default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_staff_role(array[
    'admin'::public.staff_role,
    'moderator'::public.staff_role,
    'verifier'::public.staff_role
  ]) then
    raise exception 'Staff permission is required to moderate a listing'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.listings
    where id = target_listing_id and not is_example
  ) then
    raise exception 'Listing does not exist or is a demonstration record'
      using errcode = 'P0002';
  end if;

  if target_decision = 'approved'
    and not public.has_staff_role(array[
      'admin'::public.staff_role,
      'verifier'::public.staff_role
    ]) then
    raise exception 'Only an administrator or verifier can approve a listing'
      using errcode = '42501';
  end if;

  if target_decision = 'approved' and verification_type is null then
    raise exception 'An approval requires a verification method'
      using errcode = '22023';
  end if;

  insert into public.listing_moderation_history (
    listing_id, decision, owner_message, internal_note, decided_by
  )
  values (
    target_listing_id, target_decision, left(coalesce(message_for_owner, ''), 3000),
    left(staff_note, 3000), auth.uid()
  );

  if target_decision = 'approved' then
    perform public.verify_listing(
      target_listing_id,
      verification_type,
      'Approbation via la file de modération'
    );
  elsif target_decision = 'changes_requested' then
    update public.listings
    set status = 'draft'
    where id = target_listing_id;
  else
    update public.listings
    set status = 'suspended'
    where id = target_listing_id;
  end if;
end;
$$;

revoke all on function public.decide_listing_review(
  uuid, public.listing_moderation_decision, text, text, public.verification_method
) from public, anon;
grant execute on function public.decide_listing_review(
  uuid, public.listing_moderation_decision, text, text, public.verification_method
) to authenticated;

create policy "Owners create pending listings"
on public.listings for insert to authenticated
with check (
  created_by = (select auth.uid())
  and owner_id = (select auth.uid())
  and status = 'pending'
  and is_example = false
  and source = 'declared_by_owner'
);
create policy "Owners read own listings"
on public.listings for select to authenticated
using (owner_id = (select auth.uid()));
create policy "Owners edit unverified listings"
on public.listings for update to authenticated
using (
  owner_id = (select auth.uid())
  and status in ('draft', 'pending')
  and is_example = false
)
with check (
  owner_id = (select auth.uid())
  and status in ('draft', 'pending')
  and is_example = false
);
grant insert on public.listings to authenticated;
grant update on public.listings to authenticated;
revoke select on public.listings from authenticated;
grant select (
  id, slug, name, category_id, subcategory_id, description, address, commune,
  quartier, latitude, longitude, phone, whatsapp, email, website, social_links,
  status, owner_id, created_at, updated_at
) on public.listings to authenticated;

create policy "Owners manage own pending listing hours"
on public.listing_hours for all to authenticated
using (
  exists (
    select 1 from public.listings as l
    where l.id = listing_id
      and l.owner_id = (select auth.uid())
      and l.status in ('draft', 'pending')
      and not l.is_example
  )
)
with check (
  exists (
    select 1 from public.listings as l
    where l.id = listing_id
      and l.owner_id = (select auth.uid())
      and l.status in ('draft', 'pending')
      and not l.is_example
  )
);
create policy "Owners manage own pending listing payments"
on public.listing_payments for all to authenticated
using (
  exists (
    select 1 from public.listings as l
    where l.id = listing_id and l.owner_id = (select auth.uid())
      and l.status in ('draft', 'pending') and not l.is_example
  )
)
with check (
  exists (
    select 1 from public.listings as l
    where l.id = listing_id and l.owner_id = (select auth.uid())
      and l.status in ('draft', 'pending') and not l.is_example
  )
);
create policy "Owners manage own pending listing languages"
on public.listing_languages for all to authenticated
using (
  exists (
    select 1 from public.listings as l
    where l.id = listing_id and l.owner_id = (select auth.uid())
      and l.status in ('draft', 'pending') and not l.is_example
  )
)
with check (
  exists (
    select 1 from public.listings as l
    where l.id = listing_id and l.owner_id = (select auth.uid())
      and l.status in ('draft', 'pending') and not l.is_example
  )
);
create policy "Owners manage own pending listing keywords"
on public.listing_keywords for all to authenticated
using (
  exists (
    select 1 from public.listings as l
    where l.id = listing_id and l.owner_id = (select auth.uid())
      and l.status in ('draft', 'pending') and not l.is_example
  )
)
with check (
  exists (
    select 1 from public.listings as l
    where l.id = listing_id and l.owner_id = (select auth.uid())
      and l.status in ('draft', 'pending') and not l.is_example
  )
);
create policy "Owners manage own pending listing photos"
on public.listing_photos for all to authenticated
using (
  exists (
    select 1 from public.listings as l
    where l.id = listing_id and l.owner_id = (select auth.uid())
      and l.status in ('draft', 'pending') and not l.is_example
  )
)
with check (
  exists (
    select 1 from public.listings as l
    where l.id = listing_id and l.owner_id = (select auth.uid())
      and l.status in ('draft', 'pending') and not l.is_example
  )
);

drop policy "Staff manage categories" on public.categories;
create policy "Admins manage categories"
on public.categories for all to authenticated
using (public.has_staff_role(array['admin'::public.staff_role]))
with check (public.has_staff_role(array['admin'::public.staff_role]));
drop policy "Staff manage subcategories" on public.subcategories;
create policy "Admins manage subcategories"
on public.subcategories for all to authenticated
using (public.has_staff_role(array['admin'::public.staff_role]))
with check (public.has_staff_role(array['admin'::public.staff_role]));

drop policy "Staff manage listings" on public.listings;
create policy "Staff manage listings"
on public.listings for all to authenticated
using (public.is_directory_staff())
with check (public.is_directory_staff());
drop policy "Staff manage listing hours" on public.listing_hours;
create policy "Staff manage listing hours"
on public.listing_hours for all to authenticated
using (public.is_directory_staff())
with check (public.is_directory_staff());
drop policy "Staff manage listing payments" on public.listing_payments;
create policy "Staff manage listing payments"
on public.listing_payments for all to authenticated
using (public.is_directory_staff())
with check (public.is_directory_staff());
drop policy "Staff manage listing languages" on public.listing_languages;
create policy "Staff manage listing languages"
on public.listing_languages for all to authenticated
using (public.is_directory_staff())
with check (public.is_directory_staff());
drop policy "Staff manage listing keywords" on public.listing_keywords;
create policy "Staff manage listing keywords"
on public.listing_keywords for all to authenticated
using (public.is_directory_staff())
with check (public.is_directory_staff());
drop policy "Staff manage listing photos" on public.listing_photos;
create policy "Staff manage listing photos"
on public.listing_photos for all to authenticated
using (public.is_directory_staff())
with check (public.is_directory_staff());
drop policy "Staff manage professional details" on public.listing_professional_details;
create policy "Staff manage professional details"
on public.listing_professional_details for all to authenticated
using (public.is_directory_staff())
with check (public.is_directory_staff());
create policy "Owners manage own pending professional details"
on public.listing_professional_details for all to authenticated
using (
  exists (
    select 1 from public.listings as l
    where l.id = listing_id
      and l.owner_id = (select auth.uid())
      and l.status in ('draft', 'pending')
      and not l.is_example
  )
)
with check (
  exists (
    select 1 from public.listings as l
    where l.id = listing_id
      and l.owner_id = (select auth.uid())
      and l.status in ('draft', 'pending')
      and not l.is_example
  )
);
