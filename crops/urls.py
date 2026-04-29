from django.urls import path

from . import views

urlpatterns = [
    # http://.../garden/mypage/ でアクセスできるようにする
    path("mypage/", views.garden_mypage, name="garden_mypage"),
    path("api/save_crop/", views.save_crop, name="save_crop"),
    path("api/get_crops/", views.get_crops, name="get_crops"),
    path("api/harvest_crop/<int:crop_id>/", views.harvest_crop, name="harvest_crop"),
]
