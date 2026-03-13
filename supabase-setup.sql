-- =====================================================
-- FUVARVELUNK - PROFILKÉP, AUTÓKÉPEK, JOGOSULTSÁGOK
-- =====================================================

update public.beallitasok
set
  site_name = 'FuvarVelünk',
  company_name = 'FuvarVelünk',
  contact_email = 'cegweb26@gmail.com',
  admin_email = 'cegweb26@gmail.com'
where id = 1;

alter table if exists public.fuvarok add column if not exists user_id uuid;
alter table if exists public.fuvarok add column if not exists approved boolean default false;
alter table if exists public.fuvarok add column if not exists created_at timestamptz default now();
alter table if exists public.fuvarok add column if not exists updated_at timestamptz default now();
alter table if exists public.fuvarok add column if not exists sofor_profilkep text;
alter table if exists public.fuvarok add column if not exists auto_kepek jsonb default '[]'::jsonb;
alter table if exists public.fuvarok add column if not exists sofor_ertekeles numeric default 4.9;

create index if not exists idx_fuvarok_approved_created_at
on public.fuvarok (approved, created_at desc);

create index if not exists idx_fuvarok_user_id
on public.fuvarok (user_id);

alter table if exists public.fuvarok enable row level security;

-- régi / túl laza policyk törlése

drop policy if exists "Fuvar beszúrás engedélyezése" on public.fuvarok;
drop policy if exists "Fuvar olvasás engedélyezése" on public.fuvarok;
drop policy if exists "Fuvar módosítás adminnak" on public.fuvarok;
drop policy if exists "Fuvar törlés engedélyezése" on public.fuvarok;
drop policy if exists "Fuvarok olvasása" on public.fuvarok;
drop policy if exists "Fuvar beszúrás" on public.fuvarok;
drop policy if exists "Fuvar módosítás" on public.fuvarok;
drop policy if exists "Fuvar törlés" on public.fuvarok;

create policy "Fuvarok olvasása"
on public.fuvarok
for select
using (
  statusz = 'Jóváhagyva'
  or auth.uid() = user_id
  or lower(coalesce(auth.email(), '')) = 'cegweb26@gmail.com'
);

create policy "Fuvar beszúrás"
on public.fuvarok
for insert
with check (
  auth.uid() = user_id
);

create policy "Fuvar módosítás"
on public.fuvarok
for update
using (
  auth.uid() = user_id
  or lower(coalesce(auth.email(), '')) = 'cegweb26@gmail.com'
)
with check (
  auth.uid() = user_id
  or lower(coalesce(auth.email(), '')) = 'cegweb26@gmail.com'
);

create policy "Fuvar törlés"
on public.fuvarok
for delete
using (
  auth.uid() = user_id
  or lower(coalesce(auth.email(), '')) = 'cegweb26@gmail.com'
);

-- =====================================================
-- E-MAIL NAPLÓ
-- =====================================================

create table if not exists public.email_naplo (
  id bigserial primary key,
  tipus text not null,
  cel_email text,
  statusz text not null default 'fuggoben',
  sikeres boolean default false,
  targy text,
  payload jsonb,
  created_at timestamptz default now()
);

alter table public.email_naplo enable row level security;
drop policy if exists "Email naplo olvasas" on public.email_naplo;
drop policy if exists "Email naplo iras" on public.email_naplo;
create policy "Email naplo olvasas" on public.email_naplo for select using (lower(coalesce(auth.email(), '')) = 'cegweb26@gmail.com');
create policy "Email naplo iras" on public.email_naplo for insert with check (auth.uid() is not null);
