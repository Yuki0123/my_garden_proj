from django.urls import path

from .views.api_views import get_beds, save_bed_layout

# from . import views
# 🫱 viewsフォルダ内の各ファイルから、必要な関数をインポートする
from .views.base_views import garden_mypage
from .views.crop_views import get_crops, harvest_crop, save_crop
from .views.log_views import (
    get_maintenance_logs,
    get_plot_history,
    save_maintenance_log,
)

urlpatterns = [
    # http://.../garden/mypage/ でアクセスできるようにする
    path("mypage/", garden_mypage, name="garden_mypage"),
    path("api/save_crop/", save_crop, name="save_crop"),
    path("api/get_crops/", get_crops, name="get_crops"),
    path("api/harvest_crop/<int:crop_id>/", harvest_crop, name="harvest_crop"),
    path(
        "api/save_maintenance_log/",
        save_maintenance_log,
        name="save_maintenance_log",
    ),
    path(
        "api/get_maintenance_logs/",
        get_maintenance_logs,
        name="get_maintenance_logs",
    ),
    path("api/get_plot_history/", get_plot_history, name="get_plot_history"),
    path("api/save_bed_layout/", save_bed_layout, name="save_bed_layout"),
    path("api/get_beds/", get_beds, name="get_beds"),
]
