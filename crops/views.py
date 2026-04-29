import json

from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.http import JsonResponse
from django.shortcuts import render
from django.utils import timezone
from django.views.decorators.http import require_POST

from .models import Crop, GardenArea, Plot, VegetableType


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
    }

    # views.py

    return render(request, "crops/mypage.html", context)


@require_POST
def save_crop(request):
    try:
        # JSから送られてきたJSONを解析
        data = json.loads(request.body)
        # 安全のためにトランザクションを張る（Crop作成とPlot紐付けをセットにする）
        with transaction.atomic():
            # 1. まず Crop 本体を作成
            new_crop = Crop.objects.create(
                vegetable_type_id=data["veg_id"],
                planted_at=timezone.now().date(),
                status="growing",
            )
            print(data)
            # 2. 占有する範囲の Plot をすべて取得
            # start_row から start_row + height までの範囲
            target_plots = Plot.objects.filter(
                area_id=1,  # ひとまずID=1。実際は適切に取得
                row_index__gte=data["row"],
                row_index__lt=data["row"] + data["height"],
                col_index__gte=data["col"],
                col_index__lt=data["col"] + data["width"],
            )
            print(f"DEBUG: 該当Plot数 {target_plots.count()}")
            # 3. ManyToManyField にセット
            new_crop.plots.set(target_plots)

        return JsonResponse(
            {
                "status": "success",
                "crop_id": new_crop.id,
                "plot_count": target_plots.count(),
            }
        )

    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)


def get_crops(request):
    # GardenArea ID=1 に紐付く作物を、占有マス(plots)の情報付きで取得
    crops = Crop.objects.filter(
        main_plot__area_id=1
    ).distinct()  # モデル名に合わせて調整
    # もし ManyToMany の plots を使っているなら prefetch_related を使うと速いです
    crops = Crop.objects.prefetch_related("plots").all()

    data = []
    for crop in crops:
        # 占有しているマスのリストから、描画に必要な row, col の範囲を計算
        all_plots = crop.plots.all()
        if not all_plots:
            continue

        rows = [p.row_index for p in all_plots]
        cols = [p.col_index for p in all_plots]

        data.append(
            {
                "id": crop.id,
                "veg_name": crop.vegetable_type.name if crop.vegetable_type else "不明",
                "planted_at": crop.planted_at.isoformat(),  # ここ！
                "harvested_at": crop.harvested_at.isoformat()
                if crop.harvested_at
                else None,  # ここ！
                "row": min(rows),
                "col": min(cols),
                "width": max(cols) - min(cols) + 1,
                "height": max(rows) - min(rows) + 1,
                "color": getattr(crop.vegetable_type, "color", "#7ed321"),  # 野菜の色
                "icon_url": crop.vegetable_type.icon.url
                if crop.vegetable_type.icon
                else "/static/images/default.png",
                "planting_method": crop.vegetable_type.planting_method,
                "spacing_cm": crop.vegetable_type.spacing_cm,
            }
        )

    return JsonResponse({"crops": data})


@require_POST
def harvest_crop(request, crop_id):
    try:
        data = json.loads(request.body)
        harvest_date_str = data.get("harvested_at")  # フロントからの日付を取得

        crop = Crop.objects.get(id=crop_id)
        crop.harvested_at = harvest_date_str
        crop.save()

        return JsonResponse({"status": "success", "harvested_at": harvest_date_str})
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)
