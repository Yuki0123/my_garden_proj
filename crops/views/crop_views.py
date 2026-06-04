import json

from django.db import transaction
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_POST

from crops.models import Crop, GardenArea, Plot


@require_POST
def save_crop(request):
    try:
        # JSから送られてきたJSONを解析
        data = json.loads(request.body)
        # 安全のためにトランザクションを張る（Crop作成とPlot紐付けをセットにする）
        with transaction.atomic():
            # ログインしているユーザーの畑を取得
            user_groups = request.user.groups.all()
            my_garden = GardenArea.objects.filter(owner_group__in=user_groups).first()
            if not my_garden:
                return JsonResponse(
                    {"status": "error", "message": "Garden not found"}, status=400
                )

            # 1. まず Crop 本体を作成
            new_crop = Crop.objects.create(
                vegetable_type_id=data["veg_id"],
                planted_at=timezone.now().date(),
                status="growing",
            )
            # 2. 占有する範囲の Plot をすべて取得
            # start_row から start_row + height までの範囲
            target_plots = Plot.objects.filter(
                area=my_garden,  # ユーザーのgardenを使用
                row_index__gte=data["row"],
                row_index__lt=data["row"] + data["height"],
                col_index__gte=data["col"],
                col_index__lt=data["col"] + data["width"],
            )
            print(f"DEBUG: 取得したPlot {target_plots}")
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
    # ログインしているユーザーの畑を取得
    user_groups = request.user.groups.all()
    my_garden = GardenArea.objects.filter(owner_group__in=user_groups).first()
    if not my_garden:
        return JsonResponse({"crops": []})

    # GardenArea に紐付く作物を、占有マス(plots)の情報付きで取得
    crops = (
        Crop.objects.filter(plots__area=my_garden)
        .distinct()
        .prefetch_related("plots", "vegetable_type")
    )

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
