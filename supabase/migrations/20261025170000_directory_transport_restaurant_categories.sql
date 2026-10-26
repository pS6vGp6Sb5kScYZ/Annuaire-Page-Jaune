insert into public.categories (id, name, sort_order)
values ('transport', 'Transport et mobilité', 13)
on conflict (id) do update
set name = excluded.name,
    sort_order = excluded.sort_order;

insert into public.subcategories (id, category_id, name, sort_order)
values
  ('restauration-rapide', 'restaurants', 'Restauration rapide', 6),
  ('cuisine-locale', 'restaurants', 'Cuisine locale', 7),
  ('boulangeries-patisseries', 'restaurants', 'Boulangeries et pâtisseries', 8),
  ('taxi-urbain', 'transport', 'Taxis urbains', 1),
  ('moto-taxi', 'transport', 'Moto-taxis', 2),
  ('transport-interurbain', 'transport', 'Transport interurbain', 3),
  ('location-vehicules', 'transport', 'Location de véhicules', 4),
  ('garages-automobiles', 'transport', 'Garages et réparation automobile', 5),
  ('arrets-bus', 'transport', 'Arrêts et stations de bus', 6),
  ('aeroports', 'transport', 'Aéroports', 7)
on conflict (id) do update
set category_id = excluded.category_id,
    name = excluded.name,
    sort_order = excluded.sort_order;
