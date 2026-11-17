-- 日付ごとの売上に「担当（だれの売上か）」を付けられるようにする。任意。
-- スタッフを消しても売上は残す（担当は空になる）。
alter table public.salon_sales_entries
  add column if not exists staff_id uuid references public.salon_staff(id) on delete set null;

create index if not exists salon_sales_entries_staff_idx on public.salon_sales_entries(staff_id);

-- 担当は、その売上と同じ店舗のスタッフだけにする
create or replace function public.salon_sales_entry_staff_check() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.staff_id is not null and not exists (
    select 1 from public.salon_staff s where s.id = new.staff_id and s.shop_id = new.shop_id
  ) then
    raise exception 'STAFF_SHOP_MISMATCH' using hint = '担当は、その店舗のスタッフから選んでください';
  end if;
  return new;
end $$;

drop trigger if exists salon_sales_entry_staff_check on public.salon_sales_entries;
create trigger salon_sales_entry_staff_check
  before insert or update of staff_id, shop_id on public.salon_sales_entries
  for each row execute function public.salon_sales_entry_staff_check();
