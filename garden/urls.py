from django.urls import path

from . import views

app_name = "garden"

urlpatterns = [
    path("", views.mypage, name="mypage"),
    path("api/area/<int:area_id>/state/", views.area_state_api, name="area_state_api"),
    path("api/vegetable-types/", views.vegetable_types_api, name="vegetable_types_api"),
    path("api/beds/", views.create_bed_api, name="create_bed_api"),
    path("api/beds/<int:bed_id>/", views.update_bed_api, name="update_bed_api"),
    path("api/crops/", views.plant_crop_api, name="plant_crop_api"),
    path("api/crops/<int:crop_id>/", views.crop_detail_api, name="crop_detail_api"),
]
