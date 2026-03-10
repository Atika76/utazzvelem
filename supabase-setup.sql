-- Utazz Velem alap táblák és mezők

create table if not exists public.beallitasok (
  id bigint generated always as identity primary key,
  admin_email text,
  site_name text,
  company_name text,
  contact_email text,
  contact_phone text,
  city text,
  description text,
  created_at timestamptz default now()
);

alter table public.beallitasok
  add column if not exists admin_email text,
  add column if not exists site_name text,
  add column if not exists company_name text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists city text,
  add column if not exists description text;

insert into public.beallitasok (admin_email, site_name, company_name, contact_email, contact_phone, city, description)
select 'cegweb26@gmail.com', 'Utazz Velem', 'Utazz Velem', 'info@utazzvelem.hu', '+36 30 123 4567', 'Budapest', 'Gyors és biztonságos fuvarmegosztó'
where not exists (select 1 from public.beallitasok);

alter table public.fuvarok
  add column if not exists helyek int8 default 4,
  add column if not exists osszes_hely int8 default 4,
  add column if not exists auto_tipus text,
  add column if not exists fizetesi_modok text[] default array['cash'],
  add column if not exists statusz text default 'Függőben',
  add column if not exists sofor_ertekeles numeric(3,1) default 4.9;

create table if not exists public.foglalasok (
  id bigint generated always as identity primary key,
  trip_id bigint,
  user_id uuid,
  nev text,
  email text,
  telefon text,
  foglalt_helyek int8 default 1,
  fizetesi_mod text default 'cash',
  fizetesi_allapot text default 'Készpénz a helyszínen',
  foglalasi_allapot text default 'Jóváhagyva',
  megjegyzes text,
  created_at timestamptz default now()
);

create index if not exists idx_fuvarok_search on public.fuvarok (indulas, erkezes, datum);
create index if not exists idx_foglalasok_trip_id on public.foglalasok (trip_id);
