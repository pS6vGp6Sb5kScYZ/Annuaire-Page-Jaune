create temporary table demo_listing_ids on commit drop as
select id
from public.listings
where is_example = true;

delete from public.listings
where is_example = true;

delete from public.listing_audit_log as audit
using demo_listing_ids
where audit.listing_id = demo_listing_ids.id;
