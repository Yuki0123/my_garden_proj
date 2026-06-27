from django.urls import path

from . import views

app_name = "garden2"

urlpatterns = [
    path("", views.index, name="index"),
    path("api/area/<int:area_id>/state/", views.state_api, name="state_api"),
    path("api/area/<int:area_id>/dates/", views.year_dates_api, name="year_dates_api"),
    path("api/bed/<int:bed_id>/detail/", views.bed_detail_api, name="bed_detail_api"),
    path("api/bed/<int:bed_id>/log/", views.log_api, name="log_api"),
    path("api/crop/<int:crop_id>/harvest/", views.harvest_api, name="harvest_api"),
    path("api/bed/<int:bed_id>/remove/", views.bed_remove_api, name="bed_remove_api"),
    path("api/bed/<int:bed_id>/adjust/", views.bed_adjust_api, name="bed_adjust_api"),
    path("api/crop/<int:crop_id>/adjust/", views.crop_adjust_api, name="crop_adjust_api"),
    path("api/vegetable-types/", views.vegetable_types_api, name="vegetable_types_api"),
    path("api/bed/<int:bed_id>/plant/", views.bed_plant_api, name="bed_plant_api"),
]
