import csv
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from garden.models import VegetableFamily, VegetableType

FAMILY_DEFAULTS = {
    "ナス科":    {"rotation_years": 4, "rotation_buffer_cm": 50},
    "ウリ科":    {"rotation_years": 3, "rotation_buffer_cm": 40},
    "アブラナ科": {"rotation_years": 2, "rotation_buffer_cm": 30},
    "マメ科":    {"rotation_years": 2, "rotation_buffer_cm": 30},
    "セリ科":    {"rotation_years": 4, "rotation_buffer_cm": 30},
}

METHOD_BY_NAME = {
    # 筋蒔き
    "にんじん":     "row",
    "ほうれん草":   "row",
    "小松菜":       "row",
    "チンゲンサイ": "row",
    "大根":         "row",
    "春菊":         "row",
    "長ネギ":       "row",
    # まとめ植え
    "じゃがいも":   "block",
    "さつまいも":   "block",
    "里芋":         "block",
    "にんにく":     "block",
    "たまねぎ":     "block",
    "キャベツ":     "block",
    "白菜":         "block",
    "レタス":       "block",
    "落花生":       "block",
    "そら豆":       "block",
    "トウモロコシ": "block",
    "しょうが":     "block",
    "サフラン":     "block",
    "スナップエンドウ": "block",
}


class Command(BaseCommand):
    help = "CSVからVegetableTypeをインポートする"

    def add_arguments(self, parser):
        parser.add_argument("csv_path", type=str, help="CSVファイルのパス")
        parser.add_argument(
            "--update", action="store_true",
            help="既存レコードも更新する（デフォルトはスキップ）"
        )

    def handle(self, *args, **options):
        csv_path = Path(options["csv_path"])
        if not csv_path.exists():
            raise CommandError(f"ファイルが見つかりません: {csv_path}")

        do_update = options["update"]
        imported = 0
        updated = 0
        skipped = 0

        with open(csv_path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                name = row["name"].strip()
                family_name = row["family"].strip()
                spacing_cm = int(row["spacing_cm"])
                icon_filename = row["icon_filename"].strip()
                planting_method = METHOD_BY_NAME.get(name, "individual")

                family, _ = VegetableFamily.objects.get_or_create(name=family_name)
                rot = FAMILY_DEFAULTS.get(
                    family_name, {"rotation_years": 3, "rotation_buffer_cm": 50}
                )

                field_defaults = {
                    "family": family,
                    "spacing_cm": spacing_cm,
                    "planting_method": planting_method,
                    "rotation_years": rot["rotation_years"],
                    "rotation_buffer_cm": rot["rotation_buffer_cm"],
                }

                if do_update:
                    veg, created = VegetableType.objects.update_or_create(
                        name=name, defaults=field_defaults
                    )
                    veg.icon.name = f"vegetables/icons/{icon_filename}"
                    veg.save()
                    if created:
                        self.stdout.write(f"  追加: {name} ({icon_filename}) [{planting_method}]")
                        imported += 1
                    else:
                        self.stdout.write(f"  更新: {name} [{planting_method}]")
                        updated += 1
                else:
                    veg, created = VegetableType.objects.get_or_create(
                        name=name, defaults=field_defaults
                    )
                    if created:
                        veg.icon.name = f"vegetables/icons/{icon_filename}"
                        veg.save()
                        self.stdout.write(f"  追加: {name} ({icon_filename}) [{planting_method}]")
                        imported += 1
                    else:
                        self.stdout.write(f"  スキップ(重複): {name}")
                        skipped += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"\n完了: {imported}件追加, {updated}件更新, {skipped}件スキップ"
            )
        )
