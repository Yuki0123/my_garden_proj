"""
garden アプリのデータを garden2 にコピーする管理コマンド。

使い方:
  python manage.py copy_from_garden          # 全データをコピー（既存のgarden2データは削除）
  python manage.py copy_from_garden --dry-run # 実行せず件数だけ確認
"""

from django.core.management.base import BaseCommand
from django.db import transaction

import garden.models as G
import garden2.models as G2


class Command(BaseCommand):
    help = 'garden アプリのデータを garden2 にコピーします'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run', action='store_true',
            help='実際にはコピーせず、コピー予定の件数を表示する',
        )

    def handle(self, *args, **options):
        dry = options['dry_run']

        src_counts = {
            'VegetableFamily': G.VegetableFamily.objects.count(),
            'VegetableType':   G.VegetableType.objects.count(),
            'GardenArea':      G.GardenArea.objects.count(),
            'Bed':             G.Bed.objects.count(),
            'Crop':            G.Crop.objects.count(),
            'SoilStatusArea':  G.SoilStatusArea.objects.count(),
            'MaintenanceLog':  G.MaintenanceLog.objects.count(),
        }

        self.stdout.write('=== コピー元（garden）の件数 ===')
        for name, cnt in src_counts.items():
            self.stdout.write(f'  {name}: {cnt}件')

        if dry:
            self.stdout.write(self.style.WARNING('\n--dry-run モード：実際にはコピーしません'))
            return

        self.stdout.write('\nコピー開始...')

        with transaction.atomic():
            # ── 既存のgarden2データをすべて削除 ──
            self.stdout.write('garden2 の既存データを削除中...')
            G2.MaintenanceLog.objects.all().delete()
            G2.SoilStatusArea.objects.all().delete()
            G2.Crop.objects.all().delete()
            G2.Bed.objects.all().delete()
            G2.GardenArea.objects.all().delete()
            G2.VegetableType.objects.all().delete()
            G2.VegetableFamily.objects.all().delete()

            # ── VegetableFamily ──
            fam_map = {}  # garden id → garden2 object
            for src in G.VegetableFamily.objects.all():
                dst = G2.VegetableFamily.objects.create(
                    name=src.name,
                    description=src.description,
                )
                fam_map[src.id] = dst
            self.stdout.write(f'  VegetableFamily: {len(fam_map)}件')

            # ── VegetableType ──
            vt_map = {}  # garden id → garden2 object
            for src in G.VegetableType.objects.select_related('family'):
                dst = G2.VegetableType.objects.create(
                    name=src.name,
                    family=fam_map[src.family_id],
                    spacing_cm=src.spacing_cm,
                    planting_method=src.planting_method,
                    rotation_years=src.rotation_years,
                    rotation_buffer_cm=src.rotation_buffer_cm,
                    color=src.color,
                )
                # icon はファイルパスをそのまま流用（media/ は共通）
                if src.icon:
                    dst.icon = src.icon
                    dst.save(update_fields=['icon'])
                vt_map[src.id] = dst
            self.stdout.write(f'  VegetableType: {len(vt_map)}件')

            # ── GardenArea ──
            area_map = {}  # garden id → garden2 object
            for src in G.GardenArea.objects.all():
                dst = G2.GardenArea.objects.create(
                    owner=src.owner,
                    name=src.name,
                    rows=src.rows,
                    cols=src.cols,
                )
                area_map[src.id] = dst
            self.stdout.write(f'  GardenArea: {len(area_map)}件')

            # ── Bed ──
            bed_map = {}  # garden id → garden2 object
            for src in G.Bed.objects.all():
                dst = G2.Bed.objects.create(
                    area=area_map[src.area_id],
                    name=src.name,
                    row_start=src.row_start,
                    col_start=src.col_start,
                    row_end=src.row_end,
                    col_end=src.col_end,
                    created_at=src.created_at,
                    deleted_at=src.deleted_at,
                )
                bed_map[src.id] = dst
            self.stdout.write(f'  Bed: {len(bed_map)}件')

            # ── Crop ──
            crop_map = {}  # garden id → garden2 object
            for src in G.Crop.objects.all():
                dst = G2.Crop.objects.create(
                    area=area_map[src.area_id],
                    vegetable_type=vt_map[src.vegetable_type_id],
                    variety=src.variety,
                    row_start=src.row_start,
                    col_start=src.col_start,
                    row_end=src.row_end,
                    col_end=src.col_end,
                    planted_at=src.planted_at,
                    expected_harvest_date=src.expected_harvest_date,
                    harvested_at=src.harvested_at,
                    status=src.status,
                )
                crop_map[src.id] = dst
            self.stdout.write(f'  Crop: {len(crop_map)}件')

            # ── SoilStatusArea ──
            soil_count = 0
            for src in G.SoilStatusArea.objects.all():
                G2.SoilStatusArea.objects.create(
                    area=area_map[src.area_id],
                    status_type=src.status_type,
                    row_start=src.row_start,
                    col_start=src.col_start,
                    row_end=src.row_end,
                    col_end=src.col_end,
                    start_date=src.start_date,
                    end_date=src.end_date,
                )
                soil_count += 1
            self.stdout.write(f'  SoilStatusArea: {soil_count}件')

            # ── MaintenanceLog ──
            log_count = 0
            for src in G.MaintenanceLog.objects.all():
                G2.MaintenanceLog.objects.create(
                    area=area_map[src.area_id],
                    task_type=src.task_type,
                    crop=crop_map.get(src.crop_id) if src.crop_id else None,
                    bed=bed_map.get(src.bed_id) if src.bed_id else None,
                    row_start=src.row_start,
                    col_start=src.col_start,
                    row_end=src.row_end,
                    col_end=src.col_end,
                    note=src.note,
                    worked_at=src.worked_at,
                    user=src.user,
                )
                log_count += 1
            self.stdout.write(f'  MaintenanceLog: {log_count}件')

        self.stdout.write(self.style.SUCCESS('\nコピー完了！'))
