# MHI 進捗管理支援システム

内製部品の進捗・緊急度を可視化する Web アプリケーション。

## 構成

| ディレクトリ | 内容 |
|-------------|------|
| `app/` | 本番向けアプリ（NestJS + React + Prisma） |
| `doc/` | 設計書・デプロイ手順 |
| `moc/` | 機能検証用プロトタイプ |

## 開発

```bash
cd app
cp .env.example .env
docker compose up -d
cd backend && npm install && npm run prisma:deploy && npm run seed && npm run etl && npm run start
cd ../frontend && npm install && npm run dev
```

詳細は [app/README.md](app/README.md) を参照。

## 検証環境デプロイ（AWS Windows Server）

[doc/開発検証デプロイ手順.md](doc/開発検証デプロイ手順.md) を参照。

```powershell
git clone https://github.com/sakaguchi-kolors/mhi-app.git C:\apps\mhi-app
cd C:\apps\mhi-app\app\deploy
.\setup-server.ps1
```
