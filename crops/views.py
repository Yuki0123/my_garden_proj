import json

from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.db.models import Q
from django.http import JsonResponse
from django.shortcuts import render
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.views.decorators.http import require_POST

from .models import Bed, Crop, GardenArea, MaintenanceLog, Plot, VegetableType


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
        "bed_data": plot_to_bed_map,  # JSで読み込む用
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


# views.py
def get_maintenance_logs(request):
    area_id = request.GET.get("area_id")
    date_str = request.GET.get("date")
    crop_id = request.GET.get("crop_id")
    bed_id = request.GET.get("bed_id")

    # 1. 条件の組み立て
    conditions = Q()
    has_condition = False
    conditions = Q(area_id=area_id)
    # 日付での絞り込みを追加
    if date_str:
        conditions &= Q(worked_at=date_str)
        has_condition = True

    if crop_id and crop_id not in ["null", "", "undefined"]:
        conditions |= Q(crop_id=crop_id)
        has_condition = True

    if bed_id and bed_id not in ["null", "", "undefined"]:
        conditions |= Q(bed_id=bed_id)
        has_condition = True

    # 2. 条件がない場合は早期リターン（ここが重要）
    if not has_condition:
        # 何も紐づいていない場所なら空リストを返す
        return JsonResponse([], safe=False)

    # デバッグ用：どんな条件が作られたかコンソールで確認

    # フィルタリング実行
    logs = (
        MaintenanceLog.objects.filter(conditions).distinct().order_by("-worked_at")[:10]
    )
    print("logs", logs)
    data = []
    for log in logs:
        # このログに紐付いている最初のプロットを取得
        # (通常は1クリック1ログなので .first() で座標が特定できる)
        plot = log.plots.first()

        if not plot:
            continue

        data.append(
            {
                "id": log.id,
                "task_type": log.task_type,
                "task_display": log.get_task_type_display(),  # 「除草」などの日本語名
                "row": plot.row_index,
                "col": plot.col_index,
                "note": log.note,
                "crop_id": log.crop_id,
                "bed_id": log.bed_id,
                "date": log.worked_at.strftime("%m/%d"),
                "task": log.get_task_type_display(),
            }
        )

    return JsonResponse(data, safe=False)


@require_POST
def save_maintenance_log(request):
    try:
        data = json.loads(request.body)

        # 1. JSからのデータ受け取り
        area_id = data.get("area_id")
        # row, col は Plot を特定するために使用
        row = data.get("row")
        col = data.get("col")

        crop_id = data.get("crop_id")
        bed_id = data.get("bed_id")
        task_type = data.get("task_type")
        note = data.get("note")
        worked_at_str = data.get("date")

        # 2. ログの作成 (ここには row, col は含めない)
        log = MaintenanceLog.objects.create(
            area_id=area_id,
            crop_id=crop_id,
            bed_id=bed_id,
            task_type=task_type,
            note=note,
            worked_at=parse_date(worked_at_str) if worked_at_str else None,
            user=request.user if request.user.is_authenticated else None,
        )

        # 3. 場所（Plot）の特定と紐付け
        # Plotモデルの row_index, col_index を使って検索
        plot, created = Plot.objects.get_or_create(
            area_id=area_id, row_index=row, col_index=col
        )

        # 4. ManyToManyフィールドへ追加 (これで場所が記録される)
        log.plots.add(plot)

        return JsonResponse({"status": "success", "log_id": log.id})

    except Exception as e:
        import traceback

        traceback.print_exc()
        return JsonResponse({"status": "error", "message": str(e)}, status=400)


# views.py (新しく追加)
def get_plot_history(request):
    area_id = request.GET.get("area_id")
    crop_id = request.GET.get("crop_id")
    bed_id = request.GET.get("bed_id")
    tokyo_tz = timezone.get_current_timezone()
    # 1. 条件の組み立て
    conditions = Q()
    has_condition = False

    conditions = Q(area_id=area_id)

    if crop_id and crop_id not in ["null", "", "undefined"]:
        conditions &= Q(crop_id=crop_id)
        has_condition = True

    if bed_id and bed_id not in ["null", "", "undefined"]:
        conditions &= Q(bed_id=bed_id)
        has_condition = True
    print(f"DEBUG: area_id={area_id}, crop_id={crop_id}, bed_id={bed_id}")
    print(f"DEBUG: condition={conditions}")

    # 2. 条件がない場合は早期リターン（ここが重要）
    if not has_condition:
        # 何も紐づいていない場所なら空リストを返す
        return JsonResponse([], safe=False)

    # デバッグ用：どんな条件が作られたかコンソールで確認

    # フィルタリング実行
    logs = (
        MaintenanceLog.objects.filter(conditions).distinct().order_by("-worked_at")[:10]
    )
    print("logs", logs)
    data = []
    for log in logs:
        # このログに紐付いている最初のプロットを取得
        # (通常は1クリック1ログなので .first() で座標が特定できる)
        plot = log.plots.first()

        if not plot:
            continue
        local_worked_at = log.worked_at.astimezone(tokyo_tz)
        data.append(
            {
                "id": log.id,
                "task_type": log.task_type,
                "task_display": log.get_task_type_display(),  # 「除草」などの日本語名
                "row": plot.row_index,
                "col": plot.col_index,
                "note": log.note,
                "crop_id": log.crop_id,
                "bed_id": log.bed_id,
                "date": local_worked_at.strftime("%m/%d"),
                "task": log.get_task_type_display(),
            }
        )

    return JsonResponse(data, safe=False)
