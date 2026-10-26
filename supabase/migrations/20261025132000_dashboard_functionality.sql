alter table public.dashboard_daily_metrics
  drop constraint dashboard_daily_metrics_metric_key_check;

alter table public.dashboard_daily_metrics
  add constraint dashboard_daily_metrics_metric_key_check
  check (metric_key in (
    'visitors',
    'sessions',
    'page_views',
    'listing_views',
    'job_views',
    'event_views',
    'contact_clicks',
    'applications',
    'average_session_seconds',
    'session_duration_seconds',
    'completed_sessions'
  ));

create function public.record_session_duration(p_duration_seconds integer)
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

  if p_duration_seconds is null or p_duration_seconds < 1 or p_duration_seconds > 86400 then
    raise exception 'Session duration must be between 1 and 86400 seconds'
      using errcode = '22023';
  end if;

  insert into public.dashboard_daily_metrics as current_metrics (
    metric_date, metric_key, metric_value, source
  )
  values (
    (now() at time zone 'Africa/Lubumbashi')::date,
    'session_duration_seconds',
    p_duration_seconds,
    'site_tracker'
  )
  on conflict (metric_date, metric_key, source)
  do update set
    metric_value = current_metrics.metric_value + excluded.metric_value,
    updated_at = now();

  insert into public.dashboard_daily_metrics as current_metrics (
    metric_date, metric_key, metric_value, source
  )
  values (
    (now() at time zone 'Africa/Lubumbashi')::date,
    'completed_sessions',
    1,
    'site_tracker'
  )
  on conflict (metric_date, metric_key, source)
  do update set
    metric_value = current_metrics.metric_value + excluded.metric_value,
    updated_at = now();
end;
$$;

drop function public.read_public_traffic_metrics(integer);

create function public.read_public_traffic_metrics(p_days integer)
returns table (
  metric_date date,
  sessions bigint,
  listing_views bigint,
  session_duration_seconds bigint,
  completed_sessions bigint
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
    coalesce(sum(metrics.metric_value) filter (where metrics.metric_key = 'listing_views'), 0)::bigint,
    coalesce(sum(metrics.metric_value) filter (where metrics.metric_key = 'session_duration_seconds'), 0)::bigint,
    coalesce(sum(metrics.metric_value) filter (where metrics.metric_key = 'completed_sessions'), 0)::bigint
  from days
  left join public.dashboard_daily_metrics as metrics
    on metrics.metric_date = days.metric_date
    and metrics.metric_key in (
      'sessions', 'listing_views', 'session_duration_seconds', 'completed_sessions'
    )
    and metrics.source = 'site_tracker'
  group by days.metric_date
  order by days.metric_date;
end;
$$;

create function public.admin_dashboard_activity(p_limit integer default 8)
returns table (
  activity_id bigint,
  action text,
  entity_type text,
  summary text,
  created_at timestamptz,
  actor_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_staff_role(array['admin'::public.staff_role]) then
    raise exception 'Administrator role required'
      using errcode = '42501';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception 'Activity limit must be between 1 and 50'
      using errcode = '22023';
  end if;

  return query
  select
    activity.id,
    activity.action,
    activity.entity_type,
    activity.summary,
    activity.created_at,
    coalesce(
      nullif(profile.full_name, ''),
      case when activity.actor_id is null then 'Système' else 'Membre de l’équipe' end
    )
  from public.admin_activity_log as activity
  left join public.profiles as profile on profile.id = activity.actor_id
  order by activity.created_at desc
  limit p_limit;
end;
$$;

revoke all on function public.record_session_duration(integer) from public, anon, authenticated;
grant execute on function public.record_session_duration(integer) to service_role;
revoke all on function public.admin_dashboard_activity(integer) from public, anon, authenticated;
grant execute on function public.admin_dashboard_activity(integer) to authenticated;
grant execute on function public.admin_dashboard_activity(integer) to service_role;
grant execute on function public.read_public_traffic_metrics(integer) to service_role;

notify pgrst, 'reload schema';
