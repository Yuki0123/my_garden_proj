from django.conf import settings
from django.db import models
from django.utils import timezone


class GardenArea(models.Model):
    """畑全体のエリア（例：南側の畑）"""

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="garden_areas",
        verbose_name="オーナー",
    )
    name = models.CharField("エリア名", max_length=100)
    rows = models.PositiveSmallIntegerField("縦(10cm単位)", default=180)
    cols = models.PositiveSmallIntegerField("横(10cm単位)", default=70)

    def __str__(self):
        return self.name


class VegetableFamily(models.Model):
    """野菜の科"""

    name = models.CharField("科の名前", max_length=50, unique=True)
    description = models.TextField("特徴・注意点", blank=True)

    def __str__(self):
        return self.name


class VegetableType(models.Model):
    """野菜の種類マスター"""

    PLANTING_METHOD_CHOICES = [
        ("individual", "個体植え"),
        ("dense", "密集・筋蒔き"),
    ]

    name = models.CharField("野菜名", max_length=100, unique=True)
    family = models.ForeignKey(
        VegetableFamily, on_delete=models.CASCADE, related_name="vegetable_types"
    )
    icon = models.FileField(
        "アイコン画像",
        null=True,
        blank=True,
        upload_to="icons/",
        help_text="SVG形式推奨",
    )
    spacing_cm = models.PositiveSmallIntegerField(
        "株間(cm)", default=50, help_text="株間の目安（例：トマトなら50cm）"
    )
    planting_method = models.CharField(
        "栽培方法", max_length=20, choices=PLANTING_METHOD_CHOICES, default="individual"
    )
    rotation_years = models.PositiveSmallIntegerField("連作回避年数", default=3)
    rotation_buffer_cm = models.PositiveSmallIntegerField("影響半径(cm)", default=50)
    color = models.CharField("表示色(hex)", max_length=7, default="#4CAF50")

    def __str__(self):
        return self.name

    @property
    def spacing_grid(self):
        return self.spacing_cm // 10

    @property
    def rotation_buffer_grid(self):
        return self.rotation_buffer_cm // 10


class Bed(models.Model):
    """畝"""

    area = models.ForeignKey(GardenArea, on_delete=models.CASCADE, related_name="beds")
    name = models.CharField("畝名", max_length=100)

    row_start = models.PositiveSmallIntegerField("開始行(10cm単位)")
    col_start = models.PositiveSmallIntegerField("開始列(10cm単位)")
    row_end = models.PositiveSmallIntegerField("終了行(10cm単位)")
    col_end = models.PositiveSmallIntegerField("終了列(10cm単位)")

    created_at = models.DateField("畝立て日", default=timezone.now)
    deleted_at = models.DateField("撤去日", null=True, blank=True)

    def __str__(self):
        return f"{self.area.name} - {self.name}"


class Crop(models.Model):
    """実際に植えた作物"""

    STATUS_CHOICES = [
        ("planned", "計画中"),
        ("growing", "栽培中"),
        ("harvested", "収穫済"),
    ]

    area = models.ForeignKey(GardenArea, on_delete=models.CASCADE, related_name="crops")
    vegetable_type = models.ForeignKey(
        VegetableType,
        on_delete=models.CASCADE,
        verbose_name="野菜の種類",
    )
    variety = models.CharField("品種", max_length=50, blank=True)

    row_start = models.PositiveSmallIntegerField("開始行(10cm単位)")
    col_start = models.PositiveSmallIntegerField("開始列(10cm単位)")
    row_end = models.PositiveSmallIntegerField("終了行(10cm単位)")
    col_end = models.PositiveSmallIntegerField("終了列(10cm単位)")

    planted_at = models.DateField("植え付け日")
    expected_harvest_date = models.DateField("収穫予定日", null=True, blank=True)
    harvested_at = models.DateField("実際の収穫日", null=True, blank=True)

    status = models.CharField(
        "状態", max_length=20, choices=STATUS_CHOICES, default="growing"
    )

    def __str__(self):
        name = str(self.vegetable_type)
        if self.variety:
            name += f"（{self.variety}）"
        return name


class SoilStatusArea(models.Model):
    """土壌状態エリア"""

    STATUS_CHOICES = [
        ("plowed", "耕うん済"),
        ("limed", "石灰投入済"),
        ("manured", "堆肥投入済"),
        ("mulched", "マルチ展開中"),
        ("covered", "防虫ネット/不織布"),
    ]

    area = models.ForeignKey(
        GardenArea, on_delete=models.CASCADE, related_name="soil_status_areas"
    )
    status_type = models.CharField(
        "状態/作業内容", max_length=20, choices=STATUS_CHOICES
    )

    row_start = models.PositiveSmallIntegerField("開始行(10cm単位)")
    col_start = models.PositiveSmallIntegerField("開始列(10cm単位)")
    row_end = models.PositiveSmallIntegerField("終了行(10cm単位)")
    col_end = models.PositiveSmallIntegerField("終了列(10cm単位)")

    start_date = models.DateField("開始日")
    end_date = models.DateField("終了予定日", null=True, blank=True)

    def __str__(self):
        return f"{self.get_status_type_display()} ({self.start_date})"


class MaintenanceLog(models.Model):
    """作業ログ"""

    MAINTENANCE_TYPES = [
        ("watering", "水やり"),
        ("fertilizing", "追肥"),
        ("weeding", "除草"),
        ("pruning", "芽かき・間引き"),
        ("pest_control", "防虫・消毒"),
        ("harvesting", "収穫"),
        ("other", "その他"),
    ]

    area = models.ForeignKey(
        GardenArea, on_delete=models.CASCADE, related_name="maintenance_logs"
    )
    task_type = models.CharField("作業種類", max_length=20, choices=MAINTENANCE_TYPES)

    crop = models.ForeignKey(
        Crop,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="maintenance_logs",
    )
    bed = models.ForeignKey(
        Bed,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="maintenance_logs",
    )

    row_start = models.PositiveSmallIntegerField("開始行(10cm単位)", null=True, blank=True)
    col_start = models.PositiveSmallIntegerField("開始列(10cm単位)", null=True, blank=True)
    row_end = models.PositiveSmallIntegerField("終了行(10cm単位)", null=True, blank=True)
    col_end = models.PositiveSmallIntegerField("終了列(10cm単位)", null=True, blank=True)

    note = models.TextField("メモ", blank=True)
    worked_at = models.DateTimeField("実施日時", default=timezone.now)
    image = models.ImageField(upload_to="logs/", blank=True, null=True)

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="garden_maintenance_logs",
        verbose_name="作業者",
    )

    def __str__(self):
        return f"{self.get_task_type_display()} ({self.worked_at:%Y-%m-%d})"
