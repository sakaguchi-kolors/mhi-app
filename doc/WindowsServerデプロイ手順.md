# Windows Server デプロイ手順

AWS 検証環境で実際に構築した手順をもとに、**先方 Windows Server への初回デプロイ**と**機能アップデート**の手順をまとめたものです。

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
| GitHub | ソース管理 |

認証は **アプリ内ログイン（JWT）**。AD 連携は不要。

---

## 2. 先方環境の事前確認（デプロイ前チェックリスト）

先方 IT 担当者に以下を確認してください。

| 項目 | 内容 |
|------|------|
| OS | Windows Server 2019 または 2022 |
| RDP 接続 | VPN 経由か、接続先 IP / アカウント |
| インターネット | `git clone` / `npm ci` / Chocolatey が使えるか |
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

## 3. 初回デプロイ（先方 Windows Server）

### 3-1. サーバーへ RDP 接続

Mac から **Windows App**（旧 Microsoft Remote Desktop）で接続。

| 項目 | 値 |
|------|-----|
| PC name | 先方から指定された IP / ホスト名 |
| Username | 先方から指定されたアカウント |
| Password | 先方から指定されたパスワード |

### 3-2. 管理者 PowerShell を開く

1. スタート → `powershell` と入力
2. **Windows PowerShell** を **右クリック** → **管理者として実行**
3. タイトルに `管理者:` と表示されていることを確認

### 3-3. 実行ポリシー設定（初回のみ）

```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```

`Y` + Enter

### 3-4. ソースコード取得

**Git が使える場合（推奨）**

```powershell
mkdir C:\apps -Force
cd C:\apps
git clone https://github.com/sakaguchi-kolors/mhi-app.git
cd mhi-app\app\deploy
```

**Git が使えない場合（非推奨）**

1. 開発 PC から GitHub の ZIP をダウンロード
2. `C:\apps\mhi-app\` に展開

```powershell
cd C:\apps\mhi-app\app\deploy
```

> **注意:** ZIP 展開だけだと `.git` がなく、後から `git pull` できません。  
> `deploy.ps1` は `Skipping git pull (not a git repo)` と表示して**手元の古いソースを再ビルドするだけ**になります。  
> 初回から `git clone` を推奨します。既に ZIP 配置済みの場合は [4-5. Git リポジトリがない場合](#4-5-git-リポジトリがない場合) を参照してください。

### 3-5. 初回セットアップ実行

```powershell
.\setup-server.ps1
```

**10〜20 分** かかります。以下を自動実行します。

| 処理 | 内容 |
|------|------|
| Chocolatey | パッケージ管理 |
| Node.js 20 LTS | API 実行環境 |
| Git | ソース更新用 |
| PostgreSQL 18 | DB |
| NSSM | Windows Service 管理 |
| IIS + URL Rewrite + ARR | Web サーバー |
| DB 作成 | `mop` DB / `mop` ユーザー |
| `.env` 生成 | JWT_SECRET 自動生成 |
| Windows Service | `MhiProgressApi` 登録 |
| IIS サイト | `MhiApp`（port 80） |
| 初回デプロイ | build + migrate + seed + etl |

#### オプション

```powershell
# Basic 認証を付けない（社内 VPN 内のみ等）
.\setup-server.ps1 -SkipBasicAuth

# PostgreSQL を別途用意している場合
.\setup-server.ps1 -SkipPostgresInstall
```

### 3-6. IIS 初期画面が出る場合（よくある）

デプロイ成功後も IIS の「Welcome」画面が出ることがあります。

```powershell
Import-Module WebAdministration
Stop-Website -Name "Default Web Site"
Start-Website -Name "MhiApp"
```

### 3-7. 本番用 `.env` 調整

`C:\apps\mhi-app\app\backend\.env` を編集します。

| キー | 本番での設定 |
|------|-------------|
| `DATABASE_URL` | 先方 DB 接続情報 |
| `CSV_DIR` | 本番 CSV 共有フォルダ（例: `D:\share\csv`） |
| `JWT_SECRET` | setup 時に自動生成済み（変更不要推奨） |
| `COOKIE_SECURE` | HTTPS 化後は `true` |
| `AS_OF` | 本番は ETL 実行日に合わせる |

編集後:

```powershell
Restart-Service MhiProgressApi
```

### 3-8. 動作確認

1. ブラウザで `http://<サーバーIP>/` にアクセス
2. 初回: `/setup` で管理者アカウント作成
3. ログイン → 部品一覧・マスタが表示されること

API 単体確認（サーバー内）:

```powershell
Invoke-RestMethod http://127.0.0.1:8787/api/auth/setup
```

---

## 4. 機能アップデート（2 回目以降）

### 4-1. 全体フロー

```text
Mac で開発・ローカル確認
        │
        ▼
GitHub に push（main ブランチ）
        │
        ▼
先方 Windows Server に RDP 接続
        │
        ▼
.\deploy.ps1 を実行
        │
        ▼
ブラウザで動作確認
```

### 4-2. アップデート手順（サーバー側）

管理者 PowerShell で:

```powershell
cd C:\apps\mhi-app\app\deploy
.\deploy.ps1
```

`deploy.ps1` が行うこと:

```text
git pull（.git がある場合のみ。なければスキップ）
  → Windows Service 停止（Prisma DLL ロック解除）
  → backend:  npm ci → build → prisma migrate deploy
  → frontend: npm ci → build
  → C:\inetpub\mhi へフロント配置
  → Windows Service 再起動
  → API ヘルスチェック
```

**5〜10 分** 程度。ダウンタイムは Service 再起動の **数秒** です。

> **`Deploy complete` だけでは反映確認にならない**  
> コンソールに `Skipping git pull (not a git repo)` が出ていた場合、ソースは更新されていません。  
> [4-6. 反映確認](#4-6-反映確認) を必ず実施してください。

#### Git を使わない場合（ソースを手動で上書きしたとき）

1. 新しいソースを `C:\apps\mhi-app\` に上書きコピー（`backend\.env` は消さない）
2. 実行:

```powershell
cd C:\apps\mhi-app\app\deploy
.\deploy.ps1 -SkipGitPull
```

### 4-3. DB マイグレーションについて

`deploy.ps1` 内で `prisma migrate deploy` が自動実行されます。

- 新しいテーブル・カラム追加 → **自動適用**
- 既存データは原則保持
- マイグレーション失敗時は `api.err.log` を確認

### 4-4. CSV データの更新

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

### 4-5. Git リポジトリがない場合

初回を ZIP 展開したなどで `C:\apps\mhi-app` に `.git` がないと、`git pull` は使えません。  
**既存フォルダを Git 化して最新 `main` を取得する**方法（`.env` を保持）:

```powershell
cd C:\apps
Stop-Service MhiProgressApi -Force
Stop-Website -Name MhiApp -ErrorAction SilentlyContinue

Copy-Item C:\apps\mhi-app\app\backend\.env C:\apps\backend.env.backup -Force

cd C:\apps\mhi-app
git init
git remote add origin https://github.com/sakaguchi-kolors/mhi-app.git
git fetch origin
git checkout -f -B main origin/main

Copy-Item C:\apps\backend.env.backup C:\apps\mhi-app\app\backend\.env -Force

cd app\deploy
.\deploy.ps1

Start-Website -Name MhiApp
```

`git remote add origin` で「already exists」と出た場合:

```powershell
git remote set-url origin https://github.com/sakaguchi-kolors/mhi-app.git
git fetch origin
git checkout -f -B main origin/main
```

**別フォルダへ clone し直す場合**（`Rename-Item` で「in use」が出るときはこちら）:

1. `C:\apps\mhi-app` 内で開いている PowerShell をすべて閉じる
2. Service / IIS サイトを停止してから実行:

```powershell
cd C:\apps
Stop-Service MhiProgressApi -Force
Stop-Website -Name MhiApp -ErrorAction SilentlyContinue

Copy-Item C:\apps\mhi-app\app\backend\.env C:\apps\backend.env.backup -Force

git clone https://github.com/sakaguchi-kolors/mhi-app.git mhi-app-new
Copy-Item C:\apps\backend.env.backup C:\apps\mhi-app-new\app\backend\.env -Force

Rename-Item C:\apps\mhi-app C:\apps\mhi-app.old
Rename-Item C:\apps\mhi-app-new C:\apps\mhi-app

cd mhi-app\app\deploy
.\deploy.ps1
Start-Website -Name MhiApp
```

### 4-6. 反映確認

デプロイ後、**ブラウザのキャッシュ清除だけでは不十分**なことがあります。サーバー側で次を確認:

```powershell
# ソースが最新か
cd C:\apps\mhi-app
git log -1 --oneline

# 配信 JS が新ビルドか（ファイル名ハッシュが deploy 前後で変わる）
dir C:\inetpub\mhi\assets\index-*.js
Select-String -Path C:\inetpub\mhi\assets\index-*.js -Pattern "保留だけ表示"
```

ブラウザでは、サイドバー・機能が期待どおりか確認（例: 旧 UI の「ユーザー管理」が消えている、保留フィルタが「保留だけ表示」になっている等）。

---

## 5. 開発側の日常フロー（参考）

```text
1. Mac で機能開発
2. ローカル確認（docker compose + npm run dev）
3. git commit → git push（GitHub main）
4. 検証環境（AWS）で .\deploy.ps1 → 確認
5. 問題なければ先方サーバーでも .\deploy.ps1
```

### ブランチ運用（推奨）

| ブランチ | 用途 |
|---------|------|
| `main` | 本番・先方サーバーにデプロイ |
| `develop` | 開発中（任意） |
| `feature/*` | 機能開発 |

先方サーバーでは **`main` のみ** `deploy.ps1` する運用がシンプルです。

---

## 6. HTTPS 化（本番推奨）

1. 先方のドメイン / 証明書を IIS に設定
2. `backend\.env` で `COOKIE_SECURE=true`
3. `Restart-Service MhiProgressApi`

---

## 7. ディレクトリ構成

```text
C:\apps\mhi-app\
  app\
    backend\              NestJS + .env + Prisma
    frontend\             React ソース
    deploy\
      setup-server.ps1    初回セットアップ
      deploy.ps1          アップデート
      web.config          IIS 設定
    sample-data\          サンプル CSV
  data\csv\               取込 CSV（検証用。本番は CSV_DIR で指定）
  logs\
    api.out.log           API 標準出力
    api.err.log           API エラー

C:\inetpub\mhi\           IIS 配信（frontend/dist + web.config）
```

---

## 8. トラブルシュート

| 症状 | 対処 |
|------|------|
| deploy 成功したが画面が古い | `git log -1` / `Skipping git pull` の有無を確認 → [4-5](#4-5-git-リポジトリがない場合) |
| `fatal: not a git repository` | `.git` がない → [4-5](#4-5-git-リポジトリがない場合) で Git 化または clone し直し |
| `Rename-Item ... because it is in use` | `mhi-app` 内の PowerShell を閉じ、Service / IIS 停止後に再実行 → [4-5](#4-5-git-リポジトリがない場合) |
| `npm EPERM ... query_engine-windows.dll.node` | `Stop-Service MhiProgressApi -Force` してから `deploy.ps1`（スクリプト内でも停止するが、手動停止で確実に） |
| `Restart-Service : Failed to start` | `logs\api.err.log` を確認。backend の `npm ci` / `build` 失敗時に起きやすい |
| IIS 初期画面（Welcome） | `Stop-Website "Default Web Site"` → `Start-Website "MhiApp"` |
| 502 / API 不通 | `Get-Service MhiProgressApi` / `logs\api.err.log` |
| ログインできない | HTTPS 化後は `COOKIE_SECURE=true` に |
| DB 接続エラー | `backend\.env` の `DATABASE_URL` / PostgreSQL サービス状態 |
| `/api` 404 | URL Rewrite + ARR が入っているか |
| deploy 失敗 | PowerShell を**管理者**で開き直す |
| npm / git ない | PowerShell を**閉じて開き直す**（PATH 反映） |
| Basic 認証エラー | `setup-server.ps1 -SkipBasicAuth` で再実行、または手動設定 |

### ログ確認

```powershell
Get-Content C:\apps\mhi-app\logs\api.err.log -Tail 50
Get-Service MhiProgressApi
Get-Website
```

---

## 9. AWS 検証環境との違い

| 項目 | AWS 検証 | 先方本番 |
|------|---------|---------|
| 接続 | RDP（パブリック IP） | RDP（VPN + 社内 IP） |
| URL | `http://<Elastic-IP>/` | 社内 URL / ドメイン |
| Basic 認証 | 付与（URL ゲート） | 任意（VPN 内なら省略可） |
| CSV | `C:\apps\mhi-app\data\csv` | 共有フォルダ |
| HTTPS | 後から設定 | 先方証明書を使用 |
| ETL | 手動 | タスクスケジューラ |

**デプロイコマンド（`setup-server.ps1` / `deploy.ps1`）は同一** です。

---

## 10. クイックリファレンス

### 初回

```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
cd C:\apps
git clone https://github.com/sakaguchi-kolors/mhi-app.git
cd mhi-app\app\deploy
.\setup-server.ps1
Import-Module WebAdministration; Stop-Website "Default Web Site"; Start-Website "MhiApp"
```

### アップデート

```powershell
cd C:\apps\mhi-app\app\deploy
.\deploy.ps1
git log -1 --oneline   # 反映確認（任意）
```

`.git` がない場合は §4-5 を参照。

### CSV 更新

```powershell
cd C:\apps\mhi-app\app\backend
npm run etl
```

### Service 再起動

```powershell
Restart-Service MhiProgressApi
```
