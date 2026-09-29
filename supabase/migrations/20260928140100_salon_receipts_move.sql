-- 経費の店舗を付け替えたとき、領収書の写真も新しい店舗のフォルダへ移す（storage の move は update 権限が要る）
create policy salon_receipts_update on storage.objects for update to authenticated
  using (bucket_id = 'salon-receipts' and public.salon_can_access_receipt(name))
  with check (bucket_id = 'salon-receipts' and public.salon_can_access_receipt(name));
