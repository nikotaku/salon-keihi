-- 個人の歩合：売上に「種類」を付け、スタッフ×種類ごとの歩合（％）で計算する
-- ・種類は店舗ごと（例：回数券・月額コース・初回体験・都度払い）
-- ・％は「種類の標準（salon_type_default_rates）」と「人ごと（salon_commission_rates）」。人ごとがあればそちらを使う
-- ・％はオーナーだけが見る・直す

create table if not exists public.salon_sales_types (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.salon_shops(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists salon_sales_types_shop_idx on public.salon_sales_types(shop_id);
alter table public.salon_sales_types enable row level security;

-- 種類の名前はその店舗を使える人が見られる（売上を入れるときに選ぶ）。作る・直す・消すのはオーナーだけ
create or replace function public.salon_is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.salon_members m where m.user_id = auth.uid() and m.role = 'owner')
$$;
revoke all on function public.salon_is_owner() from public, anon;
grant execute on function public.salon_is_owner() to authenticated;

drop policy if exists salon_sales_types_select on public.salon_sales_types;
create policy salon_sales_types_select on public.salon_sales_types for select to authenticated
  using (public.salon_can_access_shop(shop_id));
drop policy if exists salon_sales_types_owner on public.salon_sales_types;
create policy salon_sales_types_owner on public.salon_sales_types for all to authenticated
  using (public.salon_is_owner()) with check (public.salon_is_owner());

create table if not exists public.salon_type_default_rates (
  type_id uuid primary key references public.salon_sales_types(id) on delete cascade,
  rate numeric(5,2) not null check (rate between 0 and 100),
  updated_at timestamptz not null default now()
);
alter table public.salon_type_default_rates enable row level security;
drop policy if exists salon_type_default_rates_owner on public.salon_type_default_rates;
create policy salon_type_default_rates_owner on public.salon_type_default_rates for all to authenticated
  using (public.salon_is_owner()) with check (public.salon_is_owner());

create table if not exists public.salon_commission_rates (
  staff_id uuid not null references public.salon_staff(id) on delete cascade,
  type_id uuid not null references public.salon_sales_types(id) on delete cascade,
  rate numeric(5,2) not null check (rate between 0 and 100),
  updated_at timestamptz not null default now(),
  primary key (staff_id, type_id)
);
alter table public.salon_commission_rates enable row level security;
drop policy if exists salon_commission_rates_owner on public.salon_commission_rates;
create policy salon_commission_rates_owner on public.salon_commission_rates for all to authenticated
  using (public.salon_is_owner()) with check (public.salon_is_owner());

-- 売上に種類を付ける（任意）。種類を消しても売上は残す
alter table public.salon_sales_entries
  add column if not exists type_id uuid references public.salon_sales_types(id) on delete set null;
create index if not exists salon_sales_entries_type_idx on public.salon_sales_entries(type_id);

create or replace function public.salon_sales_entry_type_check() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.type_id is not null and not exists (
    select 1 from public.salon_sales_types t where t.id = new.type_id and t.shop_id = new.shop_id
  ) then
    raise exception 'TYPE_SHOP_MISMATCH' using hint = '種類は、その店舗の種類から選んでください';
  end if;
  return new;
end $$;

drop trigger if exists salon_sales_entry_type_check on public.salon_sales_entries;
create trigger salon_sales_entry_type_check
  before insert or update of type_id, shop_id on public.salon_sales_entries
  for each row execute function public.salon_sales_entry_type_check();
