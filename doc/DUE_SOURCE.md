# DUE_SOURCE — 最終納期の採用元（未決論点）

設計仕様書 4 章の **未決論点** を、マスタ `m_param.DUE_SOURCE` で切り替え可能にしたものです。  
現状は **どちらを正とするか確定していません**。

## 選択肢

| 値 | 意味 | データソース |
|----|------|-------------|
| `flexsche`（既定） | JND 計算最終（日粒度） | FlexSche 由来の工程日付から逆算した最終納期 |
| `pbs` | 計画納期（月末日） | PBS の計画納期月を月末日に変換した値 |

## システム上の挙動

1. **ETL 取込時**  
   - DB には `final_due`（採用した最終納期）と `pbs_due`（PBS 計画納期の月末日）を保持  
   - FlexSche 由来の候補日（JND 計算最終）は `t_routing` から都度再導出  
   - `DUE_SOURCE` に応じて `final_due` を決定  
     - `pbs`: `pbs_due ?? flexMax`  
     - `flexsche`: `flexMax ?? pbs_due`（片方欠損時はフォールバック）

2. **再計算 (`POST /api/recompute`)**  
   - 取込済みデータから buffer・色・フラグのみ再算出  
   - `DUE_SOURCE` 変更後は **再計算が必要**

3. **UI**  
   - マスタ管理 → パラメータ → 「最終納期の採用元」  
   - `GET /api/meta` の `dueSource` で現在値を参照

4. **環境変数**  
   - `.env` の `DUE_SOURCE` は **DB 未設定時のフォールバック**  
   - 通常は DB マスタが優先（`meta.service`）

## 判断に必要な論点

| 論点 | 補足 |
|------|------|
| 業務上の「正」の納期 | 現場が FlexSche 基準か PBS 計画月基準か |
| 欠損データの扱い | 一部部品は JND 計算が空で PBS フォールバック中 |
| 表示と KPI の一貫性 | 一覧・詳細・色判定がすべて同一ソースである必要 |
| 履歴・監査 | 切替前後で buffer/色が変わることを利用者にどう伝えるか |

## 確定後の作業（TODO）

- [ ] ステークホルダー合意で `flexsche` / `pbs` のどちらかを正とする
- [ ] 必要なら `DUE_SOURCE` トグルを UI から削除し固定化
- [ ] 設計仕様書 4 章の未決論点をクローズ
- [ ] 切替手順（再計算・周知）を運用手順書に追記

## 関連コード

- マスタ定義: `app/backend/src/masters/masters.def.ts`（`DUE_SOURCE` 行）
- 読み取り: `app/backend/src/meta/meta.service.ts`
- ETL: `app/backend/src/etl/etl.service.ts`（`finalDue` 決定）
- UI: `app/frontend/src/components/masters/ParamEditor.tsx`

## 参照

- プロトタイプでの同等実装: `moc/mop-app-handoff/src/etl.ts`
- オンボーディング: [`app/ONBOARDING.md`](../app/ONBOARDING.md)
