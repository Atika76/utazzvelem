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
