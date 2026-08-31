# MHI 進捗管理支援システム

内製部品の進捗・緊急度を可視化する Web アプリケーション。

## ドキュメント

| | 内容 |
|---|---|
| [技術選定](doc/技術選定.md) | 採用技術・構成・選定理由 |
| [環境構築手順](app/README.md) | ローカル開発環境（Mac + Docker + Node.js） |
| [デプロイ手順（AWS 検証環境）](doc/開発検証デプロイ手順.md) | AWS Windows Server への検証デプロイ |
| [デプロイ手順（先方 Windows Server）](doc/WindowsServerデプロイ手順.md) | 本番サーバーへの初回デプロイ・アップデート（インターネットあり） |
| [オフライン構築手順](doc/オフライン構築手順.md) | 先方（外通信不可）向け。インストーラ同梱キット + Box |
| [先方アップデート手順（2026-08-31）](doc/先方アップデート手順_20260831.md) | 既存サーバーへの機能反映（自動取込・詳細ポップアップ等） |
| [フェーズ2 提案まとめ](doc/フェーズ2_提案まとめ.md) | リリース後に着手する追加機能の提案と実装状況（`develop`） |
| [フェーズ2 develop 実装まとめ](doc/フェーズ2_develop実装まとめ.md) | `develop` で追加した機能と今後の予定 |
| [工程ヒートマップ](doc/フェーズ2_工程ヒートマップ.md) | フェーズ2 で実装した工程混雑可視化の仕様 |
| [実績リードタイム](doc/フェーズ2_実績リードタイム.md) | フェーズ2 で実装した実績LT集計・Hs取込の仕様 |
| [スマホ対応](doc/フェーズ3_スマホ対応.md) | ブラウザのモバイル専用画面（`/m`）の仕様と第1弾／第2弾の範囲 |

---

## 構成

| ディレクトリ | 内容 |
|-------------|------|
| `app/` | **本番向けアプリ**（NestJS + React + Prisma）。開発・改修はここ |
| `doc/` | 設計書・デプロイ手順 |
| `moc/` | **参照専用**の旧プロトタイプ（Express + 生SQL）。`app/` へ移植済み。新規開発の対象外 |

> 新規参加者は [`app/ONBOARDING.md`](app/ONBOARDING.md) から読んでください。`moc/` の ONBOARDING は旧構成向けです。

---

## クイックスタート（ローカル開発）

```bash
cd app
cp .env.example .env
docker compose up -d
cd backend && cp ../.env .env && npm install && npm run prisma:deploy && npm run seed && npm run etl && npm run start
cd ../frontend && npm install && npm run dev
```

詳細は [環境構築手順（app/README.md）](app/README.md) を参照。

---

## クイックスタート（Windows Server デプロイ）

先方本番は **GitHub 非利用**かつ **インターネット不可**。ビルド用 Windows EC2 でオフラインキットを作り、Box で渡します。

```powershell
# ビルド用 Windows EC2
cd app\deploy
.\make-offline-kit.ps1
```

```powershell
# 先方 / 検証（初回・オフライン）
# ZIP を展開して
.\setup-offline.ps1
```

詳細は [オフライン構築手順](doc/オフライン構築手順.md) を参照。
