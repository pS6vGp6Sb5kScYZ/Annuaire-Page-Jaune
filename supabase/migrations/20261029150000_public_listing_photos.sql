create or replace view public.public_listing_photos
with (security_barrier = true)
as
select p.id, p.listing_id, p.storage_path, p.alt_text, p.sort_order, p.created_at
from public.listing_photos as p
join public.listings as l on l.id = p.listing_id
where l.is_example
  or (
    l.status = 'verified'
    and l.last_verified_at >= now() - interval '6 months'
  );

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
  l.is_example,
  l.source,
  photos.storage_path as cover_image_path
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
left join lateral (
  select p.storage_path
  from public.public_listing_photos as p
  where p.listing_id = l.id
  order by p.sort_order, p.created_at desc
  limit 1
) as photos on true
where l.status = 'verified'
  and l.last_verified_at >= now() - interval '6 months';

grant select on public.public_listing_photos to anon, authenticated;
grant select on public.public_listing_details to anon, authenticated;
