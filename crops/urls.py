from django.urls import path

from . import views

urlpatterns = [
    # http://.../garden/mypage/ でアクセスできるようにする
    path("mypage/", views.garden_mypage, name="garden_mypage"),
]
