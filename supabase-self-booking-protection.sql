alter table public.foglalasok enable row level security;

drop policy if exists "foglalas_insert" on public.foglalasok;
drop policy if exists "foglalasok_insert_no_self" on public.foglalasok;

create policy "foglalasok_insert_no_self"
on public.foglalasok
for insert
to authenticated
with check (
  auth.uid() is not null
  and user_id = auth.uid()
  and not exists (
    select 1
    from public.fuvarok f
    where f.id = foglalasok.fuvar_id
      and (
        (f.user_id is not null and f.user_id = auth.uid())
        or lower(coalesce(f.email, '')) = lower(coalesce(auth.email(), ''))
      )
  )
);
