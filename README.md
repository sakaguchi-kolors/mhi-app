# MHI 進捗管理支援システム

内製部品の進捗・緊急度を可視化する Web アプリケーション。

## ドキュメント

| | 内容 |
|---|---|
| [技術選定](doc/技術選定.md) | 採用技術・構成・選定理由 |
| [環境構築手順](app/README.md) | ローカル開発環境（Mac + Docker + Node.js） |
| [デプロイ手順（AWS 検証環境）](doc/開発検証デプロイ手順.md) | AWS Windows Server への検証デプロイ |
| [デプロイ手順（先方 Windows Server）](doc/WindowsServerデプロイ手順.md) | 本番サーバーへの初回デプロイ・アップデート |

---

## 構成

| ディレクトリ | 内容 |
|-------------|------|
| `app/` | 本番向けアプリ（NestJS + React + Prisma） |
| `doc/` | 設計書・デプロイ手順 |
| `moc/` | 機能検証用プロトタイプ |

---

## クイックスタート（ローカル開発）

```bash
cd app
cp .env.example .env
docker compose up -d
cd backend && npm install && npm run prisma:deploy && npm run seed && npm run etl && npm run start
cd ../frontend && npm install && npm run dev
```

詳細は [環境構築手順（app/README.md）](app/README.md) を参照。

---

## クイックスタート（Windows Server デプロイ）

```powershell
git clone https://github.com/sakaguchi-kolors/mhi-app.git C:\apps\mhi-app
cd C:\apps\mhi-app\app\deploy
.\setup-server.ps1
```

詳細は [デプロイ手順（先方 Windows Server）](doc/WindowsServerデプロイ手順.md) を参照。
