do $$
declare
  example_listing_ids uuid[];
  example_event_ids uuid[];
  example_job_ids uuid[];
  example_application_ids uuid[];
  example_review_ids uuid[];
begin
  select coalesce(array_agg(id), '{}'::uuid[])
  into example_listing_ids
  from public.listings
  where is_example;

  select coalesce(array_agg(id), '{}'::uuid[])
  into example_event_ids
  from public.events
  where is_example;

  select coalesce(array_agg(id), '{}'::uuid[])
  into example_job_ids
  from public.jobs
  where is_example;

  select coalesce(array_agg(id), '{}'::uuid[])
  into example_application_ids
  from public.job_applications
  where job_id = any(example_job_ids);

  select coalesce(array_agg(id), '{}'::uuid[])
  into example_review_ids
  from public.listing_reviews
  where listing_id = any(example_listing_ids);

  delete from public.listings
  where id = any(example_listing_ids);

  delete from public.events
  where id = any(example_event_ids);

  delete from public.jobs
  where id = any(example_job_ids);

  delete from public.user_notifications
  where (entity_type = 'listings' and entity_id = any(example_listing_ids))
    or (entity_type = 'events' and entity_id = any(example_event_ids))
    or (entity_type = 'jobs' and entity_id = any(example_job_ids))
    or (entity_type = 'job_applications' and entity_id = any(example_application_ids))
    or (entity_type = 'listing_reviews' and entity_id = any(example_review_ids))
    or (entity_type = 'saved_listings' and entity_id = any(example_listing_ids));

  delete from public.admin_activity_log
  where (entity_type = 'listings' and entity_id = any(example_listing_ids))
    or (entity_type = 'events' and entity_id = any(example_event_ids))
    or (entity_type = 'jobs' and entity_id = any(example_job_ids))
    or (entity_type = 'job_applications' and entity_id = any(example_application_ids))
    or (entity_type = 'listing_reviews' and entity_id = any(example_review_ids))
    or (entity_type = 'saved_listings' and entity_id = any(example_listing_ids));

  delete from public.listing_audit_log
  where listing_id = any(example_listing_ids);
end;
$$;
