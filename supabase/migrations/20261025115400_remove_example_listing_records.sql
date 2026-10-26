do $$
declare
  example_listing_ids uuid[];
begin
  select coalesce(array_agg(id), '{}'::uuid[])
  into example_listing_ids
  from public.listings
  where is_example = true;

  if cardinality(example_listing_ids) = 0 then
    return;
  end if;

  delete from public.listings
  where id = any(example_listing_ids);

  delete from public.user_notifications
  where entity_type = 'listings'
    and entity_id = any(example_listing_ids);

  delete from public.admin_activity_log
  where entity_type = 'listings'
    and entity_id = any(example_listing_ids);

  delete from public.listing_audit_log
  where listing_id = any(example_listing_ids);
end;
$$;
