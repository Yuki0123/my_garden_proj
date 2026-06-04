import json
import zoneinfo

from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.db.models import Q
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.views.decorators.http import require_POST

from crops.models import Bed, GardenArea, Plot


@login_required
@require_POST
def save_bed_layout(request):
    try:
        data = json.loads(request.body)
        area_id = data.get("area_id")

        bed_id = data.get("bed_id")
        start_row = int(data.get("row"))
        start_col = int(data.get("col"))
        width = int(data.get("width"))
        height = int(data.get("height"))

        # 1. フロントから送られてきた日付（"2026-05-23"など）をベースに月日を抽出
        date_str_input = data.get("date")
        tokyo_tz = zoneinfo.ZoneInfo("Asia/Tokyo")
        now_tokyo = timezone.now().astimezone(tokyo_tz)
        time_str = now_tokyo.strftime("%H%M")  # 現在の時分 (例: 1845)

        if date_str_input:
            parsed_date = parse_date(date_str_input)
            if parsed_date:
                month_day_str = parsed_date.strftime("%m%d")  # 例: "0523"
            else:
                month_day_str = now_tokyo.strftime("%m%d")
        else:
            month_day_str = now_tokyo.strftime("%m%d")

        bed_name = f"畝_{month_day_str}_{time_str}"

        # 2. ユーザーの所属グループから対象の畑（GardenArea）を安全に取得
        user_groups = request.user.groups.all()
        my_garden = get_object_or_404(
            GardenArea, id=area_id, owner_group__in=user_groups
        )

        print(
            f"DEBUG: 畝保存開始（参考コード準拠） - 名前: {bed_name}, 範囲: R{start_row}C{start_col} ({width}x{height})"
        )

        # 3. 畝とプロットの紐づけ（トランザクションで安全に実行）
        with transaction.atomic():
            if bed_id:
                # 既存の畝を編集する場合
                bed = get_object_or_404(Bed, id=bed_id, area=my_garden)
                if data.get("name"):
                    bed.name = bed_name
                    bed.save()
            else:
                # 1. まず Bed 本体を作成
                bed = Bed.objects.create(area=my_garden, name=bed_name)

            print(f"DEBUG: Bed本体の作成/取得に成功 - ID: {bed.id}")

            # 2. 占有する範囲の Plot をすべてフィルタリングして一括取得
            target_plots = Plot.objects.filter(
                area=my_garden,
                row_index__gte=start_row,
                row_index__lt=start_row + height,
                col_index__gte=start_col,
                col_index__lt=start_col + width,
            )

            print(f"DEBUG: 取得したPlot数: {target_plots.count()}")

            # 3. ManyToManyField（多対多）にセット
            # これにより、中間テーブルへ一瞬で美味いことデータが保存されます！
            bed.plots.set(target_plots)

            print(f"DEBUG: Bed ID {bed.id} に Plotの一括マッピングが完了しました。")

        return JsonResponse(
            {"status": "success", "message": f"{bed_name} を登録しました"}
        )

    except Exception as e:
        print(f"❌ 畝保存エラー: {str(e)}")
        return JsonResponse({"status": "error", "message": str(e)}, status=500)


def get_beds(request):
    """
    選択された日付（selected_date）時点の、
    畑全体のプロットデータ（plot_data）と畝データ（bed_data）を両方一括で返すAPI
    """
    try:
        area_id = request.GET.get("area_id")
        date_str = request.GET.get("date")

        user_groups = request.user.groups.all()
        my_garden = get_object_or_404(
            GardenArea, id=area_id, owner_group__in=user_groups
        )

        if date_str:
            target_date = parse_date(date_str) or timezone.now().date()
        else:
            target_date = timezone.now().date()

        # ==========================================
        # 1. bed_data (plot_to_bed_map) の組み立て
        # ==========================================
        plot_to_bed_map = {}
        beds = (
            Bed.objects.filter(area=my_garden, created_at__lte=target_date)
            .filter(Q(deleted_at__isnull=True) | Q(deleted_at__gt=target_date))
            .prefetch_related("plots")
        )

        for bed in beds:
            for plot in bed.plots.all():
                key = f"{plot.row_index}-{plot.col_index}"
                plot_to_bed_map[key] = {
                    "bed_id": bed.id,
                    "name": bed.name,
                    "created_at": bed.created_at.isoformat(),
                    "deleted_at": bed.deleted_at.isoformat()
                    if bed.deleted_at
                    else None,
                }

        # ==========================================
        # 2. plot_data (plot_dict) の組み立て（180 × 70の大勝利グリッド）
        # ==========================================
        rows, cols = 180, 70
        plot_dict = {}
        for r in range(rows):
            for c in range(cols):
                plot_dict[f"{r}-{c}"] = {"is_bed": False, "crop": None}

        # データベースにある実在するマスを取得
        plots_in_db = Plot.objects.filter(area=my_garden).prefetch_related(
            "beds",
            "crop_here__vegetable_type",
        )

        for p in plots_in_db:
            key = f"{p.row_index}-{p.col_index}"
            if key in plot_dict:
                # 💡 この日付において有効な畝に属しているか判定
                # さきほど組み立てた plot_to_bed_map にキーがあれば、この日は畝が存在する
                plot_dict[key]["is_bed"] = key in plot_to_bed_map
                plot_dict[key]["id"] = p.id

                # 作物情報があれば入れる（※必要に応じて時間軸フィルターをかけてもOK）
                if hasattr(p, "crop_here") and p.crop_here:
                    crop = p.crop_here
                    plot_dict[key]["crop"] = {
                        "id": crop.id,
                        "v_type_id": crop.vegetable_type.id,
                        "name": crop.vegetable_type.name,
                        "icon": crop.vegetable_type.icon.url
                        if crop.vegetable_type.icon
                        else None,
                        "planted_at": crop.planted_at.isoformat(),
                        "harvested_at": crop.harvested_at.isoformat()
                        if crop.harvested_at
                        else None,
                    }

        # ==========================================
        # 3. 両方のデータを1つのJSONにパックして返却
        # ==========================================
        return JsonResponse({"bed_data": plot_to_bed_map, "plot_data": plot_dict})

    except Exception as e:
        print(f"❌ get_beds 総合リフレッシュエラー: {str(e)}")
        return JsonResponse({"status": "error", "message": str(e)}, status=500)
