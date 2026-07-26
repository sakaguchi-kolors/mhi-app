# 部品進捗システム（仮称）— ローカル疑似環境

三菱重工業様 飛翔体部品進捗T 生産性向上プロジェクトの「部品進捗システム」を、**本番と同一スタック**でローカルに動かすための最小実装（縦串1本）です。

- **スタック**：Node.js + TypeScript / PostgreSQL / **React + TS（Vite、静的ビルド）**（設計仕様書・アーキテクチャ案に準拠）
- **データフロー**（一方向）：`CSV(CP932) → ETL＋算出バッチ → PostgreSQL → API → フロント`
- **スコープ**：CSV取込 → 算出（残Shop・バッファ・優先度色・マイルストン・外注・滞留）→ API → 一覧＋部品詳細。担当者／困りごと／メモの書込みも永続化。

> このローカル構成は、Windows Server 本番へそのまま持ち上げられます。差分は末尾「本番との差分」の3点だけです。
> **開発を引き継ぐ方は [ONBOARDING.md](ONBOARDING.md) を先にご覧ください**（アーキ地図・API契約・拡張方法・未決論点）。

---

## 1. 起動（2モード）

CSVサンプルはリポジトリに同梱（`sample-data/`）済みで、追加データの用意は不要です。

### モードA：ワンコマンド確認（**Docker Desktop だけ**あればOK）
Node の導入も npm コマンドも不要。全部コンテナ内で自動実行されます。
```bash
docker compose --profile full up
# → http://localhost:8787  （初回はビルド＋取込で数分）
```
> 既にローカルで PostgreSQL を 5432 で動かしている場合はポート競合に注意。`docker-compose.override.yml` を置いて DB のホストポートを逃がす（例 `services: { db: { ports: ["5433:5432"] } }`）か、ローカルPGを停止してください。アプリ↔DBはコンテナ内部通信なので、逃がしても動作に影響ありません。

### モードB：開発モード（作り込み向け・反復が速い）
前提：**Node.js 20+**（`winget install OpenJS.NodeJS.LTS`）＋ **Docker Desktop**。
```powershell
cd mop-app
copy .env.example .env       # (mac/linux: cp)
docker compose up -d         # PostgreSQL だけ起動（app は起動しない）
npm install
npm run setup                # スキーマ＋マスタ既定シード＋CSV取込・算出
npm run build:web            # フロント(React)を web/ へ静的ビルド
npm run dev                  # API＋静的配信 (:8787)
```
ブラウザで **http://localhost:8787**。

> **フロントを編集して試す**なら別ターミナルで `npm run web:dev`（Vite :5173・HMR・`/api`→:8787 プロキシ）。本番相当の確認は `npm run build:web` → `npm run dev`。
> Docker を使わず既存の PostgreSQL を使う場合は `.env` の接続情報を書き換えるだけ（Docker は必須ではありません）。

## 2. データ更新（バッチ再実行）

CSV を差し替えたら再度 `npm run etl` を実行するだけ。**担当者・困りごと・メモ（アプリ固有テーブル）は洗い替えの影響を受けず保持**されます（設計仕様書1.5準拠）。本番では Windows タスクスケジューラがこの `etl` を数時間ごとに起動します。

## 3. 主な設定（`.env`）

| キー | 既定 | 説明 |
|---|---|---|
| `CSV_DIR` | `./sample-data` | 取込元CSVフォルダ（同梱サンプル。本番は共有フォルダの実パスへ） |
| `AS_OF` | `2026-07-08` | 基準日(as-of)。本番は取込実行時刻。サンプルデータの時期に合わせて固定 |
| `SHOP_LT_DAYS` | `4` | 1Shopあたり所要日数（バッファ計算） |
| `MILESTONE_LT_DAYS` | `5` | マイルストン期日の逆算係数 |
| `STAGNANT_THRESHOLD` | `10` | レッドフラッグの滞留日数閾値 |
| `DUE_SOURCE` | `flexsche` | 最終納期の採用元。`flexsche`=JND(計算)最終（日粒度）/ `pbs`=計画納期（月末日）。**設計仕様書4章の未決論点**をトグル化 |

## 3.5 マスタ管理（アプリ内編集）

設計仕様書3章の「ハイブリッド保守」をアプリに実装。画面右上の **「管理者モード」** をONにすると **「マスタ管理」** が現れ、7マスタを編集できます。

| マスタ | 区分 | 算出への効き方 |
|---|---|---|
| パラメータ設定 `m_param` | 画面編集 | LT日数・滞留閾値・色境界・納期採用元 |
| 中間マイルストン定義 `m_milestone` | 画面編集 | どの工程を検査マイルストンとみなすか |
| 担当者 `m_owner` | 画面編集 | 割当ドロップダウンの選択肢 |
| Shop別標準LT `m_shop_lt` | 取込 | 未登録Shopは既定LT。登録で残所要が精緻化 |
| 稼働日カレンダー `m_calendar` | 取込 | 休日登録で残日数を稼働日ベースに |
| 外注先 `m_vendor` | 取込 | 注文番号前方一致で外注先名を表示 |
| 完成品分類 `m_category` | 取込 | 部品番号の正規表現→分類 |

- **編集は即DB保存**され、**「🔄 再計算して反映」** ボタン（＝`runEtl`）で算出結果（色・マイルストン等）へ反映されます。
- 全編集は **監査ログ `t_audit_log`** に記録（マスタ管理画面下部に直近履歴を表示）。
- 既定シードは**現状(v0.1)の挙動を完全再現**。編集して初めて算出が変わります。
- 本番では「管理者モード」トグルは **AD管理者グループ**（設計仕様書のロール）に置き換わります。

## 4. API

| メソッド | パス | 用途 |
|---|---|---|
| GET | `/api/meta` | 基準日・担当者候補・DUE_SOURCE |
| GET | `/api/parts` | 一覧＋各部品のタイムライン（モックの PARTS 形状） |
| POST | `/api/parts/:id/owner` | 担当者割当 `{owner}` |
| POST | `/api/parts/:id/trouble` | 困りごとフラグ `{flagged}` |
| POST | `/api/parts/:id/memo` | 困りごとメモ `{memo}` |
| POST | `/api/parts/:id/note` | 対応メモ `{note}` |
| GET | `/api/masters` | マスタ定義一覧（UI構築用） |
| GET/POST | `/api/masters/:name` | マスタ行の取得／upsert |
| DELETE | `/api/masters/:name/:id` | マスタ行の削除 |
| POST | `/api/recompute` | 再計算（マスタ編集を算出へ反映＝runEtl） |
| GET | `/api/audit` | 操作監査ログ（直近） |

## 5. ロジック検証（DB不要）

```powershell
npm run selftest
```
算出ロジック（バッファ・色・マイルストン逆算・外注判定）が設計仕様書どおりか、合成データで自己検証します。Node だけあれば実行可（Docker不要）。

## 6. 構成

```
mop-app/
  docker-compose.yml       PostgreSQL(本番同一)
  vite.config.ts           フロントのビルド(→web/)・devプロキシ設定
  .env.example             設定サンプル
  db/schema.sql            テーブル定義（取込①/算出②/アプリ固有③/マスタ）
  src/                     ── バックエンド(Node/TS) ──
    config.ts csv.ts db.ts types.ts masters.ts
    calc.ts                算出ロジック（設計仕様書2章。マスタ駆動）
    etl.ts                 取込＋算出バッチ（runEtl）
    server.ts              REST API＋静的配信
    dbinit.ts selftest.ts
  frontend/                ── フロント(React/TS, Viteソース) ──
    index.html  tsconfig.json
    legacy-reference.html  旧・素HTML版（移植元の参照実装）
    src/
      main.tsx App.tsx api.ts types.ts util.ts styles.css
      components/ ProgressBar / PartsList(TanStack Table) / PartDetail / Masters / Toast
  web/                     Viteビルド出力（Expressが静的配信。IIS配信の代替）
```

## 7. 本番（Windows Server）との差分 — ここだけ

同一スタックのため、手戻りは次の3点の“薄い接続部”のみ：

1. **バッチ起動**：ローカルは `npm run etl` 手動／`/api/recompute` → 本番は Windows タスクスケジューラが同じ `runEtl` を定期起動。
2. **フロント配信**：ローカルは `web/`(Viteビルド)を API サーバが配信 → 本番は同じ静的成果物を **IIS で配信**（フロントは React/TS。設計はNext.js指名だが、実質クライアントSPAのため Vite+React を採用。静的→IIS配信という形態は同一）。
3. **認証**：ローカルは認証なし＋「管理者モード」トグル → 本番は IIS 統合Windows認証(Kerberos)＋ADグループ。API 前段にミドルウェア1枚を追加。

DB・ETL・算出・API・フロントの本体コードはそのまま流用できます。
