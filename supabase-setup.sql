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

create index if not exists idx_fuvarok_approved_created_at
on public.fuvarok (approved, created_at desc);

create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(auth.email(), '')) = lower(coalesce((select admin_email from public.beallitasok order by id asc limit 1), ''));
$$;

grant execute on function public.is_admin_user() to anon, authenticated;

alter table if exists public.fuvarok enable row level security;

drop policy if exists "Fuvar beszúrás engedélyezése" on public.fuvarok;
drop policy if exists "Fuvar olvasás engedélyezése" on public.fuvarok;
drop policy if exists "Fuvar módosítás adminnak" on public.fuvarok;
drop policy if exists "Fuvar törlés engedélyezése" on public.fuvarok;

create policy "Fuvar beszúrás saját felhasználónak"
on public.fuvarok
for insert
to authenticated
with check (
  user_id = auth.uid() or user_id is null
);

create policy "Fuvar olvasás mindenkinek"
on public.fuvarok
for select
to anon, authenticated
using (true);

create policy "Fuvar módosítás adminnak vagy tulajnak"
on public.fuvarok
for update
to authenticated
using (
  public.is_admin_user() or user_id = auth.uid()
)
with check (
  public.is_admin_user() or user_id = auth.uid()
);

create policy "Fuvar törlés adminnak vagy tulajnak"
on public.fuvarok
for delete
to authenticated
using (
  public.is_admin_user() or user_id = auth.uid()
);

alter table if exists public.fuvarok add column if not exists sofor_ertekeles numeric default 4.9;
