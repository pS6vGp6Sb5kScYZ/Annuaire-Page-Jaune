create function public.record_device_session(p_device public.device_category)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role access is required'
      using errcode = '42501';
  end if;

  insert into public.dashboard_device_daily_metrics as current_metrics (
    metric_date,
    device,
    sessions,
    visitors,
    source
  )
  values (
    (now() at time zone 'Africa/Lubumbashi')::date,
    p_device,
    1,
    0,
    'site_tracker'
  )
  on conflict (metric_date, device, source)
  do update set
    sessions = current_metrics.sessions + 1,
    updated_at = now();

  insert into public.dashboard_daily_metrics as current_metrics (
    metric_date,
    metric_key,
    metric_value,
    source
  )
  values (
    (now() at time zone 'Africa/Lubumbashi')::date,
    'sessions',
    1,
    'site_tracker'
  )
  on conflict (metric_date, metric_key, source)
  do update set
    metric_value = current_metrics.metric_value + 1,
    updated_at = now();
end;
$$;

create function public.read_public_device_metrics(p_days integer)
returns table (
  device public.device_category,
  sessions bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role access is required'
      using errcode = '42501';
  end if;

  if p_days is null or p_days not in (7, 30, 90) then
    raise exception 'Unsupported analytics period'
      using errcode = '22023';
  end if;

  return query
  select metrics.device, sum(metrics.sessions)::bigint
  from public.dashboard_device_daily_metrics as metrics
  where metrics.source = 'site_tracker'
    and metrics.metric_date >=
      (now() at time zone 'Africa/Lubumbashi')::date - (p_days - 1)
    and metrics.metric_date <=
      (now() at time zone 'Africa/Lubumbashi')::date
  group by metrics.device;
end;
$$;

create function public.record_traffic_event(p_event text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  metric_name text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role access is required'
      using errcode = '42501';
  end if;

  if p_event is null or p_event not in ('page_view', 'listing_view') then
    raise exception 'Unsupported traffic event'
      using errcode = '22023';
  end if;

  for metric_name in
    select unnest(
      case
        when p_event = 'listing_view' then array['page_views', 'listing_views']
        else array['page_views']
      end
    )
  loop
    insert into public.dashboard_daily_metrics as current_metrics (
      metric_date,
      metric_key,
      metric_value,
      source
    )
    values (
      (now() at time zone 'Africa/Lubumbashi')::date,
      metric_name,
      1,
      'site_tracker'
    )
    on conflict (metric_date, metric_key, source)
    do update set
      metric_value = current_metrics.metric_value + 1,
      updated_at = now();
  end loop;
end;
$$;

create function public.read_public_traffic_metrics(p_days integer)
returns table (
  metric_date date,
  sessions bigint,
  listing_views bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role access is required'
      using errcode = '42501';
  end if;

  if p_days is null or p_days not in (7, 30, 90) then
    raise exception 'Unsupported analytics period'
      using errcode = '22023';
  end if;

  return query
  with days as (
    select day_series.day_value::date as metric_date
    from generate_series(
      ((now() at time zone 'Africa/Lubumbashi')::date - (p_days - 1))::timestamp,
      ((now() at time zone 'Africa/Lubumbashi')::date)::timestamp,
      interval '1 day'
    ) as day_series(day_value)
  )
  select
    days.metric_date,
    coalesce(sum(metrics.metric_value) filter (where metrics.metric_key = 'sessions'), 0)::bigint,
    coalesce(sum(metrics.metric_value) filter (where metrics.metric_key = 'listing_views'), 0)::bigint
  from days
  left join public.dashboard_daily_metrics as metrics
    on metrics.metric_date = days.metric_date
    and metrics.metric_key in ('sessions', 'listing_views')
    and metrics.source = 'site_tracker'
  group by days.metric_date
  order by days.metric_date;
end;
$$;

revoke all on function public.record_device_session(public.device_category)
  from public, anon, authenticated;
revoke all on function public.read_public_device_metrics(integer)
  from public, anon, authenticated;
revoke all on function public.record_traffic_event(text)
  from public, anon, authenticated;
revoke all on function public.read_public_traffic_metrics(integer)
  from public, anon, authenticated;
grant execute on function public.record_device_session(public.device_category)
  to service_role;
grant execute on function public.read_public_device_metrics(integer)
  to service_role;
grant execute on function public.record_traffic_event(text)
  to service_role;
grant execute on function public.read_public_traffic_metrics(integer)
  to service_role;
