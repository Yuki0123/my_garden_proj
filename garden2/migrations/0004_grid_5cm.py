"""
グリッド単位を 10cm → 5cm に変更するデータマイグレーション。

GardenArea.rows / cols を 2倍にし、
Bed・Crop・MaintenanceLog の座標フィールドをすべて 2倍にする。
"""
from django.db import migrations


def upgrade(apps, schema_editor):
    GardenArea      = apps.get_model('garden2', 'GardenArea')
    Bed             = apps.get_model('garden2', 'Bed')
    Crop            = apps.get_model('garden2', 'Crop')
    MaintenanceLog  = apps.get_model('garden2', 'MaintenanceLog')

    for area in GardenArea.objects.all():
        area.rows = area.rows * 2
        area.cols = area.cols * 2
        area.save(update_fields=['rows', 'cols'])

    for obj in Bed.objects.all():
        obj.row_start *= 2; obj.row_end *= 2
        obj.col_start *= 2; obj.col_end *= 2
        obj.save(update_fields=['row_start', 'row_end', 'col_start', 'col_end'])

    for obj in Crop.objects.all():
        obj.row_start *= 2; obj.row_end *= 2
        obj.col_start *= 2; obj.col_end *= 2
        obj.save(update_fields=['row_start', 'row_end', 'col_start', 'col_end'])

    for obj in MaintenanceLog.objects.all():
        if obj.row_start is not None: obj.row_start *= 2
        if obj.row_end   is not None: obj.row_end   *= 2
        if obj.col_start is not None: obj.col_start *= 2
        if obj.col_end   is not None: obj.col_end   *= 2
        obj.save(update_fields=['row_start', 'row_end', 'col_start', 'col_end'])


def downgrade(apps, schema_editor):
    GardenArea      = apps.get_model('garden2', 'GardenArea')
    Bed             = apps.get_model('garden2', 'Bed')
    Crop            = apps.get_model('garden2', 'Crop')
    MaintenanceLog  = apps.get_model('garden2', 'MaintenanceLog')

    for area in GardenArea.objects.all():
        area.rows = area.rows // 2
        area.cols = area.cols // 2
        area.save(update_fields=['rows', 'cols'])

    for obj in Bed.objects.all():
        obj.row_start //= 2; obj.row_end //= 2
        obj.col_start //= 2; obj.col_end //= 2
        obj.save(update_fields=['row_start', 'row_end', 'col_start', 'col_end'])

    for obj in Crop.objects.all():
        obj.row_start //= 2; obj.row_end //= 2
        obj.col_start //= 2; obj.col_end //= 2
        obj.save(update_fields=['row_start', 'row_end', 'col_start', 'col_end'])

    for obj in MaintenanceLog.objects.all():
        if obj.row_start is not None: obj.row_start //= 2
        if obj.row_end   is not None: obj.row_end   //= 2
        if obj.col_start is not None: obj.col_start //= 2
        if obj.col_end   is not None: obj.col_end   //= 2
        obj.save(update_fields=['row_start', 'row_end', 'col_start', 'col_end'])


class Migration(migrations.Migration):
    dependencies = [
        ('garden2', '0003_set_family_colors'),
    ]

    operations = [
        migrations.RunPython(upgrade, downgrade),
    ]
