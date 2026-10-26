create or replace view public.admin_listings
with (security_barrier = true)
as
select listings.*
from public.listings
where public.has_staff_role(array['admin'::public.staff_role]);

revoke all on public.admin_listings from anon;
grant select on public.admin_listings to authenticated;
revoke insert, update, delete on public.admin_listings from authenticated;
