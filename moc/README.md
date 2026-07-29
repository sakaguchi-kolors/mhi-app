# moc/ — 参照専用プロトタイプ

このディレクトリは **MHI 進捗管理支援システムの初期プロトタイプ**（Express + 素の React）です。

## 本番コードとの関係

| 項目 | 本番 (`app/`) | 本番 (`moc/`) |
|------|---------------|---------------|
| バックエンド | NestJS + Prisma | Express + pg |
| フロント | Vite + React Query | Vite + useState |
| DB | PostgreSQL（Prisma migrate） | schema.sql 直実行 |
| デプロイ | Windows Server + IIS | Docker Compose（開発用） |

**新機能・修正は `app/` のみに行ってください。** `moc/` は設計の経緯確認・旧実装との diff 参照用です。

## ディレクトリ構成

```
moc/mop-app-handoff/
  src/          Express サーバー・ETL・calc
  frontend/     React UI（本番 frontend の原型）
  db/           初期スキーマ SQL
  sample-data/  CSV サンプル
```

## いつ参照するか

- ETL / calc の **元ロジック** を追うとき（本番は `app/backend/src/etl/` 等に移植済み）
- 設計仕様書の **未決論点**（DUE_SOURCE 等）のコメントを確認するとき
- プロトタイプ時代の API 仕様を比較するとき

## 起動（参考）

本番開発では不要です。どうしても起動する場合:

```bash
cd moc/mop-app-handoff
cp .env.example .env
docker compose up -d   # PostgreSQL
npm install && npm run dev
```

詳細は `moc/mop-app-handoff/README.md` を参照。

## 関連ドキュメント

- 本番オンボーディング: [`app/ONBOARDING.md`](../app/ONBOARDING.md)
- DUE_SOURCE 未決論点: [`doc/DUE_SOURCE.md`](../doc/DUE_SOURCE.md)
