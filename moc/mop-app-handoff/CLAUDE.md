# CLAUDE.md — 部品進捗システム（仮称）

このリポジトリで作業するときの要点。詳細は `ONBOARDING.md` / `README.md`。

## これは何か
既存の小日程/実績/計画納期(CSV, CP932)から、部品の緊急度・優先度を算出・可視化するプロトタイプ（MVP）。全面TypeScript＋PostgreSQL＋React(Vite)。一方向フロー：`CSV → ETL＋算出(src/etl.ts,src/calc.ts) → PostgreSQL → REST API(src/server.ts) → フロント(frontend/)`。

## よく使うコマンド
- `docker compose up -d` … PostgreSQL起動（開発モード）
- `npm run setup` … スキーマ＋マスタ既定シード＋CSV取込・算出
- `npm run dev` … API＋静的配信 (:8787)
- `npm run web:dev` … フロントHMR (:5173, /api→:8787)
- `npm run etl` … 再取込・再算出
- `npm run selftest` … 算出ロジックの自己検証（DB不要）
- `npx tsc --noEmit` / `npx tsc -p frontend/tsconfig.json --noEmit` … 型チェック
- ワンコマンド全部：`docker compose --profile full up`

## 変更時の原則
- **API契約（`/api/*` とレスポンス形）は安定に保つ**。型の源は `src/types.ts`（フロントは `frontend/src/types.ts` が再エクスポート）。
- 算出の挙動は**マスタ駆動**（`src/masters.ts` ＋ `db/schema.sql`）。ロジック定数をコードに直書きせず `m_param` 等へ。
- 既定マスタ（`src/dbinit.ts`）は**現状挙動を再現**する値を保つ。
- 取込は洗い替え。アプリ固有テーブル（担当者/困りごと/メモ）は消さない。
- Windowsではnpm/node実行時にPATH再読込が必要な場合あり。CLIからAPIへ日本語をPOSTするとコンソール文字コードで化けることがある（サーバ/ブラウザは正常）。

## 品質ゲート（PR前に通す）
`npm run selftest` と 両方の `tsc --noEmit` が通ること。

## 未決論点
最終納期の採用元(DUE_SOURCE)、子部品欠品の判定粒度、認証(AD)、CSV一括取込UI。詳細は `ONBOARDING.md` §6。
