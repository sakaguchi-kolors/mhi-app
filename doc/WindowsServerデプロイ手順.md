# Windows Server デプロイ手順

AWS 検証環境で実際に構築した手順をもとに、**先方 Windows Server への初回デプロイ**と**機能アップデート**の手順をまとめたものです。

> **先方サーバーはインターネットに出られない。** Chocolatey / `npm ci` 前提の本手順（`setup-server.ps1`）は先方では使えない。  
> 先方と、先方と同じ確認をする検証は **[オフライン構築手順.md](./オフライン構築手順.md)**（`make-offline-kit.ps1` / Box 受け渡し）を使う。
>
> 以下はインターネットがある環境向けの従来手順。

---

## 1. 構成

```text
ブラウザ
   │ HTTPS（推奨）/ HTTP
   ▼
IIS (C:\inetpub\mhi)
   ├  React 静的ファイル (frontend/dist)
   └  /api/* → リバースプロキシ (ARR)
         ▼
NestJS Windows Service (MhiProgressApi, port 8787)
         ▼
PostgreSQL 18 (DB: mop)
```

| コンポーネント | 役割 |
|---------------|------|
| IIS | フロント配信 + API リバースプロキシ |
| NestJS (Service) | REST API / 認証 / ETL |
| PostgreSQL 18 | データ保存 |
| 納品 ZIP | ソース更新（GitHub 非利用） |

認証は **アプリ内ログイン（JWT）**。AD 連携は不要。

---

## 2. 先方環境の事前確認（デプロイ前チェックリスト）

先方 IT 担当者に以下を確認してください。

| 項目 | 内容 |
|------|------|
| OS | Windows Server 2019 または 2022 |
| RDP 接続 | VPN 経由か、接続先 IP / アカウント |
| インターネット | 先方は不可。オフラインキットを使う（[オフライン構築手順.md](./オフライン構築手順.md)） |
| ファイル受け渡し | **Box** |
| 管理者権限 | 初回セットアップ用 |
| ポート | 80（HTTP）、443（HTTPS 推奨） |
| CSV 配置先 | 共有フォルダパス（本番取込元） |
| PostgreSQL | 同一サーバーに置くか、別 DB サーバーか |

### 推奨スペック

| 項目 | 最小 | 推奨 |
|------|------|------|
| vCPU | 2 | 2〜4 |
| メモリ | 4 GiB | 8 GiB（CSV 大量 ETL 時） |
| ディスク | 50 GiB | 100 GiB |

---

## 3. 開発側：納品パッケージの作成

先方へ渡す前に、開発 PC（Mac 等）で ZIP を作成します。

```bash
cd app/deploy
./make-release.sh
# → ../../dist-release/mhi-app-release-YYYYMMDD.zip
```

Windows 開発 PC の場合:

```powershell
cd app\deploy
.\make-release.ps1
# → dist-release\mhi-app-release-YYYYMMDD.zip
```

ZIP には `node_modules` / `dist` / `.env` は含まれません（サーバー側で `npm ci` と build します）。  
ルートに `RELEASE.txt`（バージョン・ビルド日時）が入ります。

---

## 4. 初回デプロイ（先方 Windows Server）

### 4-1. サーバーへ RDP 接続

Mac から **Windows App**（旧 Microsoft Remote Desktop）で接続。

| 項目 | 値 |
|------|-----|
| PC name | 先方から指定された IP / ホスト名 |
| Username | 先方から指定されたアカウント |
| Password | 先方から指定されたパスワード |

### 4-2. 管理者 PowerShell を開く

1. スタート → `powershell` と入力
2. **Windows PowerShell** を **右クリック** → **管理者として実行**
3. タイトルに `管理者:` と表示されていることを確認

### 4-3. 実行ポリシー設定（初回のみ）

```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```

`Y` + Enter

### 4-4. ソースコード配置（納品 ZIP）

1. 開発側から受け取った `mhi-app-release-*.zip` をサーバーへコピー（例: `C:\Temp\`）
2. 展開して所定の場所へ配置:

```powershell
mkdir C:\apps -Force
Expand-Archive -Path C:\Temp\mhi-app-release-20260729.zip -DestinationPath C:\Temp\release -Force

# ZIP 内は staging-mhi-app\ または mhi-app\ 直下構造。RELEASE.txt があるルートを C:\apps\mhi-app に置く
# 例: 展開結果が C:\Temp\release\staging-mhi-app\ の場合
Move-Item C:\Temp\release\staging-mhi-app C:\apps\mhi-app -Force

cd C:\apps\mhi-app\app\deploy
Get-Content C:\apps\mhi-app\RELEASE.txt
```

> **重要:** `backend\.env` は初回セットアップ時に自動生成されます。**上書き更新時は必ず退避**してください（§5-2 参照）。

### 4-5. 初回セットアップ実行

```powershell
cd C:\apps\mhi-app\app\deploy
.\setup-server.ps1
```

**10〜20 分** かかります。以下を自動実行します。

| 処理 | 内容 |
|------|------|
| Chocolatey | パッケージ管理 |
| Node.js 20 | API 実行環境（choco `nodejs` 20.x pin） |
| PostgreSQL 18 | DB |
| NSSM | Windows Service 管理 |
| IIS + URL Rewrite + ARR | Web サーバー |
| DB 作成 | `mop` DB / `mop` ユーザー |
| `.env` 生成 | JWT_SECRET 自動生成 |
| Windows Service | `MhiProgressApi` 登録 |
| IIS サイト | `MhiApp`（port 80） |
| 初回デプロイ | build + migrate + etl + seed + recompute |
| 初回のみ追加（20260818 キット） | `ensure-m-param.ps1` + seed + recompute（`setup-offline` 直後。§4-5 参照） |

Git は**インストールしません**（先方運用では不要）。

#### オプション

```powershell
# Basic 認証を付けない（社内 VPN 内のみ等）
.\setup-server.ps1 -SkipBasicAuth

# PostgreSQL を別途用意している場合
.\setup-server.ps1 -SkipPostgresInstall
```

### 4-6. IIS 初期画面が出る場合（よくある）

デプロイ成功後も IIS の「Welcome」画面が出ることがあります。

```powershell
Import-Module WebAdministration
Stop-Website -Name "Default Web Site"
Start-Website -Name "MhiApp"
```

### 4-7. 本番用 `.env` 調整

`C:\apps\mhi-app\app\backend\.env` を編集します。

| キー | 本番での設定 |
|------|-------------|
| `DATABASE_URL` | 先方 DB 接続情報 |
| `CSV_DIR` | 本番 CSV 共有フォルダ（例: `D:\share\csv`） |
| `JWT_SECRET` | setup 時に自動生成済み（変更不要推奨） |
| `COOKIE_SECURE` | HTTPS 化後は `true` |
| `AS_OF` | **本番では行を削除（未設定＝実行日）**。サンプル検証時のみ固定値 |

編集後:

```powershell
Restart-Service MhiProgressApi
```

### 4-8. 動作確認

1. ブラウザで `http://<サーバーIP>/` にアクセス
2. 初回: `/setup` で管理者アカウント作成
3. ログイン → 部品一覧・マスタが表示されること

API 単体確認（サーバー内）:

```powershell
Invoke-RestMethod http://127.0.0.1:8787/api/auth/setup
```

---

## 5. 機能アップデート（2 回目以降）

### 5-1. 全体フロー

```text
開発 PC で機能開発・ローカル確認
        │
        ▼
make-release.sh / make-release.ps1 で納品 ZIP 作成
        │
        ▼
USB / 共有フォルダ等で先方サーバーへ受け渡し
        │
        ▼
先方 Windows Server に RDP 接続
        │
        ▼
.env を退避 → ソース上書き → .\deploy.ps1
        │
        ▼
ブラウザで動作確認（RELEASE.txt / 画面）
```

### 5-2. アップデート手順（サーバー側）

管理者 PowerShell で:

```powershell
# 1) 設定ファイルを退避（必須）
Copy-Item C:\apps\mhi-app\app\backend\.env C:\apps\backend.env.backup -Force

# 2) 新しい ZIP を展開（例）
Expand-Archive -Path C:\Temp\mhi-app-release-20260729.zip -DestinationPath C:\Temp\release-new -Force

# 3) ソースを上書き（data\csv, logs は残す）
robocopy C:\Temp\release-new\staging-mhi-app C:\apps\mhi-app /MIR /XD data logs /NFL /NDL

# 4) .env を復元
Copy-Item C:\apps\backend.env.backup C:\apps\mhi-app\app\backend\.env -Force

# 5) デプロイ実行
cd C:\apps\mhi-app\app\deploy
.\deploy.ps1
Get-Content C:\apps\mhi-app\RELEASE.txt
```

`deploy.ps1` が行うこと:

```text
（既定）git pull なし — ディスク上のソースをそのままビルド
  → backend/frontend: npm ci → build（Service 稼働中）
  → Windows Service 停止（Prisma DLL ロック解除）
  → prisma migrate deploy
  → C:\inetpub\mhi へフロント配置
  → Windows Service 再起動
  → API ヘルスチェック
```

**5〜10 分** 程度（ビルド時間含む）。API ダウンタイムは Service 停止〜再起動の **数秒** です。

> **`Deploy complete` だけでは反映確認にならない**  
> ソースを上書きせず `deploy.ps1` だけ実行すると、古いコードの再ビルドになります。  
> 必ず §5-2 の手順 2〜4 でソース更新後に deploy し、[5-4. 反映確認](#5-4-反映確認) を実施してください。

### 5-3. DB マイグレーションについて

`deploy.ps1` 内で `prisma migrate deploy` が自動実行されます。

- 新しいテーブル・カラム追加 → **自動適用**
- 既存データは原則保持
- マイグレーション失敗時は `api.err.log` を確認

### 5-4. 反映確認

デプロイ後、サーバー側で次を確認:

```powershell
# 納品バージョン
Get-Content C:\apps\mhi-app\RELEASE.txt

# 配信 JS が新ビルドか（ファイル名ハッシュが deploy 前後で変わる）
dir C:\inetpub\mhi\assets\index-*.js
```

ブラウザでは、サイドバー・機能が期待どおりか確認してください。

### 5-5. CSV データの更新

#### 手動（検証・初回）

```powershell
cd C:\apps\mhi-app\app\backend
npm run etl
```

#### 本番（定期実行）

Windows タスクスケジューラで以下を定期実行:

```text
プログラム: C:\Program Files\nodejs\node.exe
引数:     dist\scripts\etl.cli.js
作業Dir:  C:\apps\mhi-app\app\backend
```

または PowerShell ラッパー:

```powershell
cd C:\apps\mhi-app\app\backend
npm run etl
```

CSV を差し替えたあと ETL を実行すると DB が更新されます。

#### マスタ変更後の再計算のみ（CSV 読まない）

```powershell
cd C:\apps\mhi-app\app\backend
npm run recompute
```

---

## 6. 開発側の日常フロー（参考）

```text
1. 開発 PC で機能開発
2. ローカル確認（docker compose + npm run dev）
3. （社内）Git でバージョン管理 — 先方サーバーには Git 不要
4. make-release.sh で納品 ZIP 作成
5. 検証環境（AWS）へ ZIP 配置 → deploy.ps1 → 確認
6. 問題なければ同じ ZIP を先方サーバーへ受け渡し → deploy.ps1
```

---

## 7. HTTPS 化（本番推奨）

1. 先方のドメイン / 証明書を IIS に設定
2. `backend\.env` で `COOKIE_SECURE=true`
3. `Restart-Service MhiProgressApi`

---

## 8. ディレクトリ構成

```text
C:\apps\mhi-app\
  RELEASE.txt           納品バージョン情報
  app\
    backend\              NestJS + .env + Prisma
    frontend\             React ソース
    deploy\
      setup-server.ps1    初回セットアップ
      deploy.ps1          アップデート
      make-release.ps1    納品 ZIP 作成（開発 PC 用）
      web.config          IIS 設定
    sample-data\          サンプル CSV
  data\csv\               取込 CSV（検証用。本番は CSV_DIR で指定）
  logs\
    api.out.log           API 標準出力
    api.err.log           API エラー

C:\inetpub\mhi\           IIS 配信（frontend/dist + web.config）
```

---

## 9. トラブルシュート

| 症状 | 対処 |
|------|------|
| deploy 成功したが画面が古い | ソース上書き（§5-2）を実施したか確認。`RELEASE.txt` の日付・`index-*.js` のハッシュを確認 |
| `npm EPERM ... query_engine-windows.dll.node` | `Stop-Service MhiProgressApi -Force` してから `deploy.ps1` |
| `Restart-Service : Failed to start` | `logs\api.err.log` を確認。backend の `npm ci` / `build` 失敗時に起きやすい |
| IIS 初期画面（Welcome） | `Stop-Website "Default Web Site"` → `Start-Website "MhiApp"` |
| 502 / API 不通 | `Get-Service MhiProgressApi` / `logs\api.err.log` |
| ログインできない | HTTPS 化後は `COOKIE_SECURE=true` に |
| DB 接続エラー | `backend\.env` の `DATABASE_URL` / PostgreSQL サービス状態 |
| `/api` 404 | URL Rewrite + ARR が入っているか |
| deploy 失敗 | PowerShell を**管理者**で開き直す |
| npm ない | PowerShell を**閉じて開き直す**（PATH 反映） |
| Basic 認証エラー | `setup-server.ps1 -SkipBasicAuth` で再実行、または手動設定 |
| `.env` が消えた | 更新前に必ず `C:\apps\backend.env.backup` へ退避 |

### ログ確認

```powershell
Get-Content C:\apps\mhi-app\logs\api.err.log -Tail 50
Get-Service MhiProgressApi
Get-Website
```

---

## 10. AWS 検証環境との違い

| 項目 | AWS 検証 | 先方本番 |
|------|---------|---------|
| 接続 | RDP（パブリック IP） | RDP（VPN + 社内 IP） |
| URL | `http://<Elastic-IP>/` | 社内 URL / ドメイン |
| Basic 認証 | 付与（URL ゲート） | 任意（VPN 内なら省略可） |
| CSV | `C:\apps\mhi-app\data\csv` | 共有フォルダ |
| HTTPS | 後から設定 | 先方証明書を使用 |
| ETL | 手動 | タスクスケジューラ |
| ソース更新 | 納品 ZIP（または社内 Git + `-GitPull`） | **納品 ZIP のみ** |

**デプロイコマンド（`setup-server.ps1` / `deploy.ps1`）は同一** です。

---

## 11. クイックリファレンス

### 初回

```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
# 納品 ZIP を C:\apps\mhi-app\ に展開
cd C:\apps\mhi-app\app\deploy
.\setup-server.ps1
Import-Module WebAdministration; Stop-Website "Default Web Site"; Start-Website "MhiApp"
```

### アップデート

```powershell
Copy-Item C:\apps\mhi-app\app\backend\.env C:\apps\backend.env.backup -Force
# 新 ZIP を展開して C:\apps\mhi-app\ を上書き（§5-2）
Copy-Item C:\apps\backend.env.backup C:\apps\mhi-app\app\backend\.env -Force
cd C:\apps\mhi-app\app\deploy
.\deploy.ps1
Get-Content C:\apps\mhi-app\RELEASE.txt
```

### 開発側：納品 ZIP 作成

```bash
cd app/deploy && ./make-release.sh
```

### CSV 更新

```powershell
cd C:\apps\mhi-app\app\backend
npm run etl
```

### Service 再起動

```powershell
Restart-Service MhiProgressApi
```

---

## 付録：社内検証で Git を使う場合（先方本番では不要）

AWS 検証など、社内で Git リポジトリを clone している環境では、ソース更新を `git pull` で行えます。

```powershell
cd C:\apps\mhi-app\app\deploy
.\deploy.ps1 -GitPull
```

先方本番サーバーでは **`-GitPull` は使わず**、納品 ZIP による更新（§5）のみ行ってください。
