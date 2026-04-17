from django.contrib.auth.decorators import login_required
from django.shortcuts import render

from .models import GardenArea


@login_required
def index(request):
    # ログイン中のユーザー名を取得して表示
    return render(request, "crops/index.html", {"user_name": request.user.username})


@login_required
def garden_mypage(request):
    # ログインしているユーザーの畑だけを取得
    user_groups = request.user.groups.all()
    print("ユーザーの所属グループ:", user_groups, request.user.username)
    my_garden = GardenArea.objects.filter(owner_group__in=user_groups).first()
    # my_garden = GardenArea.objects.first()
    return render(request, "crops/mypage.html", {"garden": my_garden})
