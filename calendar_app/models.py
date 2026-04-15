# calendar_app/models.py

from django.db import models
from crops.models import Crop, Plot

class ActivityLog(models.Model):
    """農作業の記録"""
    TASK_CHOICES = [
        ('watering', '水やり'),
        ('fertilizing', '追肥'),
        ('weeding', '除草'),
        ('pruning', '整枝・脇芽取り'),
        ('harvesting', '収穫'),
        ('other', 'その他'),
    ]

    date = models.DateField("作業日")
    crop = models.ForeignKey(
        Crop, 
        on_delete=models.CASCADE, 
        related_name='activities',
        verbose_name="対象の野菜"
    )
    # 作業時の場所も記録しておくと、移動や植え替えにも対応できる
    plot = models.ForeignKey(
        Plot, 
        on_delete=models.SET_NULL, 
        null=True, 
        verbose_name="作業場所"
    )
    task = models.CharField("作業内容", max_length=20, choices=TASK_CHOICES)
    note = models.TextField("メモ・気づき", blank=True)
    photo = models.ImageField("写真", upload_to='activities/', blank=True, null=True)

    class Meta:
        verbose_name = "作業記録"
        ordering = ['-date']

    def __str__(self):
        return f"{self.date} - {self.crop.name} ({self.get_task_display()})"