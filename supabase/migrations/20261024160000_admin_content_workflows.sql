create or replace view public.public_listing_details
with (security_barrier = true)
as
select
  l.id,
  l.slug,
  l.name,
  l.category_id,
  c.name as category_name,
  l.subcategory_id,
  s.name as subcategory_name,
  l.description,
  l.address,
  l.commune,
  l.quartier,
  l.latitude,
  l.longitude,
  l.phone,
  l.whatsapp,
  l.email,
  l.website,
  l.social_links,
  l.status,
  l.last_verified_at,
  coalesce(r.average_rating, 0)::numeric(2, 1) as average_rating,
  coalesce(r.reviews_count, 0)::integer as reviews_count,
  coalesce(hours.items, '[]'::jsonb) as hours,
  coalesce(payments.items, '[]'::jsonb) as payments,
  coalesce(languages.items, '[]'::jsonb) as languages,
  coalesce(keywords.items, '[]'::jsonb) as keywords
from public.listings as l
join public.categories as c on c.id = l.category_id
join public.subcategories as s
  on s.category_id = l.category_id and s.id = l.subcategory_id
left join public.public_listing_ratings as r on r.listing_id = l.id
left join lateral (
  select jsonb_agg(
    jsonb_build_object(
      'day_of_week', h.day_of_week,
      'opens_at', h.opens_at,
      'closes_at', h.closes_at,
      'is_closed', h.is_closed
    ) order by h.day_of_week
  ) as items
  from public.listing_hours as h
  where h.listing_id = l.id
) as hours on true
left join lateral (
  select jsonb_agg(p.payment_method order by p.payment_method) as items
  from public.listing_payments as p
  where p.listing_id = l.id
) as payments on true
left join lateral (
  select jsonb_agg(lang.language order by lang.language) as items
  from public.listing_languages as lang
  where lang.listing_id = l.id
) as languages on true
left join lateral (
  select jsonb_agg(k.keyword order by k.keyword) as items
  from public.listing_keywords as k
  where k.listing_id = l.id
) as keywords on true
where l.status = 'verified'
  and l.last_verified_at >= now() - interval '6 months';

grant select on public.public_listing_details to anon, authenticated;

grant select (application_email) on public.jobs to anon, authenticated;

create or replace view public.public_jobs
with (security_invoker = true)
as
select
  id, slug, title, organization, description, requirements, location,
  commune, contract_type, salary_min, salary_max, salary_currency,
  application_url, source, source_url, published_at, expires_at, created_at,
  application_email
from public.jobs
where status = 'published'
  and (expires_at is null or expires_at > now());

grant select on public.public_jobs to anon, authenticated;

create function public.admin_create_listing(
  p_listing jsonb,
  p_hours jsonb default '[]'::jsonb,
  p_payments text[] default '{}',
  p_languages text[] default '{}',
  p_keywords text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid := gen_random_uuid();
  actor_id uuid := auth.uid();
  slug_value text;
  hour_item jsonb;
  verified_at_value timestamptz := now();
begin
  if actor_id is null
    or not public.has_staff_role(array['admin'::public.staff_role]) then
    raise exception 'Administrator role required' using errcode = '42501';
  end if;

  if p_listing is null
    or jsonb_typeof(p_listing) is distinct from 'object'
    or jsonb_typeof(coalesce(p_hours, '[]'::jsonb)) is distinct from 'array' then
    raise exception 'Invalid listing payload' using errcode = '22023';
  end if;

  slug_value := trim(both '-' from regexp_replace(
    lower(coalesce(p_listing ->> 'name', '')),
    '[^a-z0-9]+',
    '-',
    'g'
  ));
  if slug_value = '' then
    raise exception 'Listing name is required' using errcode = '22023';
  end if;
  slug_value := left(slug_value, 120) || '-' || left(new_id::text, 8);

  insert into public.listings (
    id, slug, name, category_id, subcategory_id, description, address,
    commune, quartier, latitude, longitude, phone, whatsapp, email, website,
    social_links, status, source, owner_id, created_by
  ) values (
    new_id,
    slug_value,
    trim(p_listing ->> 'name'),
    p_listing ->> 'category_id',
    p_listing ->> 'subcategory_id',
    nullif(trim(p_listing ->> 'description'), ''),
    nullif(trim(p_listing ->> 'address'), ''),
    nullif(trim(p_listing ->> 'commune'), ''),
    nullif(trim(p_listing ->> 'quartier'), ''),
    nullif(p_listing ->> 'latitude', '')::double precision,
    nullif(p_listing ->> 'longitude', '')::double precision,
    nullif(trim(p_listing ->> 'phone'), ''),
    nullif(trim(p_listing ->> 'whatsapp'), ''),
    nullif(trim(p_listing ->> 'email'), ''),
    nullif(trim(p_listing ->> 'website'), ''),
    coalesce(p_listing -> 'social_links', '{}'::jsonb),
    'draft',
    'declared_by_owner',
    actor_id,
    actor_id
  );

  for hour_item in select value from jsonb_array_elements(coalesce(p_hours, '[]'::jsonb))
  loop
    insert into public.listing_hours (
      listing_id, day_of_week, opens_at, closes_at, is_closed
    ) values (
      new_id,
      (hour_item ->> 'day_of_week')::smallint,
      nullif(hour_item ->> 'opens_at', '')::time,
      nullif(hour_item ->> 'closes_at', '')::time,
      coalesce((hour_item ->> 'is_closed')::boolean, false)
    );
  end loop;

  insert into public.listing_payments (listing_id, payment_method)
  select new_id, distinct_value
  from (select distinct unnest(coalesce(p_payments, '{}'::text[])) as distinct_value) as values_to_insert;

  insert into public.listing_languages (listing_id, language)
  select new_id, distinct_value
  from (select distinct unnest(coalesce(p_languages, '{}'::text[])) as distinct_value) as values_to_insert;

  insert into public.listing_keywords (listing_id, keyword)
  select new_id, left(trim(distinct_value), 80)
  from (
    select distinct trim(value) as distinct_value
    from unnest(coalesce(p_keywords, '{}'::text[])) as keywords(value)
    where trim(value) <> ''
  ) as values_to_insert;

  insert into public.listing_verifications (
    listing_id, method, verified_by, verified_at, notes
  ) values (
    new_id,
    'other',
    actor_id,
    verified_at_value,
    'Fiche ajoutée et publiée par un administrateur.'
  );

  update public.listings
  set status = 'verified',
      last_verified_at = verified_at_value,
      verified_by = actor_id
  where id = new_id;

  return new_id;
end;
$$;

create function public.admin_set_listing_status(
  p_listing_id uuid,
  p_status public.listing_status,
  p_method public.verification_method default 'other',
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  verified_at_value timestamptz := now();
begin
  if actor_id is null
    or not public.has_staff_role(array['admin'::public.staff_role]) then
    raise exception 'Administrator role required' using errcode = '42501';
  end if;

  if p_status = 'verified' then
    insert into public.listing_verifications (
      listing_id, method, verified_by, verified_at, notes
    ) values (
      p_listing_id,
      p_method,
      actor_id,
      verified_at_value,
      nullif(trim(p_notes), '')
    );

    update public.listings
    set status = p_status,
        verified_by = actor_id,
        last_verified_at = verified_at_value
    where id = p_listing_id;
  else
    update public.listings
    set status = p_status
    where id = p_listing_id;
  end if;

  if not found then
    raise exception 'Listing not found' using errcode = 'P0002';
  end if;
end;
$$;

create function public.admin_update_listing(
  p_listing_id uuid,
  p_listing jsonb,
  p_hours jsonb default '[]'::jsonb,
  p_payments text[] default '{}',
  p_languages text[] default '{}',
  p_keywords text[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  hour_item jsonb;
begin
  if actor_id is null
    or not public.has_staff_role(array['admin'::public.staff_role]) then
    raise exception 'Administrator role required' using errcode = '42501';
  end if;

  if p_listing is null
    or jsonb_typeof(p_listing) is distinct from 'object'
    or jsonb_typeof(coalesce(p_hours, '[]'::jsonb)) is distinct from 'array' then
    raise exception 'Invalid listing payload' using errcode = '22023';
  end if;

  update public.listings
  set name = trim(p_listing ->> 'name'),
      category_id = p_listing ->> 'category_id',
      subcategory_id = p_listing ->> 'subcategory_id',
      description = nullif(trim(p_listing ->> 'description'), ''),
      address = nullif(trim(p_listing ->> 'address'), ''),
      commune = nullif(trim(p_listing ->> 'commune'), ''),
      quartier = nullif(trim(p_listing ->> 'quartier'), ''),
      latitude = nullif(p_listing ->> 'latitude', '')::double precision,
      longitude = nullif(p_listing ->> 'longitude', '')::double precision,
      phone = nullif(trim(p_listing ->> 'phone'), ''),
      whatsapp = nullif(trim(p_listing ->> 'whatsapp'), ''),
      email = nullif(trim(p_listing ->> 'email'), ''),
      website = nullif(trim(p_listing ->> 'website'), ''),
      social_links = coalesce(p_listing -> 'social_links', '{}'::jsonb)
  where id = p_listing_id;

  if not found then
    raise exception 'Listing not found' using errcode = 'P0002';
  end if;

  delete from public.listing_hours where listing_id = p_listing_id;
  delete from public.listing_payments where listing_id = p_listing_id;
  delete from public.listing_languages where listing_id = p_listing_id;
  delete from public.listing_keywords where listing_id = p_listing_id;

  for hour_item in select value from jsonb_array_elements(coalesce(p_hours, '[]'::jsonb))
  loop
    insert into public.listing_hours (
      listing_id, day_of_week, opens_at, closes_at, is_closed
    ) values (
      p_listing_id,
      (hour_item ->> 'day_of_week')::smallint,
      nullif(hour_item ->> 'opens_at', '')::time,
      nullif(hour_item ->> 'closes_at', '')::time,
      coalesce((hour_item ->> 'is_closed')::boolean, false)
    );
  end loop;

  insert into public.listing_payments (listing_id, payment_method)
  select p_listing_id, distinct_value
  from (select distinct unnest(coalesce(p_payments, '{}'::text[])) as distinct_value) as values_to_insert;

  insert into public.listing_languages (listing_id, language)
  select p_listing_id, distinct_value
  from (select distinct unnest(coalesce(p_languages, '{}'::text[])) as distinct_value) as values_to_insert;

  insert into public.listing_keywords (listing_id, keyword)
  select p_listing_id, left(trim(distinct_value), 80)
  from (
    select distinct trim(value) as distinct_value
    from unnest(coalesce(p_keywords, '{}'::text[])) as keywords(value)
    where trim(value) <> ''
  ) as values_to_insert;
end;
$$;

revoke all on function public.admin_create_listing(jsonb, jsonb, text[], text[], text[])
  from public, anon;
grant execute on function public.admin_create_listing(jsonb, jsonb, text[], text[], text[])
  to authenticated;
revoke all on function public.admin_set_listing_status(
  uuid, public.listing_status, public.verification_method, text
) from public, anon;
grant execute on function public.admin_set_listing_status(
  uuid, public.listing_status, public.verification_method, text
) to authenticated;
revoke all on function public.admin_update_listing(uuid, jsonb, jsonb, text[], text[], text[])
  from public, anon;
grant execute on function public.admin_update_listing(uuid, jsonb, jsonb, text[], text[], text[])
  to authenticated;
