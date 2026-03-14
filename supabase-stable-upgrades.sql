-- FuvarVelunk stabil kiegészítések
-- 1) Sofőr átlagértékelés nézet
create or replace view public.sofor_atlag_ertekeles as
select
  lower(coalesce(f.email, '')) as sofor_email,
  round(avg(e.csillag)::numeric, 2) as atlag,
  count(*)::int as darab
from public.ertekelesek e
join public.fuvarok f on f.id = e.fuvar_id
where lower(coalesce(e.tipus, '')) = 'sofor'
group by lower(coalesce(f.email, ''));

-- 2) Lejárt fuvarok egyszeri takarítása (kézzel futtatható)
-- Figyelem: ez törli a tegnapnál régebbi, már lezajlott fuvarokat.
delete from public.fuvarok
where (datum::date + coalesce(nullif(ido,''), '23:59')::time) < (now() - interval '1 day');
