-- 経費管理（apps/salon-keihi）：「アイラッシュ・アイブロー」を別々の店舗に分ける。
-- 既存の店舗はアイラッシュとして残し（登録済みの経費・固定費・売上はアイラッシュのまま）、アイブローを新しく作る。
update public.salon_shops
set name = 'アイラッシュ'
where name = 'アイラッシュ・アイブロー';

insert into public.salon_shops (name, sort_order)
select 'アイブロー', coalesce(max(sort_order), 0) + 1
from public.salon_shops
where not exists (select 1 from public.salon_shops where name = 'アイブロー');
