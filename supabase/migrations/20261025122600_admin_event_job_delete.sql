create function public.admin_delete_event(p_event_id uuid)
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

  delete from public.events where id = p_event_id;
  if not found then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;
end;
$$;

create function public.admin_delete_job(p_job_id uuid)
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

  delete from public.jobs where id = p_job_id;
  if not found then
    raise exception 'Job not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.admin_delete_event(uuid) from public, anon;
revoke all on function public.admin_delete_job(uuid) from public, anon;
grant execute on function public.admin_delete_event(uuid) to authenticated;
grant execute on function public.admin_delete_job(uuid) to authenticated;

notify pgrst, 'reload schema';
