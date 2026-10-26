create function public.admin_create_event(p_event jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  new_id uuid := gen_random_uuid();
  title_value text;
  slug_value text;
  starts_at_value timestamptz;
begin
  if actor_id is null
    or not public.has_staff_role(array['admin'::public.staff_role]) then
    raise exception 'Administrator role required' using errcode = '42501';
  end if;

  if p_event is null or jsonb_typeof(p_event) is distinct from 'object' then
    raise exception 'Invalid event payload' using errcode = '22023';
  end if;

  title_value := trim(coalesce(p_event ->> 'title', ''));
  if char_length(title_value) < 3 or char_length(title_value) > 180 then
    raise exception 'Event title must contain between 3 and 180 characters'
      using errcode = '22023';
  end if;

  starts_at_value := nullif(p_event ->> 'starts_at', '')::timestamptz;
  if starts_at_value is null then
    raise exception 'Event start date is required' using errcode = '22023';
  end if;

  slug_value := coalesce(
    nullif(trim(both '-' from regexp_replace(
      lower(coalesce(p_event ->> 'slug', title_value)),
      '[^a-z0-9]+',
      '-',
      'g'
    )), ''),
    'event'
  );
  slug_value := left(slug_value, 120) || '-' || left(new_id::text, 8);

  insert into public.events (
    id, slug, title, category, description, starts_at, ends_at, timezone,
    venue, address, commune, quartier, latitude, longitude, price_label,
    ticket_url, organizer_name, source_details, status, is_example, created_by, published_at
  ) values (
    new_id,
    slug_value,
    title_value,
    nullif(trim(p_event ->> 'category'), ''),
    nullif(trim(p_event ->> 'description'), ''),
    starts_at_value,
    nullif(p_event ->> 'ends_at', '')::timestamptz,
    coalesce(nullif(trim(p_event ->> 'timezone'), ''), 'Africa/Lubumbashi'),
    nullif(trim(p_event ->> 'venue'), ''),
    nullif(trim(p_event ->> 'address'), ''),
    nullif(trim(p_event ->> 'commune'), ''),
    nullif(trim(p_event ->> 'quartier'), ''),
    nullif(p_event ->> 'latitude', '')::double precision,
    nullif(p_event ->> 'longitude', '')::double precision,
    nullif(trim(p_event ->> 'price_label'), ''),
    nullif(trim(p_event ->> 'ticket_url'), ''),
    nullif(trim(p_event ->> 'organizer_name'), ''),
    nullif(trim(p_event ->> 'source_details'), ''),
    'published',
    false,
    actor_id,
    now()
  );

  return new_id;
end;
$$;

create function public.admin_update_event(p_event_id uuid, p_event jsonb)
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

  if p_event is null or jsonb_typeof(p_event) is distinct from 'object' then
    raise exception 'Invalid event payload' using errcode = '22023';
  end if;

  update public.events as e
  set title = case when p_event ? 'title' then trim(p_event ->> 'title') else e.title end,
      category = case when p_event ? 'category' then nullif(trim(p_event ->> 'category'), '') else e.category end,
      description = case when p_event ? 'description' then nullif(trim(p_event ->> 'description'), '') else e.description end,
      starts_at = case when p_event ? 'starts_at' then nullif(p_event ->> 'starts_at', '')::timestamptz else e.starts_at end,
      ends_at = case when p_event ? 'ends_at' then nullif(p_event ->> 'ends_at', '')::timestamptz else e.ends_at end,
      timezone = case when p_event ? 'timezone' then coalesce(nullif(trim(p_event ->> 'timezone'), ''), 'Africa/Lubumbashi') else e.timezone end,
      venue = case when p_event ? 'venue' then nullif(trim(p_event ->> 'venue'), '') else e.venue end,
      address = case when p_event ? 'address' then nullif(trim(p_event ->> 'address'), '') else e.address end,
      commune = case when p_event ? 'commune' then nullif(trim(p_event ->> 'commune'), '') else e.commune end,
      quartier = case when p_event ? 'quartier' then nullif(trim(p_event ->> 'quartier'), '') else e.quartier end,
      latitude = case when p_event ? 'latitude' then nullif(p_event ->> 'latitude', '')::double precision else e.latitude end,
      longitude = case when p_event ? 'longitude' then nullif(p_event ->> 'longitude', '')::double precision else e.longitude end,
      price_label = case when p_event ? 'price_label' then nullif(trim(p_event ->> 'price_label'), '') else e.price_label end,
      ticket_url = case when p_event ? 'ticket_url' then nullif(trim(p_event ->> 'ticket_url'), '') else e.ticket_url end,
      organizer_name = case when p_event ? 'organizer_name' then nullif(trim(p_event ->> 'organizer_name'), '') else e.organizer_name end,
      source_details = case when p_event ? 'source_details' then nullif(trim(p_event ->> 'source_details'), '') else e.source_details end,
      status = case when p_event ? 'status' then (p_event ->> 'status')::public.event_status else e.status end,
      published_at = case when p_event ? 'published_at' then nullif(p_event ->> 'published_at', '')::timestamptz else e.published_at end
  where e.id = p_event_id;

  if not found then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.admin_create_event(jsonb) from public, anon;
revoke all on function public.admin_update_event(uuid, jsonb) from public, anon;
grant execute on function public.admin_create_event(jsonb) to authenticated;
grant execute on function public.admin_update_event(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
