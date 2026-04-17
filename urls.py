from django.contrib import admin
from django.urls import include, path
from django.views.generic import RedirectView

urlpatterns = [
    path("admin/", admin.site.urls),
    # これを追加することで login/, logout/ などが自動で有効になります
    path("accounts/", include("django.contrib.auth.urls")),
    # cropsアプリのURL設定を読み込む
    path("garden/", include("crops.urls")),
    # トップページ（/）にアクセスしたときに /garden/ に飛ばす設定（任意）
    path("", RedirectView.as_view(url="/garden/", permanent=True)),
]
