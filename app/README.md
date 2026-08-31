# MHI 進捗管理支援システム（部品進捗）

内製部品の小日程／実績(OCTPuS)／計画納期(PBS)／SHOPマスタの各CSVから、**部品の緊急度・優先度を算出して可視化**する進捗管理支援システムです。

- **スタック**（技術選定書準拠）: **React + TypeScript(Vite)** / **NestJS(Node + TS)** / **Prisma** / **PostgreSQL**
- **データフロー**（一方向）: `CSV(CP932/UTF-8) → ETL＋算出バッチ → PostgreSQL → REST API → フロント`
- 本番は Windows Server（IIS でフロント配信 ＋ NestJS を Windows Service 常駐 ＋ PostgreSQL）。

> 本リポジトリは `moc/` のプロトタイプ（Express + 生SQL）を、技術選定書の目標構成（**NestJS + Prisma**）へ移植したものです。算出ロジック・API契約・マスタ駆動の設計は踏襲しています。

---

## 関連ドキュメント

| | 内容 |
|---|---|
| [技術選定](../doc/技術選定.md) | 採用技術・構成・選定理由 |
| [デプロイ手順（AWS 検証）](../doc/開発検証デプロイ手順.md) | 検証環境へのデプロイ |
| [デプロイ手順（先方 Windows Server）](../doc/WindowsServerデプロイ手順.md) | 本番デプロイ・アップデート |
| [オフライン構築手順](../doc/オフライン構築手順.md) | 先方（外通信不可）向けキット |
| [リポジトリ README](../README.md) | ドキュメント一覧 |
| [開発者オンボーディング](ONBOARDING.md) | アーキテクチャ・用語集・変更原則 |

---

## 構成

```
app/
  docker-compose.yml     PostgreSQL(本番同一エンジン: PG18)
  .env.example           設定サンプル
  sample-data/           同梱サンプルCSV（CSV_DIR の既定）
  backend/               ── NestJS + Prisma ──
    prisma/schema.prisma   全20テーブル定義（取込①/算出②/アプリ固有③/マスタ/監査）
    src/
      main.ts app.module.ts
      config/  設定(app-config)・.envローダ
      prisma/  PrismaService
      calc/    算出ロジック（設計仕様書2章。マスタ駆動）
      etl/     csv取込・ETL(runEtl/recompute)・ingest
      masters/ マスタ定義・既定シード・汎用CRUD
      parts/ owners/ assign/ audit/ meta/ batch/  各API
      scripts/ seed.ts / etl.cli.ts / selftest.ts
  frontend/              ── React + TS (Vite) ──
    src/  App.tsx / api.ts / components/（一覧・詳細・マスタ・取込・担当者）
```

## 前提

- **Node.js 20+**（`nvm install 20 && nvm use 20`）
- **Docker Desktop**（ローカルDB用）

> 本ドキュメントは **ローカル開発環境の構築手順** です。Windows Server へのデプロイは [デプロイ手順](../doc/WindowsServerデプロイ手順.md) を参照してください。

## セットアップ（開発モード）

```bash
# 0) リポジトリ直下(app/)で
cp .env.example .env               # 必要なら値を調整
docker compose up -d               # PostgreSQL 起動

# 1) バックエンド
cd backend
cp ../.env .env                    # backend 実行時の .env（DATABASE_URL 等）
npm install
npm run prisma:generate            # Prisma Client 生成
npm run prisma:deploy              # マイグレーション適用（初回は prisma:migrate）
npm run seed                       # マスタ既定シード（冪等）
npm run etl                        # CSV取込＋算出＋DB投入
npm run start                      # API＋静的配信 (:8787)

# 2) フロント（画面を編集するなら別ターミナルで）
cd ../frontend
npm install
npm run dev                        # Vite HMR (:5173, /api→:8787)
```

- 本番相当の単一サーバ確認: `frontend` を `npm run build` → `backend` の `npm run start` で `http://localhost:8787` から配信。
- 画面右上の **「管理者モード」** ON で「データ取込」「担当者」「マスタ管理」が出現します。

## データ更新（バッチ再実行）

- CSVを差し替えたら `cd backend && npm run etl` を再実行（取込は洗い替え。**担当者・困りごと・メモ（③）は保持**）。
- マスタ編集は保存時に一覧へ自動反映されます。CLI から手動実行する場合は `cd backend && npm run recompute`（CSVを読まず算出のみ＝高速）。
- 本番の定期取込は「データ取込」画面の自動取込（時刻指定・日本時間）。同じ処理は `npm run etl` でも手動実行できる。

## 主な設定（`.env`）

| キー | 既定 | 説明 |
|---|---|---|
| `DATABASE_URL` | postgresql://mop:...@localhost:5432/mop | Prisma接続文字列 |
| `CSV_DIR` | `../sample-data` | 取込元CSVフォルダ（本番は共有フォルダ実パス） |
| `AS_OF` | （省略可） | 開発用フォールバック。本番は取込成功時に `m_param.AS_OF` へ自動保存 |
| `SHOP_LT_DAYS` / `MILESTONE_LT_DAYS` / `STAGNANT_THRESHOLD` | 4 / 5 / 10 | 算出既定（`m_param` で上書き可） |
| `DUE_SOURCE` | `flexsche` | 最終納期の採用元 flexsche/pbs（未決論点） |

## API（契約は `/api/*` で安定）

| メソッド | パス | 用途 |
|---|---|---|
| GET | `/api/meta` | 基準日・担当者候補・DUE_SOURCE |
| GET | `/api/parts` | 一覧＋各部品のタイムライン（`Part[]`） |
| POST | `/api/parts/:id/owner` \| `/trouble` \| `/memo` \| `/note` \| `/shelved` | アプリ固有データ更新 |
| GET/POST | `/api/auth/users`、POST `/api/auth/users/:id` | ユーザー管理（管理者） |
| GET | `/api/masters`、GET/POST `/api/masters/:name`、DELETE `/api/masters/:name/:id` | マスタCRUD |
| POST | `/api/recompute` | 再計算（DB上の取込済みデータから算出のみ） |
| GET | `/api/owners`、POST `/api/owners/:id/kishu` | 担当者×機種 |
| POST | `/api/assign/auto` | 担当者の自動割り当て（未割当のみ） |
| GET/POST | `/api/ingest` | 取込状態／取込ジョブ起動 |
| PUT | `/api/ingest/schedule` | 自動取込の有効／時刻（HH:MM、日本時間） |
| GET | `/api/audit` | 操作監査ログ |

## 品質ゲート

```bash
cd backend && npm run selftest && npm run typecheck   # 算出自己検証＋型チェック
cd frontend && npm run typecheck                       # フロント型チェック
```

## 本番（Windows Server）との差分

同一スタック（全面TS＋PostgreSQL）のため、差分は薄い接続部のみ：
1. **バッチ起動**: ローカルは手動 `npm run etl`。本番は「データ取込」の自動取込（指定時刻）が同じ `runEtl` を起動。
2. **フロント配信**: `frontend/dist` を IIS で静的配信（開発は NestJS/Vite が配信）。
3. **認証**: メール＋パスワードの JWT ログイン（`/login`）。検証環境は IIS Basic 認証で URL ゲート。操作ユーザー識別は `src/common/app-user.ts`。

DB・ETL・算出・API・フロントの本体コードはそのまま流用できます。
