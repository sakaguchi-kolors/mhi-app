# 開発者オンボーディング — 部品進捗システム（仮称）

三菱重工業様 飛翔体部品進捗T 生産性向上プロジェクト。本リポジトリは、既存の小日程/実績/計画納期データから **緊急度・優先度を可視化する部品進捗システム** のプロトタイプ（MVP）です。設計仕様書・アーキテクチャ案・モックに準拠して実装しています。

> 引き継ぎの主目的：**このコードベースをそのまま作り込んで本番化していくこと**。まず「動かして全体像を掴む」→「ホットリロードで開発」の順で進めてください。

---

## 1. まず動かす

### 推奨：Dev Container（VS Code＋Docker＋WSL2）＝環境構築ゼロ
VS Code で本フォルダを開き、コマンドパレット →「**Dev Containers: Reopen in Container**」。
Node＋PostgreSQL＋依存インストール＋CSV取込・算出まで自動で整い、そのまま開発できます（`.devcontainer/`）。
コンテナ内ターミナルで `npm run dev`（:8787）／`npm run web:dev`（:5173, HMR）。
> WSL2利用時はリポジトリを WSL 側FS（例 `~/projects/mop-app`）に置くと高速です（`/mnt/c` は遅い）。

### A. ワンコマンド確認（Docker Desktop だけあればOK）
```bash
docker compose --profile full up   # db＋app を全部コンテナ起動
# → http://localhost:8787
```
初回はビルド＋CSV取込のため数分かかります。DB作成・スキーマ・マスタ既定シード・CSV取込・算出・フロントビルド・サーバ起動まで全自動。

### B. 開発モード（日常の作り込み。反復が速い）
前提：Node.js 20+ と Docker Desktop。
```bash
docker compose up -d        # PostgreSQL だけ起動
copy .env.example .env      # (mac/linux: cp)
npm install
npm run setup               # db:init（スキーマ＋マスタ既定シード） + etl（取込・算出）
# 別ターミナルで：
npm run dev                 # API＋静的配信 (:8787)
npm run web:dev             # フロントHMR (:5173, /api→:8787 プロキシ) ← 画面いじるならこちら
```
- 画面（React）を編集 → `:5173` に即反映。
- バックエンド（`src/*.ts`）を編集 → `npm run dev` を再起動（tsx）。
- マスタ/データを変えたら画面の「🔄 再計算」または `npm run etl`。

品質ゲート：
```bash
npm run selftest                 # 算出ロジックの自己検証（DB不要）
npx tsc --noEmit                 # バックエンド型チェック
npx tsc -p frontend/tsconfig.json --noEmit  # フロント型チェック
```

---

## 2. アーキテクチャ地図

一方向データフロー（設計どおり）:
```
既存システム(CSV/CP932) → ETL＋算出バッチ(Node/TS) → PostgreSQL → REST API(Node/TS) → フロント(React/TS)
   sample-data/            src/etl.ts + src/calc.ts    db/schema.sql   src/server.ts      frontend/
```

| 層 | 場所 | 役割 |
|---|---|---|
| 取込＋算出バッチ | `src/etl.ts`（`runEtl()`）, `src/csv.ts` | CSVを読み、OS_ID単位に集約し、`src/calc.ts`で算出してPGへ洗い替え投入。取込時に再計算用の生データ(t_part/t_routing)＋補助(pbs_due, t_shop_name)も保存 |
| 再計算（算出のみ） | `src/etl.ts`（`recompute()`） | CSVを読まず、取込済みの t_part/t_routing＋現在のマスタから算出だけやり直す（マスタ編集の反映用・高速）。`/api/recompute` の実体 |
| 算出ロジック | `src/calc.ts` | 残Shop・バッファ・優先度色・検査マイルストン逆算・外注ステータス・滞留。**マスタ駆動**（`src/masters.ts`） |
| DB | `db/schema.sql`, `src/db.ts` | ①取込(洗替) ②算出結果 ③アプリ固有(担当者/困りごと/メモ) ＋ マスタ ＋ 監査ログ |
| API | `src/server.ts` | REST。一覧/詳細、担当者・困りごと・メモ、マスタCRUD、再計算、監査。web/も静的配信 |
| フロント | `frontend/src/` | React+TS(Vite)。`App.tsx`＝画面シェル、`components/`＝一覧(TanStack Table)/詳細/マスタ管理 |

**基準日(as-of)**：`.env` の `AS_OF`。本番は取込実行時刻。サンプルは 2026-07-08 固定。

---

## 3. API契約（フロント⇔バックの境界。ここは安定に保つ）

型の単一の源は **`src/types.ts`**（`Part` / `TimelineCell`）。フロントは `frontend/src/types.ts` がこれを再エクスポートして**型共有**。

| メソッド | パス | 用途 |
|---|---|---|
| GET | `/api/meta` | 基準日・担当者候補・DUE_SOURCE |
| GET | `/api/parts` | 一覧＋各部品のタイムライン（`Part[]`） |
| POST | `/api/parts/:id/owner` \| `/trouble` \| `/memo` \| `/note` | アプリ固有データ更新 |
| GET | `/api/masters` | マスタ定義（UI構築用） |
| GET/POST | `/api/masters/:name` | マスタ行 取得/upsert |
| DELETE | `/api/masters/:name/:id` | マスタ行 削除 |
| POST | `/api/recompute` | 再計算（`recompute()`＝DB上の取込済みデータから算出のみ。CSVを読まず高速。マスタ編集を反映） |
| GET | `/api/owners` | 担当者一覧（各人の担当機種つき）＋全機種リスト（担当者マスタUI用） |
| POST | `/api/owners/:id/kishu` | 担当者の担当機種トグル（`{kishu,on}`。ON=追加/OFF=削除） |
| POST | `/api/assign/auto` | 担当者の自動割り当て（`autoAssign()`。未割当のみ＝既存は上書きしない。部品の機種を担当する人へ、総担当件数が均等になるよう配分。担当者不在の機種は未割当のまま） |
| GET | `/api/ingest` | 取込：指定フォルダ(CSV_DIR)のファイル一覧＋取込前チェック＋ジョブ状態（UIはこれをポーリング） |
| POST | `/api/ingest` | 取込ジョブ起動（`runEtl()`を非同期実行。実行中409/プリフライトNG422） |
| GET | `/api/audit` | 操作監査ログ |

> フロント刷新やAPI追加をしても、**この契約と`Part`形を保てば影響範囲は片側に閉じる**（=このプロトの素HTML→React移植も表示層だけで済んだ）。

---

## 4. 算出ロジックとマスタ（拡張の勘所）

`src/calc.ts::computePart()` が1部品分を算出。挙動は **7つのマスタ**（`src/masters.ts` / `db/schema.sql`）で規定：

| マスタ | 効くところ |
|---|---|
| `m_param` | 1Shop所要日数(既定4)、マイルストン逆算係数(5)、滞留閾値(10)、色境界、最終納期の採用元(`DUE_SOURCE`) |
| `m_milestone` | 検査マイルストン判定ルール（shop / shop_prefix / name_contains） |
| `m_shop_lt` | Shop別の実LT上書き |
| `m_calendar` | 休日登録で残日数を稼働日ベースに |
| `m_category` | 部品番号→完成品分類（正規表現） |
| `m_vendor` | 注文番号→外注先名（表示） |
| `m_owner` | 担当者。専用画面「担当者」で氏名/アカウント/ロール＋**担当機種をチェック**。`m_owner_kishu`（担当者×機種）が自動割り当てのキー |
| `m_kishu` | 機種(型式)の登録簿（取込で自動登録）。担当割当は担当者マスタで機種にチェックする方式（`m_kishu.team` は将来用の予約列で現行未使用） |

編集は画面「マスタ管理」（右上「管理者モード」ON）→「🔄 再計算」で反映。既定シード（`src/dbinit.ts`）は**現状挙動を完全再現**する値。

**マスタ項目を1つ足す手順**：`db/schema.sql`に列/表追加 → `src/masters.ts`の`MASTERS`定義（UI）と`loadMasters()`（算出への反映）を更新 → 必要なら`src/calc.ts`が読む。UI/CRUDは定義駆動なので画面側は基本自動。

---

## 5. データについて

- `sample-data/` はサンプル（抽出）データ。FLEXSCHEは上位5,000件抽出のため外注の戻り等が欠落しうる（本番フルデータで精度向上）。詳細は `sample-data/説明.txt`。
- 文字コードは **ファイルごとに自動判定**（`src/csv.ts` の `detectEncoding`：BOM＋UTF-8妥当性、非該当はCP932）。実データ実績＝FLEXSCHE/SHOP_JOB は CP932、PBS/OCTPuS は UTF-8。固定decodeだと日本語列が全滅するため自動判定は必須。
- 大容量CSVは **ストリーム取込**（`readCsvStream`）。OCTPuS工程実績は約1.8GB/450万行になり得るため全読み込み不可（V8文字列長上限/ヒープに抵触）。取込は定数メモリ（実測ピーク約577MiB）。
- 取込ファイル名は `FILE_FLEXSCHE`/`FILE_PBS`/`FILE_OCTOPUS`/`FILE_SHOP_MASTER` の env で上書き可（既定は現時点の提供データ名）。
- OS_ID（製造インスタンスID）が全ソース共通キー。先頭アポストロフィ等はクレンジング。
- 本番は `CSV_DIR` を実際の共有フォルダ（収集バッチの出力先）に向ける。**管理者モードの「データ取込」画面**からそのフォルダを手動取込でき、本番の定期実行（タスクスケジューラ）も同じ `runEtl` を呼ぶ＝トリガーだけの差。

---

## 6. 未決論点 / 次の作り込み候補（設計仕様書4章＋実装で判明）

- **最終納期の採用元**：`DUE_SOURCE=flexsche`(JND計算最終) or `pbs`(計画納期・月末)。一部部品はJND計算が空でPBSフォールバック中。要確定。
- **子部品欠品の判定粒度**：PBSの該当列が1行でも埋まれば真、と単純化。過大計上ぎみ。
- **認証**：未実装（ローカルは「管理者モード」トグル）。本番は IIS統合Windows認証＋ADグループ。API前段にミドルウェア1枚。
- **バッチ起動**：本番は Windows タスクスケジューラで `runEtl` を定期起動。
- **フロント配信**：本番は `web/` の静的成果物を IIS 配信。
- **データ取込UI**：指定フォルダの手動取込は実装済み（管理者モード「データ取込」／`GET・POST /api/ingest`／プリフライト・非同期ジョブ・監査）。本番は同じ `runEtl` をタスクスケジューラで定期実行。
- **一覧のスケール**：部品2万件規模で一覧が重い（実データ24,163件）。対策として **機種/担当チームの絞り込み（`m_kishu`）＋大量時の描画抑止ガード（既定1000件超は絞り込みを促す）** を実装済み。担当は機種で分かれるため、機種スコープで実用上は数百〜数千件に収まる。ただし単一で数千件の機種（例 S=4,677/TJ=2,811）や大きなチームでは依然重いので、**仮想スクロール or サーバ側ページング**が本来の解（未実装）。
- Phase2：AI予測・自動収集・算出層の独立サービス化。

---

## 7. 本番（Windows Server）との差分

同一スタック（全面TS＋PostgreSQL）のため、差分は薄い接続部のみ：①バッチ起動（タスクスケジューラ）②フロント配信（IIS）③認証（AD）。DB・ETL・算出・API・フロントの本体はそのまま流用可能。詳細は `README.md`。
