from crops.models import VegetableType

for veg in VegetableType.objects.all():
    if veg.icon:
        old_path = veg.icon.path
        # 新しい名前を決定 (例: zucchini.svg)
        ext = old_path.split(".")[-1]
        new_name = f"{veg.name}.{ext}"

        # データベースの値を書き換え（フォルダ名もスッキリ）
        veg.icon.name = f"vegetables/icons/{new_name}"
        veg.save()
