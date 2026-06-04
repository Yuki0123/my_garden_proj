from django.contrib.auth.decorators import login_required
from django.shortcuts import render

from crops.models import Bed, GardenArea, Plot, VegetableType


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
    plot_to_bed_map = {}
    beds = Bed.objects.filter(area=my_garden)
    print(f"DEBUG: 畝の数: {beds.count()}")

    for bed in beds:
        for plot in bed.plots.all():
            # "行-列" をキーにして bed_id を保存
            key = f"{plot.row_index}-{plot.col_index}"
            plot_to_bed_map[key] = {
                "bed_id": bed.id,
                "name": bed.name,
                "created_at": bed.created_at.isoformat(),
                "deleted_at": bed.deleted_at.isoformat() if bed.deleted_at else None,
            }
    # 1. 全座標のデフォルト（空）の枠組みを作成
    # メモリ節約のため、必要な最小限のデータだけ入れる
    rows, cols = 180, 70
    plot_dict = {}
    for r in range(rows):
        for c in range(cols):
            plot_dict[f"{r}-{c}"] = {"is_bed": False, "crop": None}

    # 2. データベースにある「実在するマス（Plot）」を取得
    # prefetch_related で 紐付く 畝(beds) と 作物(crop_here) を一気に引く
    plots_in_db = Plot.objects.filter(
        area=my_garden
    ).prefetch_related(
        "beds",
        "crop_here__vegetable_type",  # Cropを連れてくるついでに、アイコン(Type)も持ってくるだけ
    )

    for p in plots_in_db:
        key = f"{p.row_index}-{p.col_index}"  # モデルのフィールド名に合わせて調整してください
        if key in plot_dict:
            # 畝に属しているか判定
            plot_dict[key]["is_bed"] = p.beds.exists()
            plot_dict[key]["id"] = p.id

            # 作物があれば情報を入れる
            if hasattr(p, "crop_here") and p.crop_here:
                crop = p.crop_here
                plot_dict[key]["crop"] = {
                    "id": crop.id,
                    "v_type_id": crop.vegetable_type.id,
                    "name": crop.vegetable_type.name,
                    "icon": crop.vegetable_type.icon.url
                    if crop.vegetable_type.icon
                    else None,
                    "planted_at": crop.planted_at.isoformat(),  # 文字列にしてJSで扱えるようにする
                    "harvested_at": crop.harvested_at.isoformat()
                    if crop.harvested_at
                    else None,
                }

    v_types_data = list(
        VegetableType.objects.select_related("family").values(
            "id",
            "name",
            "spacing_cm",
            "icon",  # ここは後でURLに変換が必要
            "family__name",  # アンダーバー2つで関連モデルの値を取れる
        )
    )

    context = {
        "garden": my_garden,
        "v_types_data": v_types_data,
        "plot_data": plot_dict,  # JSで読み込む用
        "bed_data": plot_to_bed_map,  # JSで読み込む用
    }

    # views.py

    return render(request, "crops/mypage.html", context)
