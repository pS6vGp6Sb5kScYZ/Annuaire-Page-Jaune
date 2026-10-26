create function public.notify_admins_of_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  notification_title text;
  notification_body text;
  notification_type text;
begin
  if new.action = 'ERROR' then
    notification_title := 'Erreur détectée';
    notification_type := 'system_error';
    notification_body := left(
      coalesce(nullif(new.summary, ''), 'Une erreur est survenue dans l’application.'),
      2000
    );
  else
    notification_title := case
      when new.action = 'INSERT' then 'Nouvelle activité'
      when new.action = 'UPDATE' then 'Modification effectuée'
      when new.action = 'DELETE' then 'Suppression effectuée'
      else 'Activité administrateur'
    end;
    notification_type := 'admin_activity';
    notification_body := concat_ws(
      ' · ',
      case new.entity_type
        when 'listings' then 'Fiche annuaire'
        when 'events' then 'Événement'
        when 'jobs' then 'Offre d’emploi'
        when 'job_applications' then 'Candidature'
        when 'user_roles' then 'Rôle utilisateur'
        when 'profiles' then 'Profil utilisateur'
        when 'saved_listings' then 'Favori'
        when 'editorial_tasks' then 'Tâche éditoriale'
        when 'editorial_calendar' then 'Calendrier éditorial'
        when 'listing_reviews' then 'Avis'
        else replace(new.entity_type, '_', ' ')
      end,
      nullif(left(new.summary, 180), '')
    );
  end if;

  insert into public.user_notifications (
    recipient_id, title, body, notification_type, entity_type, entity_id
  )
  select
    roles.user_id,
    notification_title,
    notification_body,
    notification_type,
    new.entity_type,
    new.entity_id
  from public.user_roles as roles
  where roles.role = 'admin';

  return new;
end;
$$;

create trigger admin_activity_create_notifications
after insert on public.admin_activity_log
for each row execute function public.notify_admins_of_activity();

create or replace function public.record_admin_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb;
  row_id uuid;
  action_name text;
  display_name text;
begin
  if tg_op = 'DELETE' then
    row_data := to_jsonb(old);
    action_name := 'DELETE';
  else
    row_data := to_jsonb(new);
    action_name := tg_op;
  end if;

  row_id := coalesce(
    nullif(row_data ->> 'id', ''),
    nullif(row_data ->> 'listing_id', ''),
    nullif(row_data ->> 'user_id', '')
  )::uuid;
  display_name := left(
    coalesce(row_data ->> 'title', row_data ->> 'name', row_data ->> 'full_name', ''),
    180
  );

  if tg_table_name = 'saved_listings' and display_name = '' then
    display_name := 'Favori';
  end if;

  insert into public.admin_activity_log (
    actor_id, action, entity_type, entity_id, summary
  )
  values (
    auth.uid(), action_name, tg_table_name, row_id, display_name
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger listings_activity_log
after insert or update or delete on public.listings
for each row execute function public.record_admin_activity();

create trigger job_applications_activity_log
after insert or update or delete on public.job_applications
for each row execute function public.record_admin_activity();

create trigger user_roles_activity_log
after insert or update or delete on public.user_roles
for each row execute function public.record_admin_activity();

create trigger profiles_activity_log
after insert or update or delete on public.profiles
for each row execute function public.record_admin_activity();

create trigger saved_listings_activity_log
after insert or delete on public.saved_listings
for each row execute function public.record_admin_activity();
