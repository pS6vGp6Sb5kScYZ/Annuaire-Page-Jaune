create function public.admin_create_job(p_job jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  new_id uuid := gen_random_uuid();
  title_value text;
  organization_value text;
  slug_value text;
begin
  if actor_id is null
    or not public.has_staff_role(array['admin'::public.staff_role]) then
    raise exception 'Administrator role required' using errcode = '42501';
  end if;

  if p_job is null or jsonb_typeof(p_job) is distinct from 'object' then
    raise exception 'Invalid job payload' using errcode = '22023';
  end if;

  title_value := trim(coalesce(p_job ->> 'title', ''));
  organization_value := trim(coalesce(p_job ->> 'organization', ''));
  if char_length(title_value) < 3 or char_length(title_value) > 180
    or organization_value = '' or char_length(organization_value) > 180 then
    raise exception 'A valid job title and organization are required'
      using errcode = '22023';
  end if;

  slug_value := trim(both '-' from regexp_replace(
    lower(coalesce(p_job ->> 'slug', title_value)),
    '[^a-z0-9]+',
    '-',
    'g'
  ));
  slug_value := left(coalesce(nullif(slug_value, ''), 'job'), 120)
    || '-' || left(new_id::text, 8);

  insert into public.jobs (
    id, slug, title, organization, description, requirements, location,
    commune, contract_type, salary_min, salary_max, salary_currency,
    application_url, application_email, source, source_url, source_details,
    status, published_at, expires_at, employer_id, created_by, is_example
  ) values (
    new_id,
    slug_value,
    title_value,
    organization_value,
    nullif(trim(p_job ->> 'description'), ''),
    nullif(trim(p_job ->> 'requirements'), ''),
    nullif(trim(p_job ->> 'location'), ''),
    nullif(trim(p_job ->> 'commune'), ''),
    nullif(trim(p_job ->> 'contract_type'), ''),
    nullif(p_job ->> 'salary_min', '')::numeric,
    nullif(p_job ->> 'salary_max', '')::numeric,
    coalesce(nullif(p_job ->> 'salary_currency', ''), 'USD'),
    nullif(trim(p_job ->> 'application_url'), ''),
    nullif(trim(p_job ->> 'application_email'), ''),
    coalesce(nullif(p_job ->> 'source', '')::public.listing_source, 'declared_by_owner'),
    nullif(trim(p_job ->> 'source_url'), ''),
    nullif(trim(p_job ->> 'source_details'), ''),
    'published',
    now(),
    nullif(p_job ->> 'expires_at', '')::timestamptz,
    actor_id,
    actor_id,
    false
  );

  return new_id;
end;
$$;

create function public.admin_update_job(p_job_id uuid, p_job jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not public.has_staff_role(array['admin'::public.staff_role]) then
    raise exception 'Administrator role required' using errcode = '42501';
  end if;

  if p_job is null or jsonb_typeof(p_job) is distinct from 'object' then
    raise exception 'Invalid job payload' using errcode = '22023';
  end if;

  update public.jobs as j
  set title = case when p_job ? 'title' then trim(p_job ->> 'title') else j.title end,
      organization = case when p_job ? 'organization' then trim(p_job ->> 'organization') else j.organization end,
      description = case when p_job ? 'description' then nullif(trim(p_job ->> 'description'), '') else j.description end,
      requirements = case when p_job ? 'requirements' then nullif(trim(p_job ->> 'requirements'), '') else j.requirements end,
      location = case when p_job ? 'location' then nullif(trim(p_job ->> 'location'), '') else j.location end,
      commune = case when p_job ? 'commune' then nullif(trim(p_job ->> 'commune'), '') else j.commune end,
      contract_type = case when p_job ? 'contract_type' then nullif(trim(p_job ->> 'contract_type'), '') else j.contract_type end,
      salary_min = case when p_job ? 'salary_min' then nullif(p_job ->> 'salary_min', '')::numeric else j.salary_min end,
      salary_max = case when p_job ? 'salary_max' then nullif(p_job ->> 'salary_max', '')::numeric else j.salary_max end,
      salary_currency = case when p_job ? 'salary_currency' then coalesce(nullif(p_job ->> 'salary_currency', ''), 'USD') else j.salary_currency end,
      application_url = case when p_job ? 'application_url' then nullif(trim(p_job ->> 'application_url'), '') else j.application_url end,
      application_email = case when p_job ? 'application_email' then nullif(trim(p_job ->> 'application_email'), '') else j.application_email end,
      source_url = case when p_job ? 'source_url' then nullif(trim(p_job ->> 'source_url'), '') else j.source_url end,
      expires_at = case when p_job ? 'expires_at' then nullif(p_job ->> 'expires_at', '')::timestamptz else j.expires_at end,
      status = case when p_job ? 'status' then (p_job ->> 'status')::public.job_status else j.status end,
      published_at = case when p_job ? 'published_at' then nullif(p_job ->> 'published_at', '')::timestamptz else j.published_at end
  where j.id = p_job_id;

  if not found then
    raise exception 'Job not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.admin_create_job(jsonb) from public, anon;
revoke all on function public.admin_update_job(uuid, jsonb) from public, anon;
grant execute on function public.admin_create_job(jsonb) to authenticated;
grant execute on function public.admin_update_job(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
