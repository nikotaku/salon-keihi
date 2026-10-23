-- サロン経費管理：店舗のスタッフ（施術者）ごとの売上を入れる
-- 店舗の売上（salon_sales_entries → salon_monthly_sales）とは別に入れる内訳。
-- 店舗の合計・利益・ダッシュボードには影響しない（個人の成績を見るためのもの）。

-- スタッフ一覧（アプリにログインしない人も登録できる。名前だけ）
create table if not exists public.salon_staff (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.salon_shops(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 50),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_salon_staff_shop on public.salon_staff (shop_id, sort_order);

alter table public.salon_staff enable row level security;
revoke all on public.salon_staff from anon;
grant select, insert, update, delete on public.salon_staff to authenticated;
-- 見るのはその店舗を見られる人、登録・変更はオーナーだけ
create policy salon_staff_select on public.salon_staff for select to authenticated
  using (public.salon_can_access_shop(shop_id));
create policy salon_staff_write on public.salon_staff for all to authenticated
  using (public.salon_role() = 'owner') with check (public.salon_role() = 'owner');

-- スタッフごとの日別売上
create table if not exists public.salon_staff_sales_entries (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.salon_shops(id) on delete cascade,
  staff_id uuid not null references public.salon_staff(id) on delete cascade,
  sales_date date not null,
  amount integer not null check (amount >= 0),
  customer_count integer check (customer_count >= 0),
  note text check (note is null or char_length(note) <= 500),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_salon_staff_sales_shop_date on public.salon_staff_sales_entries (shop_id, sales_date);
create index if not exists idx_salon_staff_sales_staff on public.salon_staff_sales_entries (staff_id, sales_date);

create trigger salon_staff_sales_entries_touch before update on public.salon_staff_sales_entries
  for each row execute function public.salon_touch_updated_at();

-- スタッフとその店舗が合っているか確認（別の店舗のスタッフで入れられないように）
create or replace function public.salon_staff_sales_check_shop()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.salon_staff s where s.id = new.staff_id and s.shop_id = new.shop_id) then
    raise exception 'このスタッフはこの店舗に登録されていません';
  end if;
  return new;
end
$$;

revoke all on function public.salon_staff_sales_check_shop() from public, anon, authenticated;

create trigger salon_staff_sales_entries_check_shop before insert or update on public.salon_staff_sales_entries
  for each row execute function public.salon_staff_sales_check_shop();

alter table public.salon_staff_sales_entries enable row level security;
revoke all on public.salon_staff_sales_entries from anon;
grant select, insert, update, delete on public.salon_staff_sales_entries to authenticated;
create policy salon_staff_sales_all on public.salon_staff_sales_entries for all to authenticated
  using (public.salon_can_access_shop(shop_id)) with check (public.salon_can_access_shop(shop_id));
