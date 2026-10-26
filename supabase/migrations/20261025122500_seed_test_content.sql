create or replace view public.public_listings
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
  l.is_example,
  l.last_verified_at,
  l.source,
  l.partner_name,
  l.created_at,
  l.updated_at,
  pd.specialty as professional_specialty,
  pd.professional_order,
  pd.registration_number as professional_registration_number
from public.listings as l
join public.categories as c on c.id = l.category_id
join public.subcategories as s
  on s.category_id = l.category_id and s.id = l.subcategory_id
left join public.listing_professional_details as pd
  on pd.listing_id = l.id and pd.public_display_consent
where l.status = 'verified'
  and l.last_verified_at >= now() - interval '6 months';

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
  coalesce(keywords.items, '[]'::jsonb) as keywords,
  l.is_example
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

create or replace view public.public_events
with (security_invoker = true)
as
select
  id, slug, title, category, description, starts_at, ends_at, timezone,
  venue, address, commune, quartier, latitude, longitude, price_label,
  ticket_url, cover_image_path, organizer_name, created_at, is_example
from public.events
where status = 'published'
  and (ends_at is null or ends_at >= now());

grant select (is_example) on public.events to anon, authenticated;
grant select on public.public_events to anon, authenticated;

create or replace view public.public_jobs
with (security_invoker = true)
as
select
  id, slug, title, organization, description, requirements, location,
  commune, contract_type, salary_min, salary_max, salary_currency,
  application_url, source, source_url, published_at, expires_at, created_at,
  application_email, is_example
from public.jobs
where status = 'published'
  and (expires_at is null or expires_at > now());

grant select (is_example) on public.jobs to anon, authenticated;
grant select on public.public_jobs to anon, authenticated;

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

do $$
declare
  admin_id uuid;
  v_listing_id uuid;
  verified_at_value timestamptz;
  category_row record;
  event_row record;
begin
  select user_id
  into admin_id
  from public.user_roles
  where role = 'admin'
  order by user_id
  limit 1;

  if admin_id is null then
    raise exception 'Add at least one administrator in public.user_roles before seeding test content.';
  end if;

  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', admin_id,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object('role', 'admin')
    )::text,
    true
  );

  execute 'alter table public.listings disable trigger listings_record_audit';
  execute 'alter table public.listings disable trigger listings_activity_log';
  execute 'alter table public.events disable trigger events_activity_log';
  execute 'alter table public.jobs disable trigger jobs_activity_log';

  for category_row in
    select c.id as category_id, s.id as subcategory_id, s.name as subcategory_name
    from public.categories as c
    join public.subcategories as s on s.category_id = c.id
    order by c.sort_order, s.sort_order, s.name
  loop
    insert into public.listings (
      slug, name, category_id, subcategory_id, description, address, commune,
      quartier, status, is_example, source, source_details, owner_id, created_by
    )
    values (
      'test-annuaire-' || category_row.category_id || '-' || category_row.subcategory_id,
      'TEST — ' || category_row.subcategory_name,
      category_row.category_id,
      category_row.subcategory_id,
      'DONNÉE FICTIVE DE TEST. Cette fiche sert uniquement à vérifier l’annuaire et le dashboard. Aucun établissement réel n’est associé.',
      'Adresse fictive — ne pas utiliser pour se rendre sur place',
      'Lubumbashi',
      'TEST — emplacement fictif',
      'draft',
      true,
      'example',
      'Donnée générée pour tester le parcours de publication.',
      admin_id,
      admin_id
    )
    on conflict (slug) do nothing
    returning id into v_listing_id;

    if v_listing_id is null then
      select id into v_listing_id
      from public.listings
      where slug = 'test-annuaire-' || category_row.category_id || '-' || category_row.subcategory_id;
    end if;

    if not exists (
      select 1
      from public.listings
      where id = v_listing_id
        and is_example
        and source = 'example'
        and status = 'verified'
    ) then
      verified_at_value := now();
      insert into public.listing_verifications (
        listing_id, method, verified_by, verified_at, notes
      )
      values (
        v_listing_id, 'other', admin_id, verified_at_value,
        'Donnée de test fictive — vérification technique uniquement.'
      );

      update public.listings
      set status = 'verified',
          verified_by = admin_id,
          last_verified_at = verified_at_value
      where id = v_listing_id
        and is_example
        and source = 'example';
    end if;

    delete from public.listing_hours where listing_hours.listing_id = v_listing_id;
    insert into public.listing_hours (
      listing_id, day_of_week, opens_at, closes_at, is_closed
    )
    select
      v_listing_id,
      day,
      case when day = 0 then null else case when day = 6 then time '09:00' else time '08:00' end end,
      case when day = 0 then null else case when day = 6 then time '13:00' else time '17:00' end end,
      day = 0
    from generate_series(0, 6) as days(day);

    insert into public.listing_payments (listing_id, payment_method)
    values (v_listing_id, 'cash'), (v_listing_id, 'airtel_money')
    on conflict do nothing;

    insert into public.listing_languages (listing_id, language)
    values (v_listing_id, 'Français'), (v_listing_id, 'Swahili')
    on conflict do nothing;

    insert into public.listing_keywords (listing_id, keyword)
    values (v_listing_id, 'TEST'), (v_listing_id, 'donnée fictive')
    on conflict do nothing;
  end loop;

  for event_row in
    select *
    from (values
      ('culture', 'Culture', interval '7 days'),
      ('musique', 'Musique', interval '9 days'),
      ('marche', 'Marché', interval '11 days'),
      ('sport', 'Sport', interval '13 days')
    ) as test_events(slug_suffix, category, start_offset)
  loop
    insert into public.events (
      slug, title, category, description, starts_at, ends_at, timezone,
      venue, address, commune, quartier, price_label, organizer_name,
      organizer_id, created_by, source, source_details, status, is_example,
      published_at
    )
    values (
      'test-agenda-' || event_row.slug_suffix,
      'TEST — Événement de démonstration (' || event_row.category || ')',
      event_row.category,
      'ÉVÉNEMENT FICTIF DE TEST. Il n’aura pas lieu. Cette entrée sert uniquement à vérifier l’agenda et les outils de gestion.',
      now() + event_row.start_offset,
      now() + event_row.start_offset + interval '2 hours',
      'Africa/Lubumbashi',
      'Lieu fictif de test',
      'Adresse fictive — ne pas se déplacer',
      'Lubumbashi',
      'TEST — emplacement fictif',
      'TEST — sans réservation',
      'Lubumbashi Connect — données de test',
      admin_id,
      admin_id,
      'example',
      'Donnée générée pour tester le parcours de publication.',
      'published',
      true,
      now()
    )
    on conflict (slug) do nothing;
  end loop;

  insert into public.jobs (
    slug, title, organization, description, requirements, location, commune,
    contract_type, salary_min, salary_max, salary_currency, source, source_url,
    source_details, status, published_at, expires_at, employer_id, created_by,
    is_example
  )
  values (
    'test-emploi-demo',
    'TEST — Offre de démonstration',
    'Organisation fictive — Lubumbashi Connect',
    'OFFRE FICTIVE DE TEST. Ce poste n’existe pas et ne recrute personne.',
    'Aucune candidature réelle ne doit être envoyée. Test de l’affichage uniquement.',
    'Lieu fictif de test',
    'Lubumbashi',
    'Test uniquement',
    1,
    2,
    'USD',
    'example',
    null,
    'Donnée générée pour tester le parcours de publication.',
    'published',
    now(),
    now() + interval '30 days',
    admin_id,
    admin_id,
    true
  )
  on conflict (slug) do nothing;

  execute 'alter table public.listings enable trigger listings_record_audit';
  execute 'alter table public.listings enable trigger listings_activity_log';
  execute 'alter table public.events enable trigger events_activity_log';
  execute 'alter table public.jobs enable trigger jobs_activity_log';
end;
$$;

notify pgrst, 'reload schema';
