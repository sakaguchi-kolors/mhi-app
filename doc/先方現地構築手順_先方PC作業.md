# 先方現地構築手順（先方 PC 作業・当日用）

先方 Windows Server は **インターネットに出られない**。Git / Chocolatey / `npm ci` は使わない。  
**自分の Mac は先方社内ネットワークに繋げない。** 現地作業は **先方 PC** から行う。

Mac を社内 LAN に繋いで Windows App で RDP する手順は [先方現地構築手順.md](./先方現地構築手順.md) に残してある。  
詳細なキット作成・検証手順は [オフライン構築手順.md](./オフライン構築手順.md) を参照。

**当日は [当日作業手順](#当日作業手順step-1-から順に実行) の Step 1 から下へ順番に実行する。**  
IT の環境が標準と違うときだけ [考えうるパターンと対応（一覧）](#考えうるパターンと対応一覧) を見る。

---

## この手順の前提（旧手順との違い）

| 項目 | Mac 接続手順（旧） | **この手順** |
|------|-------------------|--------------|
| 自分の Mac | 社内 LAN に接続 | **社内 LAN に繋げない**（持参は CD 準備用） |
| サーバーへの RDP | Mac の Windows App | **先方 PC のリモートデスクトップ（mstsc）** |
| ZIP の運び | Mac フォルダを RDP リダイレクト | **CD を先方に渡して読んでもらう**（先方 PC またはサーバーの光学ドライブ） |
| CSV の運び | Mac の `~/teikyo-csv` を持参 | **持参しない。** 初回はキット同梱 CSV。本番 CSV は先方が置く |
| ブラウザ確認 | Mac の Safari / Chrome | **先方 PC のブラウザ** |
| メモ帳（IP・パスワード） | Mac | **先方 PC**（または紙） |

サーバー上の構築コマンド（Step 13〜15）は旧手順と同じ。

---

## 固定パス（当日はこのパスだけ使う）

| 用途 | 出発前（自宅・Mac） | 先方 PC | サーバー（RDP 接続後） |
|------|---------------------|---------|------------------------|
| オフライン ZIP | `~/Downloads/mhi-app-offline-20260818.zip` | CD（光学ドライブ）、コピー後 `C:\temp\mhi-kit\` | `C:\apps\kit.zip` |
| キット展開先 | — | — | `C:\apps\kit\mhi-app-offline-20260818` |
| CSV 4 ファイル | Mac の `~/teikyo-csv/` にあるが **持参しない** | — | 初回はキット同梱 → `C:\apps\mhi-app\data\csv`。運用は `C:\share\csv\`（先方配置） |
| アプリ設定 | — | — | `C:\apps\mhi-app\app\backend\.env` |

| 確認項目 | 期待値 |
|----------|--------|
| ZIP サイズ | **541069501** bytes |
| ZIP SHA256 | **61DF9904246D5CA07254AFF3FC6C04138496EF073A2534F3D8C49814023C20F7** |

---

## 持っていくもの

| 項目 | 内容 |
|------|------|
| **CD-R（必須）** | ZIP のみ。先方に渡して **光学ドライブで読んでもらう** |
| **USB** | **不要**（CSV は持参しない） |
| **この手順書** | 印刷または PDF（オフライン閲覧） |
| **Mac** | 出発前の Hash 確認・CD 作成用。**現地では社内 LAN に繋がない** |
| **Windows App** | **不要**（先方 PC の mstsc を使う） |

ZIP は **541069501 bytes（約 516 MB）**。CD-R（700 MB）に収まる。DVD でも可。

CD の中身（**今から追加しない。ZIP だけ**）:

```text
CD:\
  mhi-app-offline-20260818.zip
```

CSV 4 ファイル（`FLEXSCHE…` / `OCTPuS…` / `PBS…` / `SHOP_JOB…`）は Mac の `~/teikyo-csv/` にあるが **当日は持っていかない。**  
20260818 キットに同梱されており、`setup-offline.ps1` が `C:\apps\mhi-app\data\csv` へ入れて初回 ETL する。

---

## 当日作業手順（Step 1 から順に実行）

### 出発前（自宅・Mac）

**Step 1.** `~/Downloads/` に ZIP があることを確認する

```bash
ls -l ~/Downloads/mhi-app-offline-20260818.zip
```

表示されるサイズが **541069501** であること。

**Step 2.** Hash を確認する

```bash
shasum -a 256 ~/Downloads/mhi-app-offline-20260818.zip
```

表示が **61DF9904246D5CA07254AFF3FC6C04138496EF073A2534F3D8C49814023C20F7** であること。

**Step 3.** 空の **CD-R** に ZIP を焼く

1. 空の CD-R を Mac に入れる（光学ドライブが無い機種は USB SuperDrive 等）
2. Finder で `~/Downloads/mhi-app-offline-20260818.zip` を CD アイコンへドラッグ
3. ディスクを **書き込む（Burn）**
4. 書き込み後、CD を入れ直して ZIP が 1 個だけ見えることを確認する

DVD-R でもよい。USB メモリは不要。

**Step 4.** CSV は **持参しない**（Mac の `~/teikyo-csv/` にあっても USB / CD に入れない）。初回取込はキット同梱分。飛ばして Step 5 へ。

**Step 5.** この手順書を印刷する、または PDF を手元に置く。Windows App はインストールしなくてよい。

---

### 現地（先方 IT と合流・先方 PC を使う）

**Step 6.** 先方 IT から次を聞き、**先方 PC のメモ帳**（または紙）に書く

1. サーバー IP アドレス（例: `10.20.30.40`）
2. 管理者ユーザー名
3. 管理者パスワード
4. 先方 PC からサーバーへ RDP（3389）が通るか
5. ブラウザ確認用に 80 番が先方 PC から通るか
6. **CD を読む場所** — 先方 PC の光学ドライブか、サーバー本体か

VPN が必要なら、この Step の前に **先方 PC 上で** IT の指示どおり VPN を接続する。  
自分の Mac は社内 LAN / VPN に繋げない。

**Step 7.** 作業用の **先方 PC** にログインする（IT に用意してもらう）。自分の Mac は使わない。

**CD（ZIP）を先方に渡して読んでもらう。** 光学ドライブは先方 PC を優先する（無ければサーバー本体 → [CD 直挿し](#zip-の別ルートcd-直挿し)）。

先方 PC のエクスプローラーで CD 内に `mhi-app-offline-20260818.zip` が見えることを確認する。CD は読み取り専用でコピーも遅いので、**先にディスクへコピー**する。

先方 PC の PowerShell でドライブを確認する（CD は多くの場合 `D:`）:

```powershell
Get-PSDrive -PSProvider FileSystem
```

以降、CD が `D:` なら `D:`、違う文字なら読み替える。

```powershell
mkdir C:\temp\mhi-kit -Force
copy D:\mhi-app-offline-20260818.zip C:\temp\mhi-kit\
dir C:\temp\mhi-kit
```

コピーに **数分〜十数分** かかることがある。終わったら Length が **541069501** であること。

CSV 用 USB は挿さない。先方 PC に光学ドライブが無い、または CD を読めない → [CD 直挿し](#zip-の別ルートcd-直挿し)。

---

### RDP 接続（先方 PC → サーバー）

**Step 8.** 先方 PC で **リモートデスクトップ接続** を開く

スタートメニューで「リモートデスクトップ」と検索するか、`Win + R` → `mstsc` → Enter。

| 設定項目 | 入力する値 |
|----------|-----------|
| コンピューター | Step 6 でメモした **サーバー IP** |
| オプション表示 → ローカルリソース → **詳細** | コピー先の **`C:`** にチェック |
| 資格情報 | Step 6 の **管理者ユーザー名 / パスワード**（接続後に聞かれたら入力） |

**接続** する。証明書警告が出たら **はい**。

接続できない、または先方に **「RDP は通らない」** と言われた → [RDP 通らないとき](#rdp-通らないとき)。Step 8 を無理に通さない。

ドライブにチェックが入っていないと、サーバーから `C:\temp\mhi-kit` が見えない。CD は Step 7 でディスクへコピー済みなら、RDP 中は取り出してよい。

**Step 9.** （この手順では Mac の Windows App は使わない。Step 8 の mstsc で接続する。RDP 不可なら飛ばして [RDP 通らないとき](#rdp-通らないとき) へ。）

**Step 10.** 接続後の画面

- **黒画面に数字メニュー（SConfig）** → `15` と入力 → Enter
- **デスクトップが見える** → スタート → **Windows PowerShell** → **管理者として実行**

---

### サーバーに ZIP を置く（RDP 内 PowerShell）

**Step 11.** リダイレクトされたドライブを確認してからコピーする

```powershell
reg add HKCU\Console /v QuickEdit /t REG_DWORD /d 0 /f
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
net use
Get-PSDrive -PSProvider FileSystem
```

`\\tsclient\C` が見える。先方 PC の `C:\temp\mhi-kit` から（Step 7 で CD からコピー済み）:

```powershell
mkdir C:\apps -Force
copy \\tsclient\C\temp\mhi-kit\mhi-app-offline-20260818.zip C:\apps\kit.zip
```

500 MB 超のため **5〜15 分** かかる。RDP を切らない。  
`\\tsclient\` が見えない・コピーが失敗する → 先方に CD を **サーバー** で読んでもらう（[CD 直挿し](#zip-の別ルートcd-直挿し)）。

**Step 12.** 整合性を確認する

```powershell
(Get-Item C:\apps\kit.zip).Length
Get-FileHash C:\apps\kit.zip -Algorithm SHA256
```

| 項目 | 期待値 |
|------|--------|
| Length | **541069501** |
| SHA256 | **61DF9904246D5CA07254AFF3FC6C04138496EF073A2534F3D8C49814023C20F7** |

一致しなければ Step 11 からやり直す（CD をサーバーで読む場合は [CD 直挿し](#zip-の別ルートcd-直挿し)）。

---

### 初回構築（RDP 内 PowerShell）

**Step 13.** 以下をコピペして実行する

```powershell
mkdir C:\apps\kit -Force
tar -xf C:\apps\kit.zip -C C:\apps\kit
cd C:\apps\kit\mhi-app-offline-20260818
.\setup-offline.ps1
```

- **20〜30 分** かかる
- 完了メッセージ: **`Setup complete (offline).`**
- 表示された **PostgreSQL パスワード** と **Basic 認証（ユーザー `mhi` / パスワード）** を **先方 PC のメモ帳**（または紙）に書く
- RDP を切らない

**Step 13.5.** 初回 DB 補完（**必須・構築時 1 回だけ**）

**画面からは直せない。** 20260818 キットのパラメータ保存は行が無いと Network が出ない。検査 ◎ は SHOP_JOB 全件にルール適用が必要で、手で ◎ を付けるのは現実的でない。  
**CD にもスクリプトは入っていない**（キットに `ensure-m-param.ps1` も無い）。先方 PC ではコピペできないので、**印刷したこの手順を見て手打ち**する。

`setup-offline.ps1` 内の初回処理は **seed が ETL より先** のため、次が欠ける。

| 不足 | 症状 |
|------|------|
| `m_param`（`SHOP_LT_DAYS` 等） | パラメータ設定の保存が効かない |
| `m_milestone`（検査 ◎） | 中間マイルストン定義がすべて空、部品詳細に `▼検査` タグなし |

管理者 PowerShell で、次を **上から 1 ブロックずつ** 打つ（日本語は打たない）。

```powershell
cd C:\apps\mhi-app\app\backend
```

```powershell
Get-Content .env | ForEach-Object { if ($_ -match '^PGPASSWORD=(.+)$') { $env:PGPASSWORD=$Matches[1] } }
```

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U mop -d mop -h localhost -c "INSERT INTO m_param(key,value) VALUES('SHOP_LT_DAYS','4'),('MILESTONE_LT_DAYS','5'),('STAGNANT_THRESHOLD','10'),('BUFFER_GREEN','1'),('BUFFER_YELLOW','0') ON CONFLICT(key) DO NOTHING;"
```

```powershell
npm run seed
```

```powershell
npm run recompute
```

IT に打ってもらうときは、この 5 ブロックを読み上げる。

- 1〜3 … `SHOP_LT_DAYS` 等（ASCII のみ。`description` は触らない）
- `npm run seed` … 検査 ◎ を `m_milestone` に投入
- `npm run recompute` … 一覧・`▼検査` を反映

**確認**

| 確認項目 | OK の目安 |
|----------|-----------|
| パラメータ | マスタ「パラメータ設定」に Shop LT がある。値を変えて保存できる |
| マイルストン | 中間マイルストン定義で検査系 Shop に ◎ が **多数** 付いている |
| 部品詳細 | X000702855 で `▼検査 期日MM/DD` が 7P31 / 7P32 に表示される |

> **運用上の注意（先方への説明用）**
> - この手順が必要なのは **サーバー初回構築時だけ** です。
> - 一度 DB が整えば、以降の **CSV 差替え・ETL・マスタ画面からの編集・アプリ更新（`deploy-offline.ps1`）** では再実行不要です。
> - **DB を作り直す**ときだけ、再度 Step 13.5 を実行してください。

> **その他**
> - DB ユーザーは Web の Basic 認証 `mhi` ではなく **PostgreSQL の `mop`** です。
> - 日本語 SQL は打たない（`????` になる）。

**INSERT を打ち間違えて `????` になった場合だけ:**

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U mop -d mop -h localhost -c "UPDATE m_param SET description = NULL WHERE key IN ('SHOP_LT_DAYS','MILESTONE_LT_DAYS','STAGNANT_THRESHOLD','BUFFER_GREEN','BUFFER_YELLOW');"
```

（その直前に、上と同じ `Get-Content .env` の 1 行で `$env:PGPASSWORD` を入れてあること）

ブラウザで `/masters/param` を再読み込みする。

**Step 14.** 日本時間に設定する

```powershell
Set-TimeZone -Id "Tokyo Standard Time"
Get-Date
Get-TimeZone
```

`(UTC+09:00) Osaka, Sapporo, Tokyo` と表示されれば OK。

**Step 15.** CSV 取込先を設定する（初回 1 回・サービス再起動あり）

```powershell
mkdir C:\share\csv -Force

$envPath = 'C:\apps\mhi-app\app\backend\.env'
$content = (Get-Content $envPath -Raw) -replace 'CSV_DIR=.*', 'CSV_DIR=C:/share/csv'
$content = $content -replace '(?m)^AS_OF=.*\r?\n', ''
$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($envPath, $content, $utf8)

Restart-Service MhiProgressApi
```

先方 IT が別パス（ファイルサーバー UNC 等）を指定した場合は [CSV パス変更](#csv-パス変更it-指定時) を参照。

---

### ブラウザ確認（先方 PC・RDP ウィンドウではない）

**Step 16.** 先方 PC で **RDP を最小化** し、先方 PC 自身の **Chrome / Edge** を開く（サーバー上のブラウザは使わない）。

**Step 17.** アドレスバーに URL を入力する

Step 6 でメモ帳に書いた IP を使う。

- メモが `10.20.30.40` なら → `http://10.20.30.40/`
- `/setup` 確認時 → `http://10.20.30.40/setup`（IP 部分は同じ）

**Step 18.** 画面を順に確認する

| 順 | 操作 | OK の目安 |
|----|------|-----------|
| 1 | 上記 URL を開く | Basic 認証ダイアログ |
| 2 | ユーザー `mhi` / Step 13 でメモしたパスワード | 通過 |
| 3 | Step 17 と同じ IP で `/setup` を開く | 管理者作成画面 |
| 4 | 管理者を作成 → ログイン | 成功 |
| 5 | 部品一覧 | 表示される |

**Step 19.** 開けない場合 → [困ったら](#困ったら) を見る。80 番 FW は先方 IT に依頼。

---

### CSV（持参しない・キット同梱で初回は済む）

`setup-offline.ps1` がキット同梱 CSV を `C:\apps\mhi-app\data\csv` に入れて ETL 済み。Mac の CSV は使わない。

**Step 20.** 運用フォルダへ、サーバー上の同梱 CSV をコピーする（RDP 内）

```powershell
copy "C:\apps\mhi-app\data\csv\*.csv" C:\share\csv\
dir C:\share\csv
```

4 ファイルがあれば OK。先方 IT が本番 CSV のパスを指定したら、このコピーは飛ばして [CSV パス変更](#csv-パス変更it-指定時)。

**Step 21.** （任意）先方 PC のブラウザでデータ取込 UI を見る

1. **管理者モード** ON
2. **データ取込**
3. 4 ファイルが **問題なし（緑）** なら、取り込む必要はない（初回 ETL 済み）。再取込するなら OCTPuS が大きいと 10〜30 分

先方の本番 CSV が別パス／未配置なら、部品一覧はキット同梱データで確認し、本番取込は先方配置後でよい。

**Step 22.** 完了。先方 IT に引き継ぎ。

- Basic 認証 `mhi` / パスワード
- 管理者アカウント
- CSV パス（標準 `C:\share\csv`）
- 初回だけの Step 13.5 は **運用・CSV 更新では不要** であること

---

## 困ったら

| 症状 | 対処 |
|------|------|
| 先方 PC から RDP つながらない / 「RDP 通らない」と言われた | [RDP 通らないとき](#rdp-通らないとき)。3389 を自分で開けない |
| 黒画面で止まった | `15` → Enter |
| `\\tsclient\` が見えない | Step 8 でドライブにチェックして再接続。ZIP は [CD 直挿し](#zip-の別ルートcd-直挿し) |
| Step 12 の Hash 不一致 | Step 11 やり直し。または [CD 直挿し](#zip-の別ルートcd-直挿し) |
| 先方 PC に光学ドライブが無い / CD を読めない | 先方 IT にサーバー本体で CD を読んでもらう（[CD 直挿し](#zip-の別ルートcd-直挿し)） |
| `tar -xf` 失敗 | Step 12 の Hash が一致しているか確認 |
| `Unexpected token 'Download'` | RDP 内: `cd C:\apps\kit\mhi-app-offline-20260818\staging-mhi-app\app\deploy` → `.\fix-ps1-encoding.ps1` → Step 13 やり直し |
| ブラウザがタイムアウト | 先方 PC からサーバー 80 番が通るか。IT に 80 番開放を依頼 |
| IIS Welcome 画面 | RDP 内 PowerShell: `Import-Module WebAdministration` → `Stop-Website -Name "Default Web Site"` → `Start-Website -Name "MhiApp"` |
| 502 / 真っ白 | RDP 内: `Get-Service MhiProgressApi`（Running か確認） |
| 保存ボタン無反応 | 値を変えたか。`m_param` に行があるか。Step 13.5 未実施 |
| マイルストン ◎ がゼロ / `▼検査` なし | Step 13.5 の `npm run seed` + `npm run recompute` 未実施 |
| CSV 取込が Request aborted | 取込中の切断（multer）。パラメータ保存とは無関係。ARR タイムアウト延長 |

---

## RDP 通らないとき

**構築はサーバー上の管理者 PowerShell で行う。** RDP はその手段のひとつにすぎない。通らなくても、誰かがサーバーで PowerShell を開ければ Step 13 以降は同じ。

先方の「RDP 通らない」は意味が違うことが多い。**次のどれか 1 つ**に落とす。

| # | 先方に聞くこと | 先方の答えの例 | あなたがやること |
|---|----------------|----------------|------------------|
| 1 | 自分の Mac から、という意味か | 外来端末は不可 | **問題ない。** 先方 PC の mstsc で Step 8 |
| 2 | 先方の作業 PC からサーバーへは許可されているか | PC からは可、FW で 3389 だけ閉じている | **IT に依頼:** 作業 PC → サーバーの **3389/TCP を当日だけ開ける**。無理なら #3 へ |
| 3 | 踏み台（ジャンプサーバー）経由なら入れるか | 中継サーバーなら可 | [1-C](#1-c-踏み台ジャンプサーバー経由-rdp)。ZIP は CD を **サーバーで** 読んでもらう |
| 4 | サーバー室・iLO / iDRAC・Hyper-V の画面なら入れるか | コンソールなら可 | [1-D](#1-d-物理コンソールサーバー室) / [1-E](#1-e-ilo--idrac--リモート-kvm) / [1-F](#1-f-hyper-v-等の-vm-コンソール)。ZIP は CD 直挿し |
| 5 | 外来者にサーバー操作を渡さない方針か | 自分たちは触れない | **[1-G](#1-g-it-がサーバー操作あなたは口頭--画面共有) が本線。** 下の読み上げへ |

開けてもらえない・時間がないときは **#5（IT が操作）** に切り替える。3389 を自分で設定しない。

### IT が操作するとき（いちばん多い逃げ道）

1. **CD を IT に渡す** → サーバーの光学ドライブで読み、`C:\apps\kit.zip` にコピー（[CD 直挿し](#zip-の別ルートcd-直挿し)）
2. IT に **管理者 PowerShell** を開いてもらう（Core なら SConfig で `15`）
3. あなたが Step 11〜15・13.5 を **そのまま読み上げ**。IT が貼り付けて実行
4. 双方で確認する: Length **541069501**、SHA256、`Setup complete (offline).`、表示されたパスワードを紙に書く
5. **ブラウザ確認は RDP 不要。** 先方 PC で Step 16〜18（80 番）。80 も不通なら IT に依頼（RDP とは別）

読み上げるコマンドは本文の Step 13〜15 と同じ。先方 PC からサーバーに入れなくても、**画面共有または横に座って**進める。

### ブラウザ（80 番）は RDP と別

RDP が不通でも、先方 PC のブラウザで `http://<サーバーIP>/` が開けば画面確認はできる。  
RDP も 80 も不通なら、構築は IT 操作、確認も IT の PC かサーバー室の別端末。

---

## ZIP の別ルート（CD 直挿し）

先方 PC に光学ドライブが無い、Step 11 の `\\tsclient\` が使えない、または IT がサーバーで読むと指定した場合:

1. **CD を先方 IT に渡し、サーバー本体の光学ドライブで読んでもらう**
2. RDP 内 PowerShell:

```powershell
wmic logicaldisk get name
copy D:\mhi-app-offline-20260818.zip C:\apps\kit.zip
```

`D:` は `wmic` の結果に合わせて変更する（光学ドライブ）。その後 **Step 12** から再開。

CD は読み取り専用。`C:\apps\kit.zip` へコピーしてから Hash を取る。

CSV 用 USB は無い。CSV は Step 20 でキット同梱分を `C:\share\csv` へコピーする。

---

## CSV パス変更（IT 指定時）

先方 IT が `C:\share\csv` 以外を指定した場合、Step 15 の `'CSV_DIR=C:/share/csv'` 部分だけ IT 指定のパスに書き換える。

UNC の例:

```powershell
$content = (Get-Content $envPath -Raw) -replace 'CSV_DIR=.*', 'CSV_DIR=\\fileserver\share\csv'
```

書き換え後は必ず `Restart-Service MhiProgressApi` を 1 回実行する。

---

## どこで何をやるか

**出発前は Mac、現地は先方 PC 1 台 + サーバー RDP で完結する。**

| 作業 | どこで実行 |
|------|-----------|
| Step 1〜5 | **自宅 Mac**（ZIP Hash・CD 作成。CSV は持参しない） |
| Step 6〜8, 16〜18, 21 | **先方 PC**（メモ帳 / mstsc / ブラウザ） |
| Step 10〜15, 20 | **サーバー**（先方 PC からの RDP 画面内 PowerShell） |

先方 PC 上でも `setup-offline.ps1` は実行しない。必ず **サーバー** の PowerShell で実行する。

---

## 考えうるパターンと対応（一覧）

> **標準手順は [Step 1〜22](#当日作業手順step-1-から順に実行) を上から順に実行する。**  
> このセクションは **IT の環境が標準と違うとき** だけ参照する。

当日は **「サーバーへの入り方」×「OS」×「ZIP の渡し方」×「ブラウザ確認」** の組み合わせになる。  
**構築コマンド（Step 13〜15）はどのパターンでも同じ。**

### 早見表

| 区分 | よくあるパターン | あなたがやること | 先方 IT にお願いすること |
|------|-----------------|-----------------|------------------------|
| **入り方** | 先方 PC から直接 RDP | 先方 PC で mstsc | IP・管理者 ID/PW・先方 PC |
| | VPN → RDP | 先方 PC で先に VPN、その後 mstsc | VPN クライアント・ID/PW |
| | 踏み台 → RDP | 先方 PC から踏み台へ RDP → 対象サーバーへ | 踏み台の IP・2 段の ID/PW |
| | 物理コンソール / iLO | IT と一緒にログイン | サーバー室 or KVM URL |
| | IT が操作・口頭指示 | 手順書を読み上げ / 画面共有 | 管理者 PowerShell を開いてもらう |
| **OS** | Server Core | SConfig **`15`** → PowerShell | （特になし） |
| | Desktop あり | スタート → 管理者 PowerShell | （特になし） |
| **ZIP** | CD → 先方 PC で読む → ディスクへコピー → リダイレクト | Step 7〜11 | CD を先方 PC の光学ドライブで読む |
| | CD 直挿し（サーバー） | `copy D:\mhi-app-offline-20260818.zip C:\apps\kit.zip` | CD をサーバーで読む |
| | Box → 社内 PC → サーバー | CD 受取 or 共有経由 | Box DL・サーバーへコピー |
| | IT が事前配置 | Step 12 の Hash 確認だけ | `C:\apps\kit.zip` を置いてもらう |
| **ブラウザ** | 先方 PC（この手順の標準） | Step 17〜21 | 80 番 FW 開放 |
| **CSV** | サーバー上フォルダ | `CSV_DIR=C:/share/csv` | パス合意 |
| | ファイルサーバー UNC | `CSV_DIR=\\fs\share\csv` | サーバーから UNC 読めること |

---

### 1. サーバーへの入り方

#### 1-A. 先方 PC から直接 RDP（この手順の標準）

**条件:** 先方 PC が社内ネットワークにあり、サーバー IP へ **3389/TCP** が通る。

| 手順 | 内容 |
|------|------|
| 1 | 先方 IT から **IP / ホスト名・管理者 ID/PW** と **作業用 PC** をもらう |
| 2 | 先方 PC: **mstsc**（Step 8） |
| 3 | 接続 → Core なら **`15`** → PowerShell → **Step 11 へ** |

**つまずき:** 接続タイムアウト → IP 間違い / 3389 が FW でブロック → **IT に依頼**

---

#### 1-B. VPN 経由で RDP

**条件:** 先方 PC からインターネット経由で先方 VPN に入り、VPN 内から RDP。

| 手順 | 内容 |
|------|------|
| 1 | **先方 PC 上で** VPN クライアントを接続（IT から手順・ID/PW） |
| 2 | VPN 接続中に **1-A と同じ RDP** |
| 3 | **ブラウザ確認も同じ先方 PC・VPN 接続中** に Step 17 を実行 |

**つまずき:** VPN は繋がるが RDP 不可 → VPN セグメントからサーバー 3389 が許可されていない → **IT に依頼**

---

#### 1-C. 踏み台（ジャンプ）サーバー経由 RDP

**条件:** セキュリティ方針で **アプリサーバーへ直接 RDP 不可**。社内の中継サーバー（踏み台）経由のみ。

| 手順 | 内容 |
|------|------|
| 1 | **踏み台** に RDP（例: `jump01.company.local`） |
| 2 | 踏み台のデスクトップ or PowerShell から **対象サーバー** へ再 RDP（`mstsc`） |
| 3 | 対象サーバー上で **Step 11** から実行 |

**ZIP の運び方:** 踏み台にドライブリダイレクトできないことが多い → **CD 直挿し（3-A）** または **IT が Box 経由で配置（3-D）** を選ぶ。

**つまずき:** 踏み台から先へ RDP できない → IT が中継権限・3389 ルールを開ける必要あり

---

#### 1-D. 物理コンソール（サーバー室）

**条件:** RDP 未設定・ネットワーク未接続・初期構築直後など。

| 手順 | 内容 |
|------|------|
| 1 | 先方 IT とサーバー室へ |
| 2 | モニタ・キーボード直結でログイン |
| 3 | Core なら SConfig **`15`** → PowerShell |
| 4 | **CD 直挿し（3-A）** が現実的 |

**あなたの役割:** キーボードを操作するか、IT に PowerShell コマンドを読み上げる。

---

#### 1-E. iLO / iDRAC / リモート KVM

**条件:** 物理サーバーで、ベンダーの **帯域外管理** 画面から操作。

| 手順 | 内容 |
|------|------|
| 1 | IT がブラウザで iLO/iDRAC にログイン → **リモートコンソール** を開く |
| 2 | 画面は **1-D と同じ**（ログイン → PowerShell） |
| 3 | USB 仮想メディアで ISO/ZIP をマウントできる環境もある（IT 作業） |

**あなたの役割:** 多くは IT がコンソールを操作。コマンドは手順書どおり dictation。

---

#### 1-F. Hyper-V 等の VM コンソール

**条件:** アプリサーバーが **仮想マシン**。

| 手順 | 内容 |
|------|------|
| 1 | IT が Hyper-V マネージャー（または vSphere）で VM の **接続** を開く |
| 2 | VM 内でログイン → PowerShell |
| 3 | ZIP は **ホスト共有 → VM** または **USB パススルー**（IT 設定） |

**RDP も通常は使える** → 可能なら **1-A** の方が作業しやすい。

---

#### 1-G. IT がサーバー操作・あなたは口頭 / 画面共有

**条件:** 外来者に RDP 権限を渡せないポリシー。

| 手順 | 内容 |
|------|------|
| 1 | 会議室で IT と並ぶ |
| 2 | IT が管理者 PowerShell を開く |
| 3 | あなたが **Step 11〜15 のコマンドをそのまま読み上げ** |
| 4 | **Hash 値・`Setup complete (offline).`** を双方で確認 |
| 5 | ブラウザ確認は **先方 PC で Step 17〜21** |

**持ち込み:** CD を IT に渡し、光学ドライブで読んで **`C:\apps\kit.zip` 配置 + Hash 確認** まで IT にやってもらう。

---

### 2. OS の種類（Server Core / Desktop）

| | Server Core | Desktop Experience |
|--|-------------|-------------------|
| **見た目** | 黒画面 + SConfig | 普通の Windows デスクトップ |
| **PowerShell** | SConfig **`15`** で起動 | スタート → 管理者 PowerShell |
| **ブラウザ** | **なし** | あっても **使わない**（先方 PC で確認） |
| **エクスプローラー** | なし | あり（ZIP コピーは GUI も可） |
| **setup-offline.ps1** | ✅ 同じ | ✅ 同じ |

**どちらでも構築可能**（AWS 検証は Core）。

---

### 3. ZIP のサーバーへの運び方

#### 3-A. CD をサーバー本体で読んでもらう（確実）

```powershell
# ドライブ確認（光学ドライブは多くの場合 D:）
Get-PSDrive -PSProvider FileSystem
# または
wmic logicaldisk get name

mkdir C:\apps -Force
copy D:\mhi-app-offline-20260818.zip C:\apps\kit.zip

# 必須: 整合性確認（Step 12）
(Get-Item C:\apps\kit.zip).Length
Get-FileHash C:\apps\kit.zip -Algorithm SHA256
```

**向いている入り方:** 1-D, 1-E, 1-G, 先方 PC に光学ドライブが無いとき、踏み台経由で RDP リダイレクト不可のとき

---

#### 3-B. 先方 PC で CD を読む → ディスクへコピー → ドライブリダイレクト（この手順の標準）

| 手順 | 内容 |
|------|------|
| 1 | CD を先方に渡し、先方 PC の光学ドライブで読んでもらう |
| 2 | `C:\temp\mhi-kit` へ ZIP をコピー（Step 7） |
| 3 | mstsc の **ローカルリソース → 詳細 → ドライブ** で `C:` にチェック（Step 8） |
| 4 | 接続後、サーバー PowerShell で QuickEdit 無効化（Step 11 先頭の `reg add`） |
| 5 | `net use` で `\\tsclient\C` を確認 |
| 6 | `copy \\tsclient\C\temp\mhi-kit\mhi-app-offline-20260818.zip C:\apps\kit.zip` |

**注意:** 500 MB 超は **10 分前後**。途中で RDP を切らない。  
`\\tsclient\` ルート一覧が空でも **リダイレクトしたドライブ名** なら OK。

**向いている入り方:** 1-A, 1-B（先方 PC から直接 RDP）

---

#### 3-C. Box → 社内 PC → CD または共有 → サーバー

| 手順 | 内容 |
|------|------|
| 1 | あなたが CD 持参（または IT が Box から DL） |
| 2 | 社内 PC に一度コピー（任意・Hash 確認用） |
| 3 | CD をサーバーで読んでもらう → **3-A** |

---

#### 3-D. Box → 社内 PC → 共有フォルダ → サーバーで copy

| 手順 | 内容 |
|------|------|
| 1 | IT が Box から DL し `\\fileserver\install\kit.zip` 等に配置 |
| 2 | サーバー PowerShell で `copy \\fileserver\install\mhi-app-offline-20260818.zip C:\apps\kit.zip` |
| 3 | Hash 確認 |

**向いている入り方:** 光学ドライブが使えない VM / 厳格なセキュリティ環境

---

#### 3-E. IT が事前に `C:\apps\kit.zip` を配置

| 手順 | 内容 |
|------|------|
| 1 | 事前に CD または Box で IT に渡す |
| 2 | 現地では **Step 12** の Hash 確認だけして **Step 13** へ |

---

### 4. ブラウザ確認（どの PC から見るか）

**原則:** サーバー上では見ない。Step 6 でメモした IP を使い **先方 PC で Step 17** を実行する。

#### 4-A. 先方 PC（この手順の標準）

| 手順 | 内容 |
|------|------|
| 1 | 先方 PC が社内 LAN（または VPN）に接続されていること |
| 2 | **Step 17〜18** を実行 |
| 3 | Basic → `/setup` → ログイン → 部品一覧 |

#### 4-B. ブラウザが開けない（よくあるトラブル）

| 症状 | 原因の可能性 | 対応 |
|------|-------------|------|
| タイムアウト | 先方 PC から 80 番不通 / IP 違い / FW | IT: 80 番許可・正しい IP |
| IIS Welcome | Default Web Site が前面 | [困ったら](#困ったら) の IIS コマンド |
| 502 / 真っ白 | API サービス停止 | `Get-Service MhiProgressApi` → Restart |

---

### 5. CSV の置き場所

| パターン | CSV_DIR の例 | 確認すること |
|----------|-------------|-------------|
| **サーバー上ローカル** | `C:/share/csv` | キット同梱を copy（Step 20）。本番は先方が置く |
| **ファイルサーバー UNC** | `\\fileserver\share\csv` | **サーバーから UNC が読める**（権限・ファイアウォール） |
| **業務システムが自動配置** | IT 指定の UNC | パスを `.env` に書く → **Restart-Service 1 回** |

CSV ファイル名は **4 種固定**。持参しない。初回はキット同梱、運用は先方配置または `C:\share\csv`。

---

### 6. 当日ありがちな組み合わせ例

#### シナリオ A（この手順書の標準）

```text
Step 1〜22 をそのまま実行
入り方:   先方 PC → mstsc（Step 8〜10）
ZIP:      CD を先方 PC で読む → C:\temp\mhi-kit → リダイレクト（Step 7, 11）
ブラウザ: 先方 PC（Step 17）
CSV:      キット同梱 → C:\share\csv（Step 15, 20）。持参しない
```

#### シナリオ B（リダイレクト禁止）

```text
先方 PC から RDP はできるが \\tsclient 不可
ZIP:      [CD 直挿し](#zip-の別ルートcd-直挿し) → Step 12 から
CSV:      キット同梱（Step 20）
ブラウザ: 先方 PC → Step 17〜21
```

#### シナリオ C（踏み台・厳格環境）

```text
先方 PC → 踏み台 RDP → 対象サーバー RDP（1-C）
ZIP:      [CD 直挿し](#zip-の別ルートcd-直挿し) → Step 12 から
ブラウザ: 先方 PC（4-A）→ Step 17〜21
CSV:      [CSV パス変更](#csv-パス変更it-指定時)
```

#### シナリオ D（権限渡せない）

```text
IT が操作（1-G）→ Step 11〜15 を読み上げ
ZIP:      CD を IT に渡して読んでもらう
ブラウザ: 先方 PC → Step 17〜21
```

---

### 7. IT 環境が標準と違うときの確認事項

1. **入り方** — Step 8 で RDP できない → VPN / 踏み台 / IT 操作（1-B, 1-C, 1-G）
2. **ZIP** — Step 11 が失敗 → [CD 直挿し](#zip-の別ルートcd-直挿し)
3. **ブラウザ** — Step 17 がタイムアウト → IT に 80 番 FW
4. **CSV** — `C:\share\csv` 以外 → [CSV パス変更](#csv-パス変更it-指定時)

→ 上記以外は **Step 1 から順に実行** する。

---

## 先方 IT への事前確認（出発前）

現地 Step 6 で聞く内容を事前に取り付けると当日がスムーズ。

1. **作業用の先方 PC** — 自分の Mac は社内 LAN に繋げない
2. **サーバー IP** — Step 8 のコンピューター名に使う
3. **管理者ユーザー / パスワード** — Step 8 の資格情報に使う
4. **先方 PC から 3389 / 80 が通るか**
5. **CD を先方 PC またはサーバーの光学ドライブで読めるか**（読めないなら IT 事前配置）
6. **本番 CSV の置き場所** — 標準は `C:\share\csv`。違う場合は [CSV パス変更](#csv-パス変更it-指定時)。自分では CSV を持ってこない
7. **VPN の要否** — 必要なら先方 PC 上で Step 6 の前に接続

IT 環境が標準と違う場合: [考えうるパターンと対応（一覧）](#考えうるパターンと対応一覧)

---

## 2 回目以降のアップデート

新しいオフラインキットを展開して:

```powershell
cd C:\apps\kit\mhi-app-offline-20260818
.\deploy-offline.ps1
Get-Content C:\apps\mhi-app\RELEASE.txt
```

新しいキットを受け取ったら、フォルダ名 `mhi-app-offline-20260818` を新キットの名前に読み替える。

`.env` は `deploy-offline.ps1` が自動退避・復元する。  
**Step 13.5 は不要**（DB 作り直し時のみ再実行）。

---

## 検証済み環境（2026-08-18）

検証は **Mac → RDP** で実施した。サーバー上の構築コマンドは同じ。先方 PC + mstsc は未検証だが、ZIP 配置以外は同一。

| 項目 | 結果 |
|------|------|
| Mac → RDP → `setup-offline.ps1` 一発 | ✅（検証環境。現地は先方 PC の mstsc に読み替え） |
| RDP フォルダ / ドライブリダイレクト → ZIP copy | ✅（Mac 側で確認。先方 PC の mstsc でも同じ `\\tsclient\`） |
| ブラウザ → 画面確認（LAN 経由） | ✅（現地は先方 PC のブラウザ） |
| CSV 同梱キット（初回 ETL エラーなし） | ✅ |
| `C:\share\csv` からデータ取込 | ✅ |
| タイムゾーン JST | ✅ |
| Server Core（PowerShell のみ） | ✅ |
| Step 13.5（`m_param` / `m_milestone` 補完） | ✅（検証環境で実施済み） |
