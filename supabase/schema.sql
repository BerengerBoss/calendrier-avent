-- =====================================================================
--  Calendrier de l'Avent Deloitte Transfo & Change — schéma Supabase
--  À exécuter UNE fois dans Supabase > SQL Editor (ré-exécutable sans casse).
-- =====================================================================

-- ---------------------------------------------------------------------
--  Fonctions utilitaires
-- ---------------------------------------------------------------------

-- Date du jour à Paris : c'est le SERVEUR qui fait foi (impossible de tricher
-- en changeant l'horloge de son PC).
create or replace function public.paris_today()
returns date
language sql
stable
as $$ select (now() at time zone 'Europe/Paris')::date $$;

create or replace function public.get_server_today()
returns date
language sql
stable
as $$ select public.paris_today() $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------
--  Administrateurs
-- ---------------------------------------------------------------------
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select exists (select 1 from public.admins where user_id = auth.uid()) $$;

-- ---------------------------------------------------------------------
--  Réglages globaux (1 seule ligne)
-- ---------------------------------------------------------------------
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  title text not null default 'Le Calendrier de l’Avent de l’IA 🎄🤖',
  subtitle text not null default 'Chaque jour ouvré, grattez une case pour découvrir une astuce concrète, un usage Copilot ou une ressource utile en mission.',
  start_date date not null default '2026-12-01',
  end_date date not null default '2026-12-24',
  updated_at timestamptz not null default now(),
  constraint settings_range check (
    end_date >= start_date
    and date_trunc('month', start_date) = date_trunc('month', end_date)
  )
);

insert into public.settings (id) values (1) on conflict (id) do nothing;

drop trigger if exists settings_updated_at on public.settings;
create trigger settings_updated_at before update on public.settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
--  Cases du calendrier (uniquement du lundi au vendredi)
-- ---------------------------------------------------------------------
create table if not exists public.cards (
  publish_date date primary key
    check (extract(isodow from publish_date) between 1 and 5),
  status text not null default 'draft' check (status in ('draft', 'published')),
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists cards_updated_at on public.cards;
create trigger cards_updated_at before update on public.cards
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
--  Participants & événements
-- ---------------------------------------------------------------------
create table if not exists public.visitors (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  name_key text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  visit_count int not null default 1
);

create table if not exists public.events (
  id bigint generated always as identity primary key,
  visitor_id uuid not null references public.visitors (id) on delete cascade,
  type text not null check (type in ('visit', 'open', 'copilot', 'copy', 'resource')),
  card_date date,
  created_at timestamptz not null default now()
);

create unique index if not exists events_one_open_per_card
  on public.events (visitor_id, card_date) where type = 'open';
create index if not exists events_created_at_idx on public.events (created_at);
create index if not exists events_card_date_idx on public.events (card_date);
create index if not exists events_visitor_idx on public.events (visitor_id);

-- ---------------------------------------------------------------------
--  Row Level Security
-- ---------------------------------------------------------------------
alter table public.admins   enable row level security;
alter table public.settings enable row level security;
alter table public.cards    enable row level security;
alter table public.visitors enable row level security;
alter table public.events   enable row level security;

drop policy if exists admins_self_read on public.admins;
create policy admins_self_read on public.admins
  for select to authenticated using (user_id = auth.uid());

drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings
  for select to anon, authenticated using (true);

drop policy if exists settings_admin_update on public.settings;
create policy settings_admin_update on public.settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Le public ne voit QUE les cases publiées dont la date est atteinte (date serveur).
drop policy if exists cards_read on public.cards;
create policy cards_read on public.cards
  for select to anon, authenticated
  using (public.is_admin() or (status = 'published' and publish_date <= public.paris_today()));

drop policy if exists cards_admin_insert on public.cards;
create policy cards_admin_insert on public.cards
  for insert to authenticated with check (public.is_admin());

drop policy if exists cards_admin_update on public.cards;
create policy cards_admin_update on public.cards
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists cards_admin_delete on public.cards;
create policy cards_admin_delete on public.cards
  for delete to authenticated using (public.is_admin());

drop policy if exists visitors_admin_read on public.visitors;
create policy visitors_admin_read on public.visitors
  for select to authenticated using (public.is_admin());

drop policy if exists visitors_admin_delete on public.visitors;
create policy visitors_admin_delete on public.visitors
  for delete to authenticated using (public.is_admin());

drop policy if exists events_admin_read on public.events;
create policy events_admin_read on public.events
  for select to authenticated using (public.is_admin());

drop policy if exists events_admin_delete on public.events;
create policy events_admin_delete on public.events
  for delete to authenticated using (public.is_admin());

-- Droits de table (le RLS ci-dessus filtre ensuite ligne par ligne)
grant usage on schema public to anon, authenticated;
revoke all on public.admins, public.settings, public.cards, public.visitors, public.events from anon, authenticated;
grant select on public.settings, public.cards to anon, authenticated;
grant update on public.settings to authenticated;
grant insert, update, delete on public.cards to authenticated;
grant select, delete on public.visitors, public.events to authenticated;
grant select on public.admins to authenticated;

-- ---------------------------------------------------------------------
--  RPC publiques (participants) — SECURITY DEFINER, entrées contrôlées
-- ---------------------------------------------------------------------

-- Inscription (ou reconnexion si le même prénom + nom existe déjà)
create or replace function public.register_visitor(p_first_name text, p_last_name text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_first text := left(btrim(regexp_replace(coalesce(p_first_name, ''), '\s+', ' ', 'g')), 60);
  v_last  text := left(btrim(regexp_replace(coalesce(p_last_name,  ''), '\s+', ' ', 'g')), 60);
  v_id uuid;
begin
  if char_length(v_first) < 1 or char_length(v_last) < 1 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  insert into visitors (first_name, last_name, name_key)
  values (v_first, v_last, lower(v_first || '|' || v_last))
  on conflict (name_key) do update
    set last_seen_at = now(),
        visit_count = visitors.visit_count + 1
  returning id into v_id;

  insert into events (visitor_id, type) values (v_id, 'visit');
  return v_id;
end $$;

-- Vérifie qu'un participant existe (et compte une visite si p_new_visit)
create or replace function public.visitor_session(p_visitor_id uuid, p_new_visit boolean)
returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_row visitors%rowtype;
begin
  if p_new_visit then
    update visitors
       set last_seen_at = now(), visit_count = visit_count + 1
     where id = p_visitor_id
     returning * into v_row;
    if found then
      insert into events (visitor_id, type) values (p_visitor_id, 'visit');
    end if;
  else
    update visitors set last_seen_at = now() where id = p_visitor_id returning * into v_row;
  end if;

  if v_row.id is null then
    return null;
  end if;
  return json_build_object('first_name', v_row.first_name, 'last_name', v_row.last_name);
end $$;

-- Enregistre l'ouverture d'une case (1 seule fois par personne et par case)
create or replace function public.record_open(p_visitor_id uuid, p_card_date date)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from visitors where id = p_visitor_id) then
    return false;
  end if;
  if not exists (
    select 1 from cards
     where publish_date = p_card_date
       and status = 'published'
       and publish_date <= paris_today()
  ) then
    return false;
  end if;

  insert into events (visitor_id, type, card_date)
  values (p_visitor_id, 'open', p_card_date)
  on conflict (visitor_id, card_date) where type = 'open' do nothing;

  update visitors set last_seen_at = now() where id = p_visitor_id;
  return true;
end $$;

-- Clics secondaires (copie du prompt, lancement Copilot, ressource)
create or replace function public.record_event(p_visitor_id uuid, p_type text, p_card_date date)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if p_type not in ('copilot', 'copy', 'resource') then
    return false;
  end if;
  if not exists (select 1 from visitors where id = p_visitor_id) then
    return false;
  end if;
  if not exists (
    select 1 from cards
     where publish_date = p_card_date
       and status = 'published'
       and publish_date <= paris_today()
  ) then
    return false;
  end if;

  insert into events (visitor_id, type, card_date) values (p_visitor_id, p_type, p_card_date);
  return true;
end $$;

-- Cases déjà ouvertes par le participant
create or replace function public.get_my_opens(p_visitor_id uuid)
returns date[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(card_date order by card_date), '{}'::date[])
    from events
   where visitor_id = p_visitor_id and type = 'open'
$$;

-- ---------------------------------------------------------------------
--  RPC admin
-- ---------------------------------------------------------------------
create or replace function public.admin_dashboard()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result json;
begin
  if not is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select json_build_object(
    'today', paris_today(),
    'visitors', coalesce((
      select json_agg(v order by v.last_seen_at desc)
      from (
        select vi.id,
               vi.first_name,
               vi.last_name,
               vi.created_at,
               vi.last_seen_at,
               vi.visit_count,
               coalesce((select json_agg(e.card_date order by e.card_date)
                           from events e where e.visitor_id = vi.id and e.type = 'open'), '[]'::json) as opened_dates,
               (select max(e.created_at) from events e where e.visitor_id = vi.id and e.type = 'open') as last_open_at,
               (select count(*) from events e where e.visitor_id = vi.id and e.type in ('copilot', 'copy')) as copilot_count,
               (select count(*) from events e where e.visitor_id = vi.id and e.type = 'resource') as resource_count
          from visitors vi
      ) v
    ), '[]'::json),
    'cards', coalesce((
      select json_agg(c order by c.card_date)
      from (
        select card_date,
               count(*) filter (where type = 'open') as opens,
               count(*) filter (where type in ('copilot', 'copy')) as copilot,
               count(*) filter (where type = 'resource') as resources
          from events
         where card_date is not null
         group by card_date
      ) c
    ), '[]'::json),
    'daily', coalesce((
      select json_agg(d order by d.day)
      from (
        select (created_at at time zone 'Europe/Paris')::date as day,
               count(*) filter (where type = 'visit') as visits,
               count(*) filter (where type = 'open') as opens,
               count(distinct visitor_id) as active_visitors
          from events
         group by 1
      ) d
    ), '[]'::json),
    'new_visitors', coalesce((
      select json_agg(n order by n.day)
      from (
        select (created_at at time zone 'Europe/Paris')::date as day, count(*) as count
          from visitors
         group by 1
      ) n
    ), '[]'::json),
    'hours', coalesce((
      select json_agg(h order by h.hour)
      from (
        select extract(hour from (created_at at time zone 'Europe/Paris'))::int as hour,
               count(*) as opens
          from events
         where type = 'open'
         group by 1
      ) h
    ), '[]'::json)
  ) into result;

  return result;
end $$;

-- Remise à zéro des statistiques (ex : après la phase de test)
create or replace function public.admin_reset_stats()
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from events where true;
  delete from visitors where true;
end $$;

-- Droits d'exécution
revoke all on function public.register_visitor(text, text)      from public;
revoke all on function public.visitor_session(uuid, boolean)    from public;
revoke all on function public.record_open(uuid, date)           from public;
revoke all on function public.record_event(uuid, text, date)    from public;
revoke all on function public.get_my_opens(uuid)                from public;
revoke all on function public.admin_dashboard()                 from public;
revoke all on function public.admin_reset_stats()               from public;

grant execute on function public.get_server_today()               to anon, authenticated;
grant execute on function public.paris_today()                    to anon, authenticated;
grant execute on function public.is_admin()                       to anon, authenticated;
grant execute on function public.register_visitor(text, text)     to anon, authenticated;
grant execute on function public.visitor_session(uuid, boolean)   to anon, authenticated;
grant execute on function public.record_open(uuid, date)          to anon, authenticated;
grant execute on function public.record_event(uuid, text, date)   to anon, authenticated;
grant execute on function public.get_my_opens(uuid)               to anon, authenticated;
grant execute on function public.admin_dashboard()                to authenticated;
grant execute on function public.admin_reset_stats()              to authenticated;

-- ---------------------------------------------------------------------
--  APRÈS avoir créé votre compte admin (Authentication > Users > Add user),
--  exécutez (en remplaçant l'email) :
--
--  insert into public.admins (user_id)
--  select id from auth.users where email = 'votre.email@exemple.com'
--  on conflict do nothing;
-- ---------------------------------------------------------------------
