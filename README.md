# サロン経費管理（salon-keihi）

美容サロン3店舗（ネイルサロン・国分町サロン（パーソナルネイル）・アイラッシュ／アイブロー）の経費を一元管理するサイト。
キャスカン（nikotaku/newkyasukan）の `apps/salon-keihi` から独立させたリポジトリ。Vercel は `salon-keihi-j6uh`（https://salon-keihi-j6uh.vercel.app）。

## できること

- ダッシュボード：月ごとの全店の利益・売上・経費（前月比）、店舗別の売上・経費・利益、直近6か月の経費推移（店舗別）、科目別の経費
- 経費：スマホから入力（店舗・金額・日付・科目・支払方法・支払先・メモ・領収書の写真）、月・店舗・区分で絞り込み、CSV出力
- 固定費：家賃などの毎月の支払いを登録し、ボタン1つでその月の経費に計上（同じ月に二重計上しない）
- 売上：日付と店舗を選んで1日ずつ入力（`salon_sales_entries`、入力日時も残る）。月の合計（`salon_monthly_sales`、利益の計算に使う）はDBのトリガーが自動で足し上げる。日付ごとの入力が無い月は、以前に直接入れた月合計のまま
- 設定：店舗名・科目の編集、メンバー管理（オーナー／スタッフ、スタッフは店舗を絞れる）

## データ

- 経費管理専用の Supabase プロジェクト `salon-keihi`（`rvkqbxahwlzcyburvjvw`）の `salon_*` テーブル。キャスカンとは別
- `salon_members` に登録された人だけが読み書きできる（RLS）
- 全店共通（本部）の経費は `shop_id = null`。店舗ごとの利益には入れず、全店の利益からだけ引く
- 領収書は非公開バケット `salon-receipts`（`店舗ID/年-月/…`、全店共通は `common/…`）
- ログインはメールアドレスだけ（届いたリンクを押す）。パスワードはない
- メンバーの招待は「設定 → メンバー」（オーナーのみ）。メールアドレスを入れると Edge Function `salon-invite-member` がアカウントを作って（なければ）ログインリンクをメールで送り、`salon_members` に登録する
- Supabase の Auth → URL Configuration：Site URL を `https://salon-keihi-j6uh.vercel.app`、Redirect URLs に `https://salon-keihi-j6uh.vercel.app/**`
- スタッフにメールを送るには Auth → SMTP に送信サービス（Resend など）が必要（標準のメールはプロジェクトのメンバー宛にしか届かない）

## 開発

```sh
npm install
npm run dev      # http://localhost:8081
npm run build    # 型チェック + ビルド
npm test         # 集計・日付・金額のテスト
```
