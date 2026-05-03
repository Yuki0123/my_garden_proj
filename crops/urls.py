from django.urls import path

from . import views

urlpatterns = [
    # http://.../garden/mypage/ でアクセスできるようにする
    path("mypage/", views.garden_mypage, name="garden_mypage"),
    path("api/save_crop/", views.save_crop, name="save_crop"),
    path("api/get_crops/", views.get_crops, name="get_crops"),
    path("api/harvest_crop/<int:crop_id>/", views.harvest_crop, name="harvest_crop"),
    path(
        "api/save_maintenance_log/",
        views.save_maintenance_log,
        name="save_maintenance_log",
    ),
    path(
        "api/get_maintenance_logs/",
        views.get_maintenance_logs,
        name="get_maintenance_logs",
    ),
    path("api/get_plot_history/", views.get_plot_history, name="get_plot_history"),
]
