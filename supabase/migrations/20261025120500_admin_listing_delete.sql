create or replace function public.prevent_example_listing_publication()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_example and new.source is distinct from 'example' and new.status = 'verified' then
    raise exception 'Les fiches de démonstration ne peuvent être publiées que si elles sont explicitement identifiées comme données de test.'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger listings_prevent_example_publication
before insert or update of status, is_example on public.listings
for each row execute function public.prevent_example_listing_publication();

create function public.admin_delete_listing(p_listing_id uuid)
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

  delete from public.listings
  where id = p_listing_id;

  if not found then
    raise exception 'Listing not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.admin_delete_listing(uuid) from public, anon;
grant execute on function public.admin_delete_listing(uuid) to authenticated;

notify pgrst, 'reload schema';
