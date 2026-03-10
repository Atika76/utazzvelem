create table if not exists beallitasok (
  id bigint primary key,
  site_name text,
  company_name text,
  contact_email text,
  contact_phone text,
  city text,
  admin_email text,
  description text,
  created_at timestamptz default now()
);

insert into beallitasok (id, site_name, company_name, contact_email, contact_phone, city, admin_email, description)
values (1, 'Utazz Velünk', 'Utazz Velünk', 'info@utazzvelunk.hu', '+36 30 123 4567', 'Budapest', 'cegweb26@gmail.com', 'Gyors és biztonságos fuvarmegosztó felület utasoknak és sofőröknek.')
on conflict (id) do update set admin_email = excluded.admin_email;

create table if not exists fuvarok (
  id bigint generated always as identity primary key,
  user_id uuid,
  nev text,
  email text,
  telefon text,
  indulas text,
  erkezes text,
  datum date,
  ido text,
  helyek int8 default 0,
  szabad_helyek int8 default 0,
  osszes_hely int8 default 0,
  auto_helyek int8 default 0,
  auto_tipus text,
  ar int8 default 0,
  megjegyzes text,
  statusz text default 'Függőben',
  fizetesi_mod text,
  fizetesi_modok text[] default array['barion','cash']::text[],
  sofor_ertekeles numeric default 5,
  created_at timestamptz default now()
);

alter table fuvarok add column if not exists user_id uuid;
alter table fuvarok add column if not exists szabad_helyek int8 default 0;
alter table fuvarok add column if not exists osszes_hely int8 default 0;
alter table fuvarok add column if not exists auto_helyek int8 default 0;
alter table fuvarok add column if not exists auto_tipus text;
alter table fuvarok add column if not exists fizetesi_mod text;
alter table fuvarok add column if not exists fizetesi_modok text[] default array['barion','cash']::text[];
alter table fuvarok add column if not exists sofor_ertekeles numeric default 5;

update fuvarok set
  szabad_helyek = coalesce(szabad_helyek, helyek, 0),
  osszes_hely = coalesce(osszes_hely, auto_helyek, helyek, 0),
  auto_helyek = coalesce(auto_helyek, osszes_hely, helyek, 0)
where true;

create table if not exists foglalasok (
  id bigint generated always as identity primary key,
  trip_id bigint,
  fuvar_id bigint,
  user_id uuid,
  nev text,
  email text,
  telefon text,
  utas_email text,
  utas_nev text,
  foglalt_helyek int8 default 1,
  fizetesi_mod text default 'cash',
  fizetesi_allapot text default 'Függőben',
  foglalasi_allapot text default 'Függőben',
  megjegyzes text,
  statusz text default 'Függőben',
  created_at timestamptz default now()
);

alter table foglalasok add column if not exists trip_id bigint;
alter table foglalasok add column if not exists fuvar_id bigint;
alter table foglalasok add column if not exists user_id uuid;
alter table foglalasok add column if not exists nev text;
alter table foglalasok add column if not exists email text;
alter table foglalasok add column if not exists telefon text;
alter table foglalasok add column if not exists utas_email text;
alter table foglalasok add column if not exists utas_nev text;
alter table foglalasok add column if not exists fizetesi_mod text default 'cash';
alter table foglalasok add column if not exists fizetesi_allapot text default 'Függőben';
alter table foglalasok add column if not exists foglalasi_allapot text default 'Függőben';
alter table foglalasok add column if not exists megjegyzes text;

create index if not exists idx_fuvarok_search on fuvarok (indulas, erkezes, datum);
create index if not exists idx_foglalasok_trip on foglalasok (trip_id);

create or replace function csokkent_szabad_hely()
returns trigger as $$
begin
  update fuvarok
  set helyek = greatest(0, coalesce(szabad_helyek, helyek, 0) - coalesce(new.foglalt_helyek,1)),
      szabad_helyek = greatest(0, coalesce(szabad_helyek, helyek, 0) - coalesce(new.foglalt_helyek,1))
  where id = coalesce(new.trip_id, new.fuvar_id);
  return new;
end;
$$ language plpgsql;

drop trigger if exists foglalas_trigger on foglalasok;
create trigger foglalas_trigger
after insert on foglalasok
for each row
execute function csokkent_szabad_hely();

alter table fuvarok enable row level security;
alter table foglalasok enable row level security;
alter table beallitasok enable row level security;

drop policy if exists "Fuvarok public read" on fuvarok;
create policy "Fuvarok public read" on fuvarok for select using (true);

drop policy if exists "Fuvarok auth insert" on fuvarok;
create policy "Fuvarok auth insert" on fuvarok for insert to authenticated with check (true);

drop policy if exists "Fuvarok auth update" on fuvarok;
create policy "Fuvarok auth update" on fuvarok for update to authenticated using (true) with check (true);

drop policy if exists "Foglalasok auth all" on foglalasok;
create policy "Foglalasok auth all" on foglalasok for all to authenticated using (true) with check (true);

drop policy if exists "Beallitasok public read" on beallitasok;
create policy "Beallitasok public read" on beallitasok for select using (true);

drop policy if exists "Beallitasok auth update" on beallitasok;
create policy "Beallitasok auth update" on beallitasok for all to authenticated using (true) with check (true);
