create type public.listing_status as enum (
  'draft',
  'pending',
  'verified',
  'suspended'
);

create type public.listing_source as enum (
  'example',
  'declared_by_owner',
  'field_collection',
  'openstreetmap',
  'official_registry',
  'partner'
);

create type public.verification_method as enum (
  'phone',
  'visit',
  'document',
  'other'
);

create table public.categories (
  id text primary key,
  name text not null unique,
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.subcategories (
  id text primary key,
  category_id text not null references public.categories (id) on delete restrict,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (category_id, id),
  unique (category_id, name)
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  category_id text not null,
  subcategory_id text not null,
  description text,
  address text,
  commune text,
  quartier text,
  latitude double precision,
  longitude double precision,
  phone text,
  whatsapp text,
  email text,
  website text,
  social_links jsonb not null default '{}'::jsonb,
  status public.listing_status not null default 'pending',
  is_example boolean not null default false,
  rccm_or_national_id text,
  source public.listing_source not null,
  source_details text,
  partner_name text,
  source_permission_reference text,
  owner_id uuid references auth.users (id) on delete set null,
  last_verified_at timestamptz,
  verified_by uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listings_category_subcategory_fk
    foreign key (category_id, subcategory_id)
    references public.subcategories (category_id, id)
    on delete restrict,
  constraint listings_latitude_range check (
    latitude is null or latitude between -90 and 90
  ),
  constraint listings_longitude_range check (
    longitude is null or longitude between -180 and 180
  ),
  constraint listings_social_links_object check (
    jsonb_typeof(social_links) = 'object'
  ),
  constraint listings_verified_metadata check (
    status <> 'verified' or (last_verified_at is not null and verified_by is not null)
  ),
  constraint listings_partner_source check (
    source <> 'partner' or partner_name is not null
  )
);

create table public.listing_hours (
  id bigint generated always as identity primary key,
  listing_id uuid not null references public.listings (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  opens_at time,
  closes_at time,
  is_closed boolean not null default false,
  check (
    (is_closed and opens_at is null and closes_at is null)
    or (not is_closed and opens_at is not null and closes_at is not null)
  )
);

create table public.listing_payments (
  listing_id uuid not null references public.listings (id) on delete cascade,
  payment_method text not null check (
    payment_method in ('cash', 'airtel_money', 'm_pesa', 'orange_money', 'card')
  ),
  primary key (listing_id, payment_method)
);

create table public.listing_languages (
  listing_id uuid not null references public.listings (id) on delete cascade,
  language text not null,
  primary key (listing_id, language)
);

create table public.listing_keywords (
  listing_id uuid not null references public.listings (id) on delete cascade,
  keyword text not null,
  primary key (listing_id, keyword)
);

create table public.listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  storage_path text not null unique,
  alt_text text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.listing_professional_details (
  listing_id uuid primary key references public.listings (id) on delete cascade,
  profession_type text not null check (profession_type in ('health', 'legal')),
  specialty text,
  professional_order text,
  registration_number text,
  public_display_consent boolean not null default false,
  consent_recorded_at timestamptz,
  updated_at timestamptz not null default now(),
  check (
    not public_display_consent or consent_recorded_at is not null
  )
);

create table public.listing_verifications (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  method public.verification_method not null,
  verified_by uuid not null references auth.users (id) on delete restrict,
  verified_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);

create table public.listing_audit_log (
  id bigint generated always as identity primary key,
  listing_id uuid not null,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed_at timestamptz not null default now()
);

create index listings_category_status_idx on public.listings (category_id, status);
create index listings_subcategory_status_idx on public.listings (subcategory_id, status);
create index listings_commune_status_idx on public.listings (commune, status);
create index listings_updated_at_idx on public.listings (updated_at desc);
create index listings_verification_due_idx
  on public.listings (last_verified_at)
  where status = 'verified';
create index listing_hours_listing_day_idx on public.listing_hours (listing_id, day_of_week);
create index listing_keywords_keyword_idx on public.listing_keywords (keyword);
create index listing_audit_log_listing_changed_idx
  on public.listing_audit_log (listing_id, changed_at desc);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger listings_set_updated_at
before update on public.listings
for each row execute function public.set_updated_at();

create trigger listing_professional_details_set_updated_at
before update on public.listing_professional_details
for each row execute function public.set_updated_at();

create function public.record_listing_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_row jsonb;
  new_row jsonb;
  target_listing_id uuid;
begin
  if tg_op <> 'INSERT' then
    old_row := to_jsonb(old);
  end if;
  if tg_op <> 'DELETE' then
    new_row := to_jsonb(new);
  end if;

  target_listing_id := coalesce(
    new_row ->> 'listing_id',
    old_row ->> 'listing_id',
    new_row ->> 'id',
    old_row ->> 'id'
  )::uuid;

  if tg_op = 'INSERT' then
    insert into public.listing_audit_log (listing_id, actor_id, action, new_data)
    values (target_listing_id, auth.uid(), tg_op, new_row);
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.listing_audit_log (
      listing_id,
      actor_id,
      action,
      old_data,
      new_data
    )
    values (target_listing_id, auth.uid(), tg_op, old_row, new_row);
    return new;
  else
    insert into public.listing_audit_log (listing_id, actor_id, action, old_data)
    values (target_listing_id, auth.uid(), tg_op, old_row);
    return old;
  end if;
end;
$$;

create trigger listings_record_audit
after insert or update or delete on public.listings
for each row execute function public.record_listing_audit();

create trigger listing_hours_record_audit
after insert or update or delete on public.listing_hours
for each row execute function public.record_listing_audit();

create trigger listing_payments_record_audit
after insert or update or delete on public.listing_payments
for each row execute function public.record_listing_audit();

create trigger listing_languages_record_audit
after insert or update or delete on public.listing_languages
for each row execute function public.record_listing_audit();

create trigger listing_keywords_record_audit
after insert or update or delete on public.listing_keywords
for each row execute function public.record_listing_audit();

create trigger listing_photos_record_audit
after insert or update or delete on public.listing_photos
for each row execute function public.record_listing_audit();

create trigger listing_professional_details_record_audit
after insert or update or delete on public.listing_professional_details
for each row execute function public.record_listing_audit();

create trigger listing_verifications_record_audit
after insert or update or delete on public.listing_verifications
for each row execute function public.record_listing_audit();

create function public.require_listing_verification_evidence()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'verified' and not exists (
    select 1
    from public.listing_verifications as v
    where v.listing_id = new.id
      and v.verified_by = new.verified_by
      and v.verified_at = new.last_verified_at
  ) then
    raise exception 'A verified listing must have a matching verification record';
  end if;
  return new;
end;
$$;

create trigger listings_require_verification_evidence
before insert or update of status, last_verified_at, verified_by on public.listings
for each row execute function public.require_listing_verification_evidence();

create function public.is_directory_staff()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in (
    'admin',
    'verifier',
    'field_agent'
  );
$$;

revoke all on function public.is_directory_staff() from public, anon;
grant execute on function public.is_directory_staff() to authenticated;

alter table public.categories enable row level security;
alter table public.subcategories enable row level security;
alter table public.listings enable row level security;
alter table public.listing_hours enable row level security;
alter table public.listing_payments enable row level security;
alter table public.listing_languages enable row level security;
alter table public.listing_keywords enable row level security;
alter table public.listing_photos enable row level security;
alter table public.listing_professional_details enable row level security;
alter table public.listing_verifications enable row level security;
alter table public.listing_audit_log enable row level security;

create policy "Categories are readable"
on public.categories for select
to anon, authenticated
using (true);

create policy "Subcategories are readable"
on public.subcategories for select
to anon, authenticated
using (true);

create policy "Staff manage categories"
on public.categories for all
to authenticated
using (public.is_directory_staff())
with check (public.is_directory_staff());

create policy "Staff manage subcategories"
on public.subcategories for all
to authenticated
using (public.is_directory_staff())
with check (public.is_directory_staff());

create policy "Staff manage listings"
on public.listings for all
to authenticated
using (public.is_directory_staff())
with check (public.is_directory_staff());

create policy "Staff manage listing hours"
on public.listing_hours for all
to authenticated
using (public.is_directory_staff())
with check (public.is_directory_staff());

create policy "Staff manage listing payments"
on public.listing_payments for all
to authenticated
using (public.is_directory_staff())
with check (public.is_directory_staff());

create policy "Staff manage listing languages"
on public.listing_languages for all
to authenticated
using (public.is_directory_staff())
with check (public.is_directory_staff());

create policy "Staff manage listing keywords"
on public.listing_keywords for all
to authenticated
using (public.is_directory_staff())
with check (public.is_directory_staff());

create policy "Staff manage listing photos"
on public.listing_photos for all
to authenticated
using (public.is_directory_staff())
with check (public.is_directory_staff());

create policy "Staff manage professional details"
on public.listing_professional_details for all
to authenticated
using (public.is_directory_staff())
with check (public.is_directory_staff());

create policy "Staff read listing verifications"
on public.listing_verifications for select
to authenticated
using (public.is_directory_staff());

create policy "Staff add listing verifications"
on public.listing_verifications for insert
to authenticated
with check (public.is_directory_staff());

create policy "Staff read listing audit log"
on public.listing_audit_log for select
to authenticated
using (public.is_directory_staff());

revoke all on public.categories, public.subcategories, public.listings,
  public.listing_hours, public.listing_payments, public.listing_languages,
  public.listing_keywords, public.listing_photos, public.listing_professional_details,
  public.listing_verifications, public.listing_audit_log
from anon, authenticated;

grant select on public.categories, public.subcategories to anon, authenticated;
grant insert, update, delete on public.categories, public.subcategories to authenticated;
grant select, insert, update, delete on public.listings, public.listing_hours,
  public.listing_payments, public.listing_languages, public.listing_keywords,
  public.listing_photos, public.listing_professional_details,
  public.listing_verifications to authenticated;
revoke update, delete on public.listing_verifications from authenticated;
grant select on public.listing_audit_log to authenticated;
revoke all on sequence public.listing_hours_id_seq,
  public.listing_audit_log_id_seq from anon, authenticated;
grant usage, select on sequence public.listing_hours_id_seq,
  public.listing_audit_log_id_seq to authenticated;

create view public.public_listings
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
where (
  l.status = 'verified'
  and l.last_verified_at >= now() - interval '6 months'
) or l.is_example;

grant select on public.public_listings to anon, authenticated;

insert into public.categories (id, name, sort_order) values
  ('commerces', 'Commerces et services', 1),
  ('restaurants', 'Restaurants et sorties', 2),
  ('sante', 'Santé', 3),
  ('droit', 'Juridique et administratif', 4),
  ('artisans', 'Artisans et métiers', 5),
  ('entreprises', 'Entreprises par secteur', 6),
  ('ecoles', 'Éducation', 7),
  ('associations', 'Associations et organisations communautaires', 8),
  ('hotels', 'Hôtels, logements et tourisme', 9),
  ('administrations', 'Administrations et services publics', 10),
  ('culture', 'Artistes et culture', 11),
  ('anciens-eleves', 'Étudiants et anciens élèves', 12);

insert into public.subcategories (id, category_id, name, sort_order) values
  ('alimentation', 'commerces', 'Alimentation', 1),
  ('mode', 'commerces', 'Mode', 2),
  ('electronique', 'commerces', 'Électronique', 3),
  ('quincaillerie', 'commerces', 'Quincaillerie', 4),
  ('coiffure-beaute', 'commerces', 'Salons de coiffure et beauté', 5),
  ('pressing', 'commerces', 'Pressing', 6),
  ('banques-transferts', 'commerces', 'Banques et agences de transfert', 7),
  ('stations-service', 'commerces', 'Stations-service', 8),
  ('supermarches', 'commerces', 'Supermarchés', 9),
  ('marches', 'commerces', 'Marchés', 10),
  ('restaurant', 'restaurants', 'Restaurants', 1),
  ('bar', 'restaurants', 'Bars', 2),
  ('cafe', 'restaurants', 'Cafés', 3),
  ('boite-de-nuit', 'restaurants', 'Boîtes de nuit', 4),
  ('traiteur', 'restaurants', 'Traiteurs', 5),
  ('medecine-generale', 'sante', 'Médecine générale', 1),
  ('cardiologie', 'sante', 'Cardiologie', 2),
  ('pediatrie', 'sante', 'Pédiatrie', 3),
  ('gynecologie', 'sante', 'Gynécologie', 4),
  ('dermatologie', 'sante', 'Dermatologie', 5),
  ('ophtalmologie', 'sante', 'Ophtalmologie', 6),
  ('neurologie', 'sante', 'Neurologie', 7),
  ('cliniques', 'sante', 'Cliniques', 8),
  ('hopitaux', 'sante', 'Hôpitaux', 9),
  ('centres-de-sante', 'sante', 'Centres de santé', 10),
  ('pharmacies', 'sante', 'Pharmacies', 11),
  ('pharmacies-de-garde', 'sante', 'Pharmacies de garde', 12),
  ('laboratoires', 'sante', 'Laboratoires', 13),
  ('dentistes', 'sante', 'Dentistes', 14),
  ('opticiens', 'sante', 'Opticiens', 15),
  ('avocats', 'droit', 'Avocats', 1),
  ('notaires', 'droit', 'Notaires', 2),
  ('huissiers', 'droit', 'Huissiers', 3),
  ('cabinets-comptables', 'droit', 'Cabinets comptables', 4),
  ('experts', 'droit', 'Experts', 5),
  ('agences-de-voyage', 'droit', 'Agences de voyage', 6),
  ('plombiers', 'artisans', 'Plombiers', 1),
  ('electriciens', 'artisans', 'Électriciens', 2),
  ('macons', 'artisans', 'Maçons', 3),
  ('menuisiers', 'artisans', 'Menuisiers', 4),
  ('mecaniciens', 'artisans', 'Mécaniciens', 5),
  ('couturiers', 'artisans', 'Couturiers', 6),
  ('soudeurs', 'artisans', 'Soudeurs', 7),
  ('peintres', 'artisans', 'Peintres', 8),
  ('informaticiens', 'artisans', 'Informaticiens', 9),
  ('demenageurs', 'artisans', 'Déménageurs', 10),
  ('mines', 'entreprises', 'Mines', 1),
  ('sous-traitance-miniere', 'entreprises', 'Sous-traitance minière', 2),
  ('transport-logistique', 'entreprises', 'Transport et logistique', 3),
  ('btp', 'entreprises', 'BTP', 4),
  ('agriculture', 'entreprises', 'Agriculture', 5),
  ('telecommunications', 'entreprises', 'Télécommunications', 6),
  ('energie', 'entreprises', 'Énergie', 7),
  ('commerce-de-gros', 'entreprises', 'Commerce de gros', 8),
  ('ong-institutions', 'entreprises', 'ONG et institutions', 9),
  ('ecoles', 'ecoles', 'Écoles', 1),
  ('instituts', 'ecoles', 'Instituts', 2),
  ('universites', 'ecoles', 'Universités', 3),
  ('centres-de-formation', 'ecoles', 'Centres de formation', 4),
  ('associations', 'associations', 'Associations', 1),
  ('ong', 'associations', 'ONG', 2),
  ('eglises', 'associations', 'Églises', 3),
  ('organisations-communautaires', 'associations', 'Organisations communautaires', 4),
  ('hotels', 'hotels', 'Hôtels', 1),
  ('logements', 'hotels', 'Logements', 2),
  ('restaurants-touristiques', 'hotels', 'Restaurants touristiques', 3),
  ('location', 'hotels', 'Agences de location', 4),
  ('mairie', 'administrations', 'Mairie', 1),
  ('communes', 'administrations', 'Communes', 2),
  ('police', 'administrations', 'Police', 3),
  ('etat-civil', 'administrations', 'État civil', 4),
  ('services-provinciaux', 'administrations', 'Services provinciaux', 5),
  ('musiciens', 'culture', 'Musiciens', 1),
  ('groupes', 'culture', 'Groupes', 2),
  ('danseurs', 'culture', 'Danseurs', 3),
  ('peintres-artistes', 'culture', 'Peintres', 4),
  ('photographes', 'culture', 'Photographes', 5),
  ('salles', 'culture', 'Salles', 6),
  ('galeries', 'culture', 'Galeries', 7),
  ('studios', 'culture', 'Studios', 8),
  ('etudiants', 'anciens-eleves', 'Étudiants majeurs', 1),
  ('anciens-eleves', 'anciens-eleves', 'Anciens élèves', 2),
  ('anciens-etudiants', 'anciens-eleves', 'Anciens étudiants', 3),
  ('promotions', 'anciens-eleves', 'Promotions', 4);
