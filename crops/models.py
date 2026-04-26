from django.conf import settings
from django.contrib.auth.models import Group
from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone


class GardenArea(models.Model):
    owner_group = models.ForeignKey(
        Group,
        on_delete=models.SET_NULL,  # グループが消えても畑データは残す設定
        null=True,
        blank=True,
        related_name="gardens",
    )

    """庭全体（例：南側の庭、第1圃場など）"""
    name = models.CharField("エリア名", max_length=100)
    rows = models.PositiveIntegerField("縦(10cm単位)", default=10)
    cols = models.PositiveIntegerField("横(10cm単位)", default=10)

    def __str__(self):
        return self.name


class SoilStatusArea(models.Model):
    STATUS_CHOICES = [
        ("plowed", "耕うん済"),
        ("limed", "石灰投入済"),
        ("manured", "堆肥投入済"),
        ("mulched", "マルチ展開中"),
        ("covered", "防虫ネット/不織布"),
    ]

    area = models.ForeignKey(GardenArea, on_delete=models.CASCADE)
    status_type = models.CharField(
        "状態/作業内容", max_length=20, choices=STATUS_CHOICES
    )

    # 時間軸の管理
    start_date = models.DateField("開始日")
    end_date = models.DateField("終了予定日", null=True, blank=True)

    # どのPlotが含まれるか
    plots = models.ManyToManyField("Plot", related_name="status_areas")

    def __str__(self):
        return f"{self.get_status_type_display()} ({self.start_date})"


class Bed(models.Model):
    """可変的な『畝』"""

    area = models.ForeignKey(GardenArea, on_delete=models.CASCADE, related_name="beds")
    name = models.CharField("畝名", max_length=100)

    plots = models.ManyToManyField("Plot", related_name="beds", blank=True)

    # --- 時間軸管理を追加 ---
    created_at = models.DateField("畝立て日", default=timezone.now)
    deleted_at = models.DateField("撤去日", null=True, blank=True)
    # ----------------------

    def __str__(self):
        return f"{self.area.name} - {self.name}"


class Plot(models.Model):
    """10cm x 10cm の最小単位"""

    area = models.ForeignKey(
        GardenArea, on_delete=models.CASCADE, related_name="all_plots"
    )
    row_index = models.IntegerField("行番号")
    col_index = models.IntegerField("列番号")

    class Meta:
        unique_together = ("area", "row_index", "col_index")
        ordering = ["row_index", "col_index"]

    def __str__(self):
        return f"{self.area.name} [{self.row_index}-{self.col_index}]"


# --- 自動生成ロジック (Signals) ---
@receiver(post_save, sender=GardenArea)
def create_plots(sender, instance, created, **kwargs):
    """GardenAreaが作成されたら、自動的にPlot(10cmマス)を生成する"""
    if created:
        plots = []
        for r in range(instance.rows):
            for c in range(instance.cols):
                plots.append(Plot(area=instance, row_index=r, col_index=c))
        # まとめて作成（処理速度向上のため）
        Plot.objects.bulk_create(plots)


class VegetableFamily(models.Model):
    """野菜の『科』を管理"""

    name = models.CharField("科の名前", max_length=50, unique=True)
    description = models.TextField("特徴・注意点", blank=True)

    def __str__(self):
        return self.name


class VegetableType(models.Model):
    """野菜の種類マスター（トマト、キュウリ、桃太郎トマトなど）"""

    name = models.CharField("野菜名", max_length=100, unique=True)
    family = models.ForeignKey(
        VegetableFamily, on_delete=models.CASCADE, related_name="vegetable_types"
    )

    icon = models.FileField(
        "アイコン画像",
        null=True,
        blank=True,
        upload_to="アイコン(SVG推奨)",
        help_text="SVG形式だと拡大しても綺麗に表示されます",
    )

    # 栽培間隔（センチメートル単位で管理し、グリッド計算に利用）
    spacing_cm = models.PositiveIntegerField(
        "栽培間隔(cm)", default=50, help_text="株間の目安（例：トマトなら50cm）"
    )

    PLANTING_METHOD_CHOICES = [
        ("individual", "個体植え"),  # トマト、ナス（1マスに1つ）
        ("dense", "密集・筋蒔き"),  # ニンジン、小松菜（1マスに複数）
    ]
    planting_method = models.CharField(
        "栽培方法", max_length=20, choices=PLANTING_METHOD_CHOICES, default="individual"
    )

    def __str__(self):
        return self.name

    @property
    def spacing_grid(self):
        """10cmグリッドで何マス分かを返す（50cmなら5マス）"""
        return self.spacing_cm // 10


class Crop(models.Model):
    """実際に庭に植えた野菜（個体）"""

    vegetable_type = models.ForeignKey(
        VegetableType,
        on_delete=models.CASCADE,
        verbose_name="野菜の種類",
        null=True,  # 追加
        blank=True,  # 追加
    )
    variety = models.CharField("品種", max_length=50, blank=True)

    # 畝の中のメインとなるマス
    main_plot = models.OneToOneField(
        Plot, on_delete=models.SET_NULL, null=True, blank=True, related_name="crop_here"
    )

    # 日付管理
    planted_at = models.DateField("植え付け日")
    expected_harvest_date = models.DateField("収穫予定日", null=True, blank=True)
    harvested_at = models.DateField("実際の収穫日", null=True, blank=True)

    # 状態管理
    status = models.CharField(
        max_length=20,
        choices=[("planned", "計画中"), ("growing", "栽培中"), ("harvested", "収穫済")],
        default="growing",
    )

    def __str__(self):
        return f"{self.vegetable_type} ({self.variety})"


class MaintenanceLog(models.Model):
    MAINTENANCE_TYPES = [
        ("watering", "水やり"),
        ("fertilizing", "追肥"),
        ("weeding", "除草"),
        ("pruning", "芽かき・間引き"),
        ("pest_control", "防虫・消毒"),
        ("harvesting", "収穫"),
        ("other", "その他"),
    ]
    # 菜園全体を指す（必須。これがあることで、どのマスも選ばない「全体作業」も記録できる）
    area = models.ForeignKey(
        GardenArea, on_delete=models.CASCADE, related_name="maintenance_logs"
    )
    # 何をしたか
    task_type = models.CharField("作業種類", max_length=20, choices=MAINTENANCE_TYPES)
    # どの区画（マス）に対してのアクションか
    plots = models.ManyToManyField("Plot", related_name="maintenance_logs")
    # 詳細（肥料の名前や、収穫量、気づいたことなど）
    note = models.TextField("メモ", blank=True)
    # いつしたか
    worked_at = models.DateTimeField("実施日時", default=timezone.now)

    # 写真（もしあれば）
    image = models.ImageField(upload_to="logs/", blank=True, null=True)

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="作業者",
    )
