import csv

from crops.models import VegetableType

# CSVデータ（ここに貼り付けた内容を読み込む想定）
# ファイルとして保存している場合は open('data.csv') に書き換えてください
csv_data = """name,family,spacing_cm,icon_filename
キャベツ,アブラナ科,40,cabbage.svg
にんじん,セリ科,10,carrot_1.svg
にんじん,セリ科,10,carrot_2.svg
チンゲンサイ,アブラナ科,25,chingensai_1.svg
チンゲンサイ,アブラナ科,25,chingensai_2.svg
トウモロコシ,イネ科,40,corn.svg
大根,アブラナ科,30,daikon.svg
ナス,ナス科,45,eggplant_1.svg
にんにく,ヒガンバナ科,15,garlic.svg
しょうが,ショウガ科,20,ginger.svg
ゴーヤ,ウリ科,50,goya.svg
白菜,アブラナ科,40,hakusai.svg
ほうれん草,ヒユ科,20,hourensou.svg
かぼちゃ,ウリ科,50,kabocha.svg
小松菜,アブラナ科,20,komatsuna.svg
きゅうり,ウリ科,40,kyuri.svg
レタス,キク科,25,leaf_lettuce.svg
ミニトマト,ナス科,40,mini_tomato.svg
長ネギ,ヒガンバナ科,10,naganegi.svg
ナス,ナス科,45,nasu.svg
オクラ,アオイ科,40,okura.svg
たまねぎ,ヒガンバナ科,15,onion.svg
パプリカ,ナス科,40,papurika.svg
落花生,マメ科,20,peanut.svg
ピーマン,ナス科,40,piman.svg
じゃがいも,ナス科,40,potato.svg
サフラン,アヤメ科,20,saffron.svg
里芋,サトイモ科,30,satoimo.svg
ししとう,ナス科,40,shishito.svg
スナップエンドウ,マメ科,20,snap_pea.svg
そら豆,マメ科,30,soramame.svg
さつまいも,ヒルガオ科,40,sweet_potato.svg
春菊,キク科,20,syungiku.svg
唐辛子,ナス科,40,togarashi.svg
トマト,ナス科,50,tomato.svg
ズッキーニ,ウリ科,50,zucchini.svg"""

# 名前をキー、アイコンファイル名を値とする辞書を作成
lines = csv_data.strip().split("\n")
reader = csv.DictReader(lines)
icon_map = {row["name"]: row["icon_filename"] for row in reader}

# データベースを更新
for veg in VegetableType.objects.all():
    # CSVの中にその野菜名があれば、そのアイコンファイル名を採用する
    correct_filename = icon_map.get(veg.name)

    if correct_filename:
        # パスを 'vegetables/icons/英語名.svg' に修正
        veg.icon.name = f"vegetables/icons/{correct_filename}"
        veg.save()
        print(f"Fixed: {veg.name} -> {correct_filename}")
    else:
        print(f"Skipped: {veg.name} (Not found in CSV)")
