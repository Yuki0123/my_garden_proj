import json

from django.contrib.auth.decorators import login_required
from django.shortcuts import render

from .models import GardenArea, Plot


@login_required
def index(request):
    # ログイン中のユーザー名を取得して表示
    return render(request, "crops/index.html", {"user_name": request.user.username})


@login_required
def garden_mypage(request):
    # ログインしているユーザーの畑だけを取得
    user_groups = request.user.groups.all()

    my_garden = GardenArea.objects.filter(owner_group__in=user_groups).first()

    if not my_garden:
        return render(request, "crops/mypage.html", {"garden": None})

    # 1. 全座標のデフォルト（空）の枠組みを作成
    # メモリ節約のため、必要な最小限のデータだけ入れる
    rows, cols = 70, 180
    plot_dict = {}
    for r in range(rows):
        for c in range(cols):
            plot_dict[f"{r}-{c}"] = {"is_bed": False, "crop": None}

    # 2. データベースにある「実在するマス（Plot）」を取得
    # prefetch_related で 紐付く 畝(beds) と 作物(crop_here) を一気に引く
    plots_in_db = Plot.objects.filter(area=my_garden).prefetch_related(
        "beds", "crop_here__vegetable_type"
    )

    for p in plots_in_db:
        key = f"{p.row_index}-{p.col_index}"  # モデルのフィールド名に合わせて調整してください
        if key in plot_dict:
            # 畝に属しているか判定
            plot_dict[key]["is_bed"] = p.beds.exists()
            plot_dict[key]["id"] = p.id

            # 作物があれば情報を入れる
            if hasattr(p, "crop_here") and p.crop_here:
                plot_dict[key]["crop"] = {
                    "name": p.crop_here.vegetable_type.name,
                    "icon": p.crop_here.vegetable_type.icon.url
                    if p.crop_here.vegetable_type.icon
                    else None,
                }

    # 3. JSONに変換してテンプレートへ

    print(
        f"DEBUG: 作成された辞書の件数 -> {len(plot_dict)}"
    )  # ここが 12600 になっているか？
    plot_json = json.dumps(plot_dict)
    print(
        f"DEBUG: 生成されたJSONの文字数 -> {len(plot_json)}"
    )  # ここが数千程度だと少なすぎます

    context = {
        "garden": my_garden,
        # views.py
        "plot_json": plot_dict,  # JSで読み込む用
    }

    # views.py

    return render(request, "crops/mypage.html", context)
