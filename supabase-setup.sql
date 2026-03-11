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

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='fuvarok' and policyname='Fuvar beszúrás engedélyezése'
  ) then
    create policy "Fuvar beszúrás engedélyezése"
    on public.fuvarok
    for insert
    to authenticated
    with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='fuvarok' and policyname='Fuvar olvasás engedélyezése'
  ) then
    create policy "Fuvar olvasás engedélyezése"
    on public.fuvarok
    for select
    to anon, authenticated
    using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='fuvarok' and policyname='Fuvar módosítás adminnak'
  ) then
    create policy "Fuvar módosítás adminnak"
    on public.fuvarok
    for update
    to authenticated
    using (true)
    with check (true);
  end if;
end $$;

alter table if exists public.fuvarok add column if not exists sofor_ertekeles numeric default 4.9;



do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='fuvarok' and policyname='Fuvar törlés engedélyezése'
  ) then
    create policy "Fuvar törlés engedélyezése"
    on public.fuvarok
    for delete
    to authenticated
    using (true);
  end if;
end $$;
