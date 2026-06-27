# my_garden_proj — Claude引き継ぎメモ

## プロジェクト概要

Djangoベースの畑管理アプリ。個人の農地（7m×18m）を10cm単位のグリッドで管理する。
ConoHa VPS（Nginx + Gunicorn + PostgreSQL）にデプロイ済み。GitHub Actions CI/CD。

---

## フィールド仕様

- **広さ**: 7m × 18m（70マス × 180マス、10cm単位）
- **畝**: 幅80cm（8マス）、畝間40cm（4マス）、計15本
- **畝方向**: 18m方向に並ぶ、各畝の長さ7m

---

## モデル設計方針（リファクタリング済み）

### 最重要：Plotテーブルを廃止する

旧設計では`Plot`（10cm×10cmの最小単位）をDBレコードとして持っていたが、
7m×18m = 1,260レコードがエリアごとに生成されて無駄が多い。

**新方針：座標を4整数で持つ**

```python
row_start = models.PositiveSmallIntegerField()
col_start = models.PositiveSmallIntegerField()
row_end   = models.PositiveSmallIntegerField()
col_end   = models.PositiveSmallIntegerField()
```

- 単位は10cm（例：50cm = 5マス）
- `PositiveSmallIntegerField`で十分（最大32767、180マスに対して余裕あり）
- `Bed`もAreaの中の座標範囲として同じ方式で表現

### 各モデルの座標フィールド

`Crop`、`Bed`、`SoilStatusArea`、`MaintenanceLog`すべてに
`row_start, col_start, row_end, col_end`を持たせる。

### 重複チェックの方針

- **DBレベルの重複制約はなし**（混植を許容するため）
- アプリ側でチェックして**UIで警告のみ**
- 混植（コンパニオンプランツなど）は想定内

```python
def get_overlapping_crops(area, row_start, col_start, row_end, col_end, exclude_id=None):
    qs = Crop.objects.filter(
        area=area,
        status='growing',
        row_start__lte=row_end,
        row_end__gte=row_start,
        col_start__lte=col_end,
        col_end__gte=col_start,
    )
    if exclude_id:
        qs = qs.exclude(id=exclude_id)
    return qs
```

---

## VegetableTypeの追加フィールド（連作チェック用）

```python
rotation_years     = models.PositiveSmallIntegerField("連作回避年数", default=3)
rotation_buffer_cm = models.PositiveSmallIntegerField("影響半径(cm)", default=50)
```

### 科ごとの目安

| 科 | 代表作物 | 回避年数 | 影響半径 |
|---|---|---|---|
| ナス科 | トマト・ナス・ピーマン | 3〜4年 | 50cm |
| ウリ科 | キュウリ・カボチャ | 2〜3年 | 40cm |
| アブラナ科 | キャベツ・大根 | 1〜2年 | 30cm |
| マメ科 | エダマメ・インゲン | 1〜2年 | 30cm |
| セリ科 | ニンジン・パセリ | 3〜4年 | 30cm |

### 連作チェックのロジック

```python
def get_rotation_warnings(area, veg_type, row_start, col_start, row_end, col_end):
    buffer = veg_type.rotation_buffer_cm // 10  # cmをマスに変換
    years  = veg_type.rotation_years
    since  = date.today() - timedelta(days=365 * years)

    return Crop.objects.filter(
        area=area,
        vegetable_type__family=veg_type.family,
        harvested_at__gte=since,
        row_start__lte=row_end   + buffer,
        row_end__gte=  row_start - buffer,
        col_start__lte=col_end   + buffer,
        col_end__gte=  col_start - buffer,
    )
```

---

## 植え付け方法

`VegetableType.planting_method`で3種類を管理：

```python
PLANTING_METHOD_CHOICES = [
    ("individual", "1株ずつ"),
    ("row", "筋蒔き"),
    ("block", "まとめ植え"),
]
```

| 植付方法 | 例 | 範囲指定 | 株間 |
|---|---|---|---|
| `individual` | トマト、ナス | 1点クリック×株数 | バリデーションあり |
| `row` | ニンジン、小松菜 | 始点→終点で範囲 | 条の本数・幅で管理 |
| `block` | ニンニク、球根類 | 始点→終点で範囲 | 範囲内に格子状に自動配置 |

UIのフローも植え付け方法で分岐する：
- `individual` → 株の位置を1点クリック × 株数
- `row` → 始点→終点で範囲指定
- `block` → 始点→終点で範囲指定、株間に基づき格子状に自動配置

---

## UIの設計方針

### 開発フェーズ

- **現在はPC（マウス操作）を優先して作り込む**
- スマホ対応は後フェーズで対応（2タップ方式などに変換）
- PCで操作感を固めてからスマホ向けに変換する設計にしておく

### 2モード構成

1. **俯瞰モード**（全体ビュー）
   - 4pxセルで7m×18mを全体表示
   - 作物のある場所を野菜ごとの色で表示（何が植わってるかわかる）
   - 畝をクリックで編集モードへ

2. **編集モード**（畝詳細ビュー）
   - 選んだ畝だけ36pxセルで拡大表示
   - 上部に0m〜7mのスケール表示
   - 植え付けフロー：野菜選択 → 始点クリック → 終点クリック → 警告確認 → 植え付け

### 畝・作物の操作（PC向け）

**畝のリサイズ・移動**
- クリックで選択 → 端・角にハンドルが出る
- ハンドルをドラッグでリサイズ
- 畝の中央をドラッグで移動
- Figma/Photoshopと同じ操作感を目指す

**「前回と同じ位置」問題**
- 畝追加モードで過去の畝をゴースト（薄い色）表示
- ゴーストをクリックしたらその位置に新しい畝を生成

**作物の移動**
- PCではドラッグ&ドロップで移動
- スマホでは長押し→タップで移動（後フェーズ）

### 植え付け時の確認フロー

1. 重複チェック → 「○○と混植になりますがよいですか？」
2. 連作チェック → 「3年前にここでトマトを育てています」
3. 株間バリデーション → 「株間が狭いです（推奨50cm）」
4. すべて警告のみ、禁止はしない

---

## トップページ（garden/）の設計方針

### ダッシュボード構成

- `garden/`はダッシュボードとして機能する
- 複数の`GardenArea`をタブで切り替えて俯瞰図を表示
- タブ例：「南側の畑」「第1圃場」など

### 日付セレクター

- ページ上部に日付セレクター（DateSelector）を配置
- 選択した日付の畑の状態を俯瞰図に反映する
- **表示ルール**：開始日〜終了日の範囲内にあるものだけ表示する
- デフォルトは今日の日付
- 過去の日付を選ぶと「あの日の畑」が再現できる（2021年からの記録あり）

| モデル | 開始日 | 終了日 |
|---|---|---|
| `Bed` | `created_at` | `deleted_at`（nullなら現在も有効） |
| `Crop` | `planted_at` | `harvested_at`（nullなら栽培中） |
| `SoilStatusArea` | `start_date` | `end_date`（nullなら継続中） |

### バックエンドのクエリ例

```python
def get_active_crops(area, target_date):
    return Crop.objects.filter(
        area=area,
        planted_at__lte=target_date,
    ).filter(
        models.Q(harvested_at__isnull=True) |
        models.Q(harvested_at__gte=target_date)
    )

def get_active_beds(area, target_date):
    return Bed.objects.filter(
        area=area,
        created_at__lte=target_date,
    ).filter(
        models.Q(deleted_at__isnull=True) |
        models.Q(deleted_at__gte=target_date)
    )
```

### UIの動作

1. 日付を変更 → APIに日付を渡す → 俯瞰図を再描画
2. デフォルトは今日の日付
3. 過去の日付を選ぶと「あの日の畑」が再現できる

---

## DBについて

- 既存データはテストデータのみ → **DBリセットして作り直しOK**
- `Plot`テーブルへの依存（ManyToMany等）をすべて座標方式に置き換える
- マイグレーションは最初からやり直す

---

## 技術スタック

- Django（バックエンド）
- PostgreSQL（ConoHa VPS上でlocalhost運用）
- Nginx + Gunicorn（ConoHa VPS）
- JavaScript（フロントエンド、クラスベースでリファクタリング済み）
  - `GardenEditor`, `GardenAPI`, `GardenController`等のクラス構成
- GitHub Actions（CI/CD）

---

## プロジェクト構成

```
my_garden_proj/          ← VSCodeのルート、CLAUDE.mdはここ
├── .github/
├── .venv/               ← 仮想環境（.venv統一）
├── accounts/
├── calendar_app/
├── config/              ← Django設定（settings.py, urls.py等）
├── crops/               ← 旧app（廃止予定）
├── garden/              ← 新app
├── media/
├── templates/
├── manage.py
└── requirements.txt
```

---

## appのリファクタリング方針

- 旧app `crops` は廃止して新app `garden` に刷新する
- 手順：
  1. `python manage.py startapp garden`
  2. 新`models.py`を座標方式で書く
  3. `settings.py`に`garden`を追加
  4. `migrate`
  5. views/urls/templatesを`garden`に新規作成
  6. 動作確認後に`crops`を`INSTALLED_APPS`から削除
  7. `crops`フォルダを削除
- `accounts`や`calendar_app`が`crops`に依存している可能性があるため、削除前に依存関係を確認すること

---

## 仮想環境

- `.venv`（ドットあり）で統一する
- VSCodeが自動検出してくれる
- 参考：ひじり館（hijirican）は`venv`（ドットなし）のまま運用中。混在しているが意図的。

---

## DBの移行方針

- 既存の`db.sqlite3`はそのまま残す（触らない）
- 新しいDBを以下の手順で作り直す：
  1. `crops`appの既存マイグレーションファイルは削除
  2. 新app `garden`のマイグレーションを最初から作成
  3. ローカル：`db.sqlite3`を削除して`migrate`し直す
  4. 本番PostgreSQL：既存テーブルをdropして`migrate`
- 既存データはテストデータのみなので消えても問題なし

---

## 単位の統一方針

**すべてcm単位でDBに保存する。マス変換はロジック側で行う。**

| フィールド | 単位 | 例 |
|---|---|---|
| `spacing_cm` | cm | トマト=50 |
| `rotation_buffer_cm` | cm | ナス科=50 |
| `row_start/end, col_start/end` | マス（10cm単位） | 5m=50マス |

- 種袋の表記がcmなので入力が直感的
- グリッド座標のみマス単位（10cm=1マス）
- cm→マス変換：`cm // 10`

---

## データベース接続情報（ConoHa VPS上のPostgreSQL）

ConoHa VPS上のPostgreSQLをlocalhost運用。Supabaseは使っていない。

```
HOST: localhost
PORT: 5432
NAME: my_garden_db
USER: garden_user
PASSWORD: （.envで管理）
```

`.env`の`DATABASE_URL`：
```
DATABASE_URL=postgres://garden_user:password@localhost:5432/my_garden_db
```

`settings.py`はすでに`.env`から読み込む設定にしてある。
接続情報を聞かれたら上記を答えてください。

※ PostgreSQLは同じVPS上でlocalhostで動いているため、
　ConoHaのセキュリティグループで5432番ポートを開ける必要はない。
