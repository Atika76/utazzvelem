-- Jóváhagyott és fizetett foglalás törlésének tiltása a sofőrnek
-- Admin továbbra is törölhet

alter table public.foglalasok enable row level security;

drop policy if exists "foglalasok_owner_or_admin_delete" on public.foglalasok;
drop policy if exists "foglalasok_delete" on public.foglalasok;

create policy "foglalasok_owner_or_admin_delete"
on public.foglalasok
for delete
to authenticated
using (
  lower(coalesce(auth.email(), '')) = 'atika.76@windowslive.com'
  or not (
    lower(coalesce(foglalasi_allapot, '')) in ('jóváhagyva', 'jovahagyva')
    and lower(coalesce(fizetesi_allapot, '')) = 'fizetve'
  )
);
