from django.urls import path

from . import views

app_name = "garden"

urlpatterns = [
    path("", views.mypage, name="mypage"),
    path("api/area/<int:area_id>/state/", views.area_state_api, name="area_state_api"),
]
