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
rotation_years  = models.PositiveSmallIntegerField("連作回避年数", default=3)
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

`VegetableType.planting_method`で2種類を管理：

- `individual` — 個体植え（トマト、ナスなど）。株間バリデーションあり
- `dense` — 密集・筋蒔き（ニンジン、小松菜など）。条の本数・播種幅で管理

UIのフローも植え付け方法で分岐する：
- 個体植え → 株の位置を1点タップ × 株数
- 筋蒔き → 始点→終点で範囲指定

---

## UIの設計方針

### 2モード構成

1. **俯瞰モード**（全体ビュー）
   - 4pxセルで7m×18mを全体表示
   - 作物のある場所を野菜ごとの色で表示（何が植わってるかわかる）
   - 畝をタップで編集モードへ

2. **編集モード**（畝詳細ビュー）
   - 選んだ畝だけ36pxセルで拡大表示
   - 上部に0m〜7mのスケール表示
   - 植え付けフロー：野菜選択 → 始点タップ → 終点タップ → 警告確認 → 植え付け

### スマホ対応

- ドラッグ操作は廃止（タッチでのドラッグが不安定なため）
- **2タップ方式**（始点タップ→終点タップ）で範囲指定
- セルサイズ最低36px

### 植え付け時の確認フロー

1. 重複チェック → 「○○と混植になりますがよいですか？」
2. 連作チェック → 「3年前にここでトマトを育てています」
3. 株間バリデーション → 「株間が狭いです（推奨50cm）」
4. すべて警告のみ、禁止はしない

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
- `accounts`が`crops`に依存している可能性があるため、削除前に依存関係を確認すること

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
  4. 本番Supabase：ダッシュボードから既存テーブルをdropして`migrate`
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

## データベース接続情報（ConoHa VPS上のPostgreSQL）

SupabaseからConoHa VPS上のPostgreSQLに移行済み。

```
HOST: localhost
PORT: 5432
NAME: my_garden_db
USER: yuki
PASSWORD: （.envで管理）
```

`.env`の`DATABASE_URL`：
```
DATABASE_URL=postgres://yuki:pass000@localhost:5432/my_garden_db
```

`settings.py`はすでに`.env`から読み込む設定にしてある。
接続情報を聞かれたら上記を答えてください。

※ PostgreSQLは同じVPS上でlocalhostで動いているため、
　ConoHaのセキュリティグループで5432番ポートを開ける必要はない。