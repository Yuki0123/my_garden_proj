from datetime import date

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from garden.models import Bed, GardenArea

User = get_user_model()

# 標準構成
ROWS       = 180   # 18m（10cm単位）
COLS       = 70    # 7m（10cm単位）
BED_ROWS   = 8     # 畝の幅 80cm
PATH_ROWS  = 4     # 通路幅 40cm
N_BEDS     = 15


class Command(BaseCommand):
    help = "標準の畑エリアと畝15本をセットアップする"

    def add_arguments(self, parser):
        parser.add_argument("--username", required=True, help="オーナーのユーザー名")
        parser.add_argument("--area-name", default="南側の畑", help="エリア名（デフォルト: 南側の畑）")
        parser.add_argument("--date", default=str(date.today()), help="畝立て日 YYYY-MM-DD")
        parser.add_argument("--force", action="store_true", help="既存の畝を削除して再作成する")

    def handle(self, *args, **options):
        username  = options["username"]
        area_name = options["area_name"]
        bed_date  = date.fromisoformat(options["date"])

        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            raise CommandError(f"ユーザー '{username}' が見つかりません")

        # エリア取得 or 作成
        area, area_created = GardenArea.objects.get_or_create(
            owner=user,
            name=area_name,
            defaults={"rows": ROWS, "cols": COLS},
        )
        if area_created:
            self.stdout.write(f"エリア作成: {area_name} ({COLS*10}cm × {ROWS*10}cm)")
        else:
            self.stdout.write(f"既存エリア使用: {area_name}")

        # 既存の畝を確認
        existing = Bed.objects.filter(area=area).count()
        if existing > 0 and not options["force"]:
            self.stdout.write(
                self.style.WARNING(
                    f"すでに {existing} 本の畝があります。"
                    " 再作成するには --force を追加してください。"
                )
            )
            return

        if options["force"]:
            deleted, _ = Bed.objects.filter(area=area).delete()
            self.stdout.write(f"既存の畝 {deleted} 本を削除しました")

        # 畝を15本作成
        beds = []
        for i in range(N_BEDS):
            row_start = i * (BED_ROWS + PATH_ROWS)
            row_end   = row_start + BED_ROWS - 1
            beds.append(Bed(
                area=area,
                name=f"畝{i + 1}",
                row_start=row_start,
                col_start=0,
                row_end=row_end,
                col_end=COLS - 1,
                created_at=bed_date,
            ))

        Bed.objects.bulk_create(beds)
        self.stdout.write(self.style.SUCCESS(f"{N_BEDS} 本の畝を作成しました"))

        self.stdout.write("\n【畝一覧】")
        for i, b in enumerate(beds):
            start_m = b.row_start * 10
            end_m   = (b.row_end + 1) * 10
            self.stdout.write(f"  畝{i+1}: 上から {start_m}〜{end_m}cm（全幅7m）")
