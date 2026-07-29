# 開発者オンボーディング — MHI 進捗管理支援システム

三菱重工業様 飛翔体部品進捗T 生産性向上プロジェクト。内製部品の小日程／実績(OCTPuS)／計画納期(PBS)／SHOPマスタの各CSVから、**部品の緊急度・優先度を算出して可視化**する進捗管理支援システムです。

> 引き継ぎの主目的：**`app/` をそのまま作り込んで本番運用していくこと**。まず「動かして全体像を掴む」→「ホットリロードで開発」の順で進めてください。

---

## 1. まず動かす

### 前提

- **Node.js 20+**
- **Docker Desktop**（ローカル PostgreSQL 用）

### セットアップ

```bash
cd app
cp .env.example .env
docker compose up -d

cd backend
cp ../.env .env
npm install
npm run prisma:generate
npm run prisma:deploy    # 初回は prisma:migrate
npm run seed
npm run etl
npm run start            # API + 静的配信 (:8787)

# 別ターミナル（画面を編集する場合）
cd ../frontend
npm install
npm run dev              # Vite HMR (:5173, /api→:8787)
```

- 本番相当の単一サーバ確認: `frontend` を `npm run build` → `backend` の `npm run start` で `http://localhost:8787`
- 画面右上の **「管理者モード」** ON で「データ取込」「担当者」「マスタ管理」が出現

### 品質ゲート（PR前に通す）

```bash
cd backend && npm run selftest && npm run test && npm run typecheck
cd frontend && npm run typecheck
```

CI（GitHub Actions）でも同じチェックが自動実行されます。

---

## 2. アーキテクチャ地図

一方向データフロー:

```
CSV(CP932/UTF-8) → ETL＋算出バッチ → PostgreSQL → REST API → フロント(React)
  sample-data/      backend/src/etl/   prisma/       NestJS         frontend/src/
                    backend/src/calc/
```

| 層 | 場所 | 役割 |
|---|---|---|
| 取込＋算出バッチ | `backend/src/etl/` | CSV読込・OS_ID集約・DB洗い替え投入。`etl.cli.ts` から CLI 実行 |
| 再計算 | `backend/src/etl/etl.service.ts`（`recompute()`） | CSVを読まず、取込済みデータ＋現在マスタから算出のみ（マスタ編集反映用） |
| 算出ロジック | `backend/src/calc/calc.ts` | 残Shop・バッファ・色・マイルストン逆算・外注ステータス。**マスタ駆動** |
| DB | `backend/prisma/schema.prisma` | 取込① / 算出② / アプリ固有③ / マスタ / 監査 |
| API | `backend/src/*/` | NestJS Controller + Service。JWT Cookie 認証 |
| フロント | `frontend/src/` | React + TS (Vite)。一覧(TanStack Table) / 詳細 / マスタ / 取込 |

**基準日(as-of)**: `.env` の `AS_OF`。本番は取込実行時刻。サンプルは 2026-07-08 固定。

### ディレクトリ早見表

```
app/
  backend/src/
    calc/       算出ロジック（設計仕様書2章準拠）
    etl/        CSV取込・ETL・ingest API
    masters/    マスタ定義・CRUD
    parts/      部品一覧・更新 API
    owners/     担当者×機種
    assign/     自動割り当て
    audit/      操作監査
    auth/       JWT 認証
    config/     環境変数・設定
    common/     API契約型（shared へ re-export）
    shared/     フロント・バック共通型・ドメインロジック
    scripts/    seed / etl.cli / selftest
  frontend/src/
    App.tsx     ルーティング・認証・データ取得（リファクタ対象）
    api.ts      API クライアント
    types.ts    API契約型（@shared エイリアスで backend/src/shared/types.ts を参照）
    components/ 画面コンポーネント
```

---

## 3. ドメイン用語集

| 用語 | 説明 |
|------|------|
| **OS_ID** | 製造インスタンスID。全CSVソース共通の部品キー |
| **kishu（機種）** | 型式（例 `37B`）。担当者割り当てのキー |
| **Shop** | 工程の作業場所コード（例 `7P31`, `8A61`） |
| **Shop LT** | 1 Shop あたりの所要日数（既定4日、`m_shop_lt` で上書き可） |
| **バッファ** | 残日数 − 残Shop所要日数。マイナスほど緊急 |
| **マイルストン** | 検査工程。最終納期から逆算して期限色を付ける |
| **gaic（外注）** | 外注工程。材料払出・戻り状況で色分け |
| **FLEXSCHE** | 小日程CSV（工程計画） |
| **OCTPuS** | 工程実績CSV（WIP・外注実績） |
| **PBS** | 計画納期CSV |
| **DUE_SOURCE** | 最終納期の採用元（`flexsche` / `pbs`）。未決論点 → 詳細は [`doc/DUE_SOURCE.md`](../doc/DUE_SOURCE.md) |
| **③テーブル** | アプリ固有データ（担当者・困りごと・メモ）。ETL洗い替えで消えない |

---

## 4. API 契約（フロント⇔バックの境界）

型の単一の源は **`backend/src/shared/types.ts`**。フロントは `@shared` エイリアス経由で同一型を参照。

| メソッド | パス | 用途 |
|---|---|---|
| GET | `/api/meta` | 基準日・担当者候補・DUE_SOURCE |
| GET | `/api/parts` | 一覧＋タイムライン（`Part[]`） |
| POST | `/api/parts/:id/owner` \| `/trouble` \| `/memo` \| `/note` \| `/shelved` | アプリ固有データ更新 |
| GET/POST | `/api/auth/users`、POST `/api/auth/users/:id` | ユーザー管理（管理者） |
| GET/POST/DELETE | `/api/masters/*` | マスタ CRUD |
| POST | `/api/recompute` | 再計算（CSV読まず算出のみ） |
| GET/POST | `/api/owners/*` | 担当者×機種 |
| POST | `/api/assign/auto` | 担当者自動割り当て |
| GET/POST | `/api/ingest` | 取込状態／ジョブ起動 |
| GET | `/api/audit` | 操作監査ログ |
| POST | `/api/auth/login` \| `/logout` | 認証 |

> フロント刷新や API 追加をしても、**この契約と `Part` 形を保てば影響範囲は片側に閉じる**。

---

## 5. 算出ロジックとマスタ

`calc.ts::computePart()` が1部品分を算出。挙動は **7つのマスタ** で規定：

| マスタ | 効くところ |
|---|---|
| `m_param` | Shop所要日数、マイルストン係数、滞留閾値、色境界、DUE_SOURCE |
| `m_milestone` | 検査マイルストン判定ルール |
| `m_shop_lt` | Shop別 LT 上書き |
| `m_calendar` | 休日（稼働日ベースの残日数） |
| `m_category` | 部品番号→完成品分類（正規表現） |
| `m_vendor` | 注文番号→外注先名 |
| `m_user` + `m_user_kishu` | 担当者（ログインユーザー）と担当機種 |

編集は画面「マスタ管理」→ 保存時に自動反映（または「🔄 再計算」）。

**マスタ項目を1つ足す手順**: `schema.prisma` に列/表追加 → `masters.def.ts` の定義更新 → 必要なら `calc.ts` / `loadMasters()` を更新。

---

## 6. データについて

- `sample-data/` はサンプル（抽出）データ。詳細は `sample-data/説明.txt`
- 文字コードは **ファイルごとに自動判定**（BOM + UTF-8 妥当性、非該当は CP932）
- 大容量 CSV は **ストリーム取込**（OCTPuS は約1.8GB/450万行になり得る）
- OS_ID が全ソース共通キー

---

## 7. 変更時の原則

- **API 契約（`/api/*` とレスポンス形）は安定に保つ**
- 算出の挙動は **マスタ駆動**。ロジック定数をコードに直書きしない
- 取込は洗い替え。**担当者・困りごと・メモ（③）は保持**
- 算出ロジック変更時は `npm run selftest` で回帰確認

---

## 8. 未決論点

- **最終納期の採用元**（DUE_SOURCE: flexsche / pbs）
- **子部品欠品の判定粒度**
- **一覧のスケール**（2万件規模。仮想スクロール or サーバページングは未実装）
- Phase2: AI予測・自動収集・算出層の独立サービス化

---

## 9. 関連ドキュメント

| ドキュメント | 内容 |
|---|---|
| [app/README.md](README.md) | 環境構築・API一覧・設定 |
| [doc/技術選定.md](../doc/技術選定.md) | 採用技術・選定理由 |
| [doc/データベース.md](../doc/データベース.md) | テーブル群・データフロー |
| [doc/WindowsServerデプロイ手順.md](../doc/WindowsServerデプロイ手順.md) | 本番デプロイ |
| [moc/mop-app-handoff/](../moc/mop-app-handoff/) | **参照専用**の旧プロトタイプ（Express版） |

---

## 10. `moc/` について

`moc/mop-app-handoff/` は技術選定前の **Express + 生SQL プロトタイプ** です。算出ロジック・API 契約・マスタ駆動設計は `app/` へ移植済みです。

- **新規開発の対象は `app/` のみ**
- `moc/` は設計の参照・履歴確認用。Dev Container 設定等は旧構成向け
- 旧 ONBOARDING（`moc/.../ONBOARDING.md`）のパス表記は `app/` 向けに読み替えること
