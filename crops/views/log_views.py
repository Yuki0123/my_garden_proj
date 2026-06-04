import json

from django.db.models import Q
from django.http import JsonResponse
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.views.decorators.http import require_POST

from crops.models import (
    MaintenanceLog,
    Plot,
)


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
