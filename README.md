# MHI 進捗管理支援システム

内製部品の進捗・緊急度を可視化する Web アプリケーション。

## ドキュメント

| | 内容 |
|---|---|
| [技術選定](doc/技術選定.md) | 採用技術・構成・選定理由 |
| [環境構築手順](app/README.md) | ローカル開発環境（Mac + Docker + Node.js） |
| [デプロイ手順（AWS 検証環境）](doc/開発検証デプロイ手順.md) | AWS Windows Server への検証デプロイ |
| [デプロイ手順（先方 Windows Server）](doc/WindowsServerデプロイ手順.md) | 本番サーバーへの初回デプロイ・アップデート |
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

先方本番は **GitHub 非利用**。開発側で納品 ZIP を作成し、サーバーへ受け渡します。

```bash
# 開発 PC（Mac）で納品 ZIP 作成
cd app/deploy && ./make-release.sh
```

```powershell
# 先方サーバー（初回）
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
# 納品 ZIP を C:\apps\mhi-app\ に展開
cd C:\apps\mhi-app\app\deploy
.\setup-server.ps1
```

詳細は [デプロイ手順（先方 Windows Server）](doc/WindowsServerデプロイ手順.md) を参照。
