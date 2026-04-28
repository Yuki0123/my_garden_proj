import csv
import datetime
import json
import os
import zipfile
from io import TextIOWrapper

from django import forms
from django.contrib import admin, messages
from django.contrib.admin import helpers
from django.core.files.base import ContentFile
from django.db import models
from django.http import HttpResponseRedirect, JsonResponse
from django.shortcuts import get_object_or_404, render
from django.urls import path
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.utils.safestring import mark_safe

from .models import (
    Bed,
    Crop,
    GardenArea,
    MaintenanceLog,
    Plot,
    SoilStatusArea,
    VegetableFamily,
    VegetableType,
)


class VegetableTypeImportForm(forms.Form):
    csv_file = forms.FileField(
        label="CSVファイル",
        help_text="name,family,spacing_cm,icon_filename の列を含むCSV。例: トマト,ナス科,50,tomato.svg",
    )
    zip_file = forms.FileField(
        label="アイコンZIPファイル",
        required=False,
        help_text="CSV の icon_filename に対応する画像ファイルを含む ZIP。SVG/PNG/JPG を可。",
    )


# --- GardenArea (エリア) の設定 ---
@admin.register(GardenArea)
class GardenAreaAdmin(admin.ModelAdmin):
    list_display = ("name", "rows", "cols", "grid_link")

    def grid_link(self, obj):
        # layout/ に飛ばすように変更
        return mark_safe(
            f'<a class="button" href="{obj.pk}/layout/">レイアウト編集</a> '
            f'<a class="button" href="{obj.pk}/manage/" style="background:#417690;">管理モード</a>'
        )

    grid_link.short_description = "アクション"

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path(
                "<int:pk>/layout/",
                self.admin_site.admin_view(self.layout_view),
                name="gardenarea-layout",
            ),
            path(
                "<int:pk>/manage/",
                self.admin_site.admin_view(self.manage_view),
                name="gardenarea-manage",
            ),
            path(
                "<int:pk>/assign-range/",
                self.admin_site.admin_view(self.assign_range_view),
                name="assign-grid-range",
            ),
            path(
                "<int:pk>/plant-crop/",
                self.admin_site.admin_view(self.plant_crop_view),
                name="plant-crop",
            ),
            path(
                "<int:pk>/assign-soil-status/",
                self.admin_site.admin_view(self.assign_soil_status_view),
                name="assign-soil-status",
            ),
            path(
                "<int:pk>/get-logs/<int:plot_id>/",
                self.admin_site.admin_view(self.get_plot_logs),
                name="plot-logs",
            ),
            path(
                "<int:pk>/save-maintenance/",
                self.admin_site.admin_view(self.save_maintenance),
                name="save-maintenance",
            ),
        ]
        return custom_urls + urls

    def layout_view(self, request, pk):
        instance = get_object_or_404(GardenArea, pk=pk)
        selected_date_str = request.GET.get("date", timezone.now().date().isoformat())
        selected_date = datetime.date.fromisoformat(selected_date_str)

        # 【ここで共通関数を呼ぶ】
        data = self.get_common_grid_data(instance, selected_date)

        context = {
            **self.admin_site.each_context(request),
            "instance": instance,
            "grid_range_rows": range(instance.rows),
            "grid_range_cols": range(instance.cols),
            "selected_date": selected_date_str,
            "all_plot_ids_dict": data["all_plot_ids_dict"],
            "plot_json": data["plot_dict"],
            "v_type_list": data["v_types_data"],
        }
        return render(request, "admin/crops/garden_layout.html", context)

    def manage_view(self, request, pk):
        instance = get_object_or_404(GardenArea, pk=pk)
        selected_date_str = request.GET.get("date", timezone.now().date().isoformat())
        selected_date = datetime.date.fromisoformat(selected_date_str)

        # 【管理画面でも同じ関数を呼ぶだけ！】
        data = self.get_common_grid_data(instance, selected_date)
        context = {
            **self.admin_site.each_context(request),
            "instance": instance,
            "grid_range_rows": range(instance.rows),
            "grid_range_cols": range(instance.cols),
            "selected_date": selected_date_str,
            "all_plot_ids_dict": data["all_plot_ids_dict"],
            "plot_json": data["plot_dict"],
            "v_type_list": data["v_types_data"],
            "daily_logs": data["daily_logs"],  # 追加
            # 管理画面専用のデータがあればここに追加
        }

        return render(request, "admin/crops/garden_manage.html", context)

    def get_plot_logs(self, request, plot_id, **kwargs):
        # そのPlotに関連付けられた最新3件のログを取得
        logs = MaintenanceLog.objects.filter(plots__id=plot_id).order_by("-worked_at")[
            :3
        ]

        log_list = []
        for log in logs:
            log_list.append(
                {
                    "worked_at": log.worked_at.strftime("%m/%d %H:%M"),
                    "task_display": log.get_task_type_display(),
                    "user": log.user.username if log.user else "不明",
                    "note": log.note,
                }
            )

        return JsonResponse({"logs": log_list})

    def get_daily_logs(self, instance, selected_date):
        # 指定された日付のデータを全て取得（plotに関係なく）
        logs = MaintenanceLog.objects.filter(
            area=instance, worked_at__date=selected_date
        )
        log_list = []
        for log in logs:
            log_list.append(
                {
                    "worked_at": log.worked_at.strftime("%m/%d %H:%M"),
                    "task_display": log.get_task_type_display(),
                    "plots": [
                        f"[{p.row_index}-{p.col_index}]" for p in log.plots.all()
                    ],
                    "user": log.user.username if log.user else "不明",
                    "note": log.note,
                }
            )
        return {"rlogs": log_list}

    def get_common_grid_data(self, instance, selected_date):
        # 1. 全マスのID対応表
        all_plots_qs = Plot.objects.filter(area=instance).values_list(
            "row_index", "col_index", "id"
        )
        all_plot_ids_dict = {f"{r}-{c}": pid for r, c, pid in all_plots_qs}

        # 2. 指定日にアクティブな情報を取得
        active_beds = instance.beds.filter(created_at__lte=selected_date).filter(
            models.Q(deleted_at__gte=selected_date) | models.Q(deleted_at__isnull=True)
        )
        active_bed_ids = set(active_beds.values_list("id", flat=True))

        soil_areas = (
            SoilStatusArea.objects.filter(area=instance, start_date__lte=selected_date)
            .filter(
                models.Q(end_date__gte=selected_date) | models.Q(end_date__isnull=True)
            )
            .prefetch_related("plots")
        )

        plot_soil_map = {}
        for sa in soil_areas:
            for p_obj in sa.plots.all():
                plot_soil_map[p_obj.id] = sa.status_type

        logged_plot_ids = MaintenanceLog.objects.filter(
            area=instance, worked_at__date=selected_date
        ).values_list("plots__id", flat=True)

        active_plots = (
            Plot.objects.filter(area=instance)
            .filter(
                models.Q(beds__in=active_beds)
                | models.Q(status_areas__in=soil_areas)
                | models.Q(crop_here__isnull=False)
                | models.Q(id__in=logged_plot_ids)
            )
            .distinct()
            .select_related("crop_here__vegetable_type")
            .prefetch_related("beds")
        )

        # --- 追加：指定日のメンテナンスログをプロットごとに集計 ---
        # 園エリア(instance)に紐づく、その日のログを取得
        daily_maintenance = MaintenanceLog.objects.filter(
            area=instance, worked_at__date=selected_date
        ).prefetch_related("plots")

        # plot_id をキーにして、そのプロットで行われた作業内容を格納する辞書
        plot_maintenance_map = {}
        for log in daily_maintenance:
            for p in log.plots.all():
                if p.id not in plot_maintenance_map:
                    plot_maintenance_map[p.id] = []
                plot_maintenance_map[p.id].append(
                    {
                        "task": log.get_task_type_display(),
                        "user": log.user.username if log.user else "不明",
                    }
                )

        # 3. マス目ごとのデータ作成
        plot_dict = {}
        for p in active_plots:
            key = f"{p.row_index}-{p.col_index}"

            current_crop = None
            try:
                c = p.crop_here
                if c.planted_at <= selected_date and (
                    c.harvested_at is None or c.harvested_at >= selected_date
                ):
                    current_crop = c
            except:  # noqa: E722
                pass

            plot_bed_ids = set(p.beds.values_list("id", flat=True))
            is_active_bed = not plot_bed_ids.isdisjoint(active_bed_ids)

            plot_dict[key] = {
                "id": p.id,
                "is_bed": is_active_bed,
                "soil_status": plot_soil_map.get(p.id, ""),
                "crop_name": current_crop.vegetable_type.name if current_crop else "",
                "crop_icon_url": current_crop.vegetable_type.icon.url
                if current_crop and current_crop.vegetable_type.icon
                else "",
                "maintenance": plot_maintenance_map.get(p.id, []),
            }

        # 4. 野菜アイコンリスト
        v_types_data = []
        for vt in VegetableType.objects.select_related("family").all():
            v_types_data.append(
                {
                    "id": vt.id,
                    "name": vt.name,
                    "spacing": vt.spacing_cm,
                    "icon_url": vt.icon.url if vt.icon else "",
                    "family_name": vt.family.name,
                }
            )

        daily_logs = []
        for log in daily_maintenance:
            daily_logs.append(
                {
                    "worked_at": log.worked_at.strftime("%H:%M"),
                    "task_display": log.get_task_type_display(),
                    "user": log.user.username if log.user else "不明",
                    "plots": [
                        f"[{p.row_index}-{p.col_index}]" for p in log.plots.all()
                    ],
                    "note": log.note,
                }
            )

        return {
            "all_plot_ids_dict": all_plot_ids_dict,
            "plot_dict": plot_dict,
            "v_types_data": v_types_data,
            "daily_logs": daily_logs,
        }

    def assign_range_view(self, request, pk):
        print(f"Received assign range request: {request.body}")
        if request.method == "POST":
            data = json.loads(request.body)
            mode = data.get("mode")
            created_at = data.get("date")
            plot_ids = data.get("plot_ids", [])

            if not plot_ids:
                return JsonResponse(
                    {"status": "error", "message": "マスが選択されていません"}
                )

            if mode == "create_bed":
                new_name = (
                    data.get("bed_name") or f"畝_{timezone.now().strftime('%m%d_%H%M')}"
                )
                new_bed = Bed.objects.create(
                    area_id=pk, name=new_name, created_at=created_at
                )
                plots = Plot.objects.filter(id__in=plot_ids)
                for p in plots:
                    p.beds.clear()
                new_bed.plots.set(plot_ids)
                return JsonResponse(
                    {
                        "status": "ok",
                        "message": f"新しい畝「{new_bed.name}」を登録しました",
                    }
                )

            elif mode == "clear":
                plots = Plot.objects.filter(id__in=plot_ids)
                for p in plots:
                    p.beds.clear()
                return JsonResponse(
                    {"status": "ok", "message": "選択範囲の畝解除が完了しました"}
                )

        return JsonResponse(
            {"status": "error", "message": "不正なリクエストです"}, status=400
        )

    def assign_soil_status_view(self, request, pk):
        if request.method == "POST":
            data = json.loads(request.body)
            status_type = data.get("status_type")
            start_date = data.get("date")
            plot_ids = data.get("plot_ids", [])
            print(
                f"Received soil status assignment: {status_type} starting from {start_date} for plots {plot_ids}"
            )

            new_status = SoilStatusArea.objects.create(
                area_id=pk, status_type=status_type, start_date=start_date
            )
            new_status.plots.set(plot_ids)
            return JsonResponse({"status": "ok"})

        return JsonResponse(
            {"status": "error", "message": "不正なリクエストです"}, status=400
        )

    def save_maintenance(self, request, pk):
        if request.method == "POST":
            try:
                data = json.loads(request.body)
                plot_ids = data.get("plot_ids", [])
                date_str = data.get("date")
                task_type = data.get("task_type")
                note = data.get("note")

                # 日付文字列をオブジェクトに変換（エラー回避のため）
                worked_date = parse_date(date_str) if date_str else None

                # filtered_ids = [pid for pid in plot_ids if pid <= 80]
                # print(f"DEBUG: Received plot_ids(<=80)={filtered_ids}")
                # print(f"DEBUG: Received plot_ids={plot_ids}")
                # 新しいログを作成
                log = MaintenanceLog.objects.create(
                    area_id=pk,
                    user=request.user,
                    task_type=task_type,
                    worked_at=worked_date,
                    note=note,
                )
                # ManyToManyの紐付け
                log.plots.set(plot_ids)
                # 保存を確定させるために一応
                instance = GardenArea.objects.get(pk=pk)  # GardenAreaは実際のモデル名に
                logs_data = self.get_daily_logs(instance, worked_date)

                log.save()
                return JsonResponse({"status": "success", "rlogs": logs_data["rlogs"]})
            except Exception as e:
                return JsonResponse({"status": "error", "message": str(e)}, status=500)
        return JsonResponse(
            {"status": "error", "message": "Invalid request"}, status=400
        )

    def plant_crop_view(self, request, pk):
        """
        [修正] フォームから row/col の代わりに plot_ids (JSON配列) を受け取る。
        複数マス選択対応。mode='plant' で登録、mode='delete' で削除。
        """
        if request.method == "POST":
            mode = request.POST.get("mode")  # 'plant' or 'delete'

            # [修正] modal-plot-ids から Plot ID リストを取得
            raw_ids = request.POST.get("modal-plot-ids", "[]")
            try:
                plot_ids = json.loads(raw_ids)
            except (json.JSONDecodeError, ValueError):
                plot_ids = []

            if not plot_ids:
                self.message_user(
                    request, "対象のマスが指定されていません", level="error"
                )
                return HttpResponseRedirect("../grid/")

            plots = Plot.objects.filter(id__in=plot_ids, area_id=pk)

            if mode == "delete":
                deleted_names = []
                for plot in plots:
                    if hasattr(plot, "crop_here"):
                        name = (
                            plot.crop_here.vegetable_type.name
                            if plot.crop_here.vegetable_type
                            else "不明"
                        )
                        deleted_names.append(name)
                        plot.crop_here.delete()
                if deleted_names:
                    self.message_user(
                        request, f"{', '.join(deleted_names)} を削除しました"
                    )
                else:
                    self.message_user(request, "削除対象の作物がありませんでした")
            else:
                type_id = request.POST.get("vegetable_type_id")
                planted_at = request.POST.get("planted_at")
                if not type_id or not planted_at:
                    self.message_user(
                        request, "野菜の種類と植付日を選択してください", level="error"
                    )
                    return HttpResponseRedirect("../grid/")

                for plot in plots:
                    # 既存の作付けは上書き
                    Crop.objects.filter(main_plot=plot).delete()
                    Crop.objects.create(
                        vegetable_type_id=type_id, main_plot=plot, planted_at=planted_at
                    )
                self.message_user(request, f"{plots.count()} マスに作物を登録しました")

        return HttpResponseRedirect("../layout/")


@admin.register(SoilStatusArea)
class SoilStatusAreaAdmin(admin.ModelAdmin):
    list_display = ("status_type", "area", "start_date", "end_date", "plot_count")
    list_filter = ("status_type", "area")
    readonly_fields = ("display_plots",)
    exclude = ("plots",)

    def display_plots(self, obj):
        plots = obj.plots.all().order_by("row_index", "col_index")
        plot_list = [f"[{p.row_index}-{p.col_index}]" for p in plots]
        return ", ".join(plot_list) if plot_list else "なし"

    display_plots.short_description = "対象のマス (保存済み)"

    def plot_count(self, obj):
        return obj.plots.count()

    plot_count.short_description = "マス数"


@admin.register(Bed)
class BedAdmin(admin.ModelAdmin):
    list_display = ("name", "area", "created_at", "deleted_at")
    list_filter = ("area",)
    readonly_fields = ("display_plots",)
    exclude = ("plots",)

    def display_plots(self, obj):
        plots = obj.plots.all().order_by("row_index", "col_index")
        plot_list = [f"[{p.row_index}-{p.col_index}]" for p in plots]
        return ", ".join(plot_list) if plot_list else "なし"

    display_plots.short_description = "所属するマス (保存済み)"

    def plot_count(self, obj):
        return obj.plots.count()

    plot_count.short_description = "マス数"


class PlotRangeForm(forms.Form):
    _selected_action = forms.CharField(widget=forms.MultipleHiddenInput)
    bed = forms.ModelChoiceField(queryset=Bed.objects.all(), label="割り当てる畝")
    row_start = forms.IntegerField(label="行開始 (0〜)", min_value=0)
    row_end = forms.IntegerField(label="行終了", min_value=0)
    col_start = forms.IntegerField(label="列開始 (0〜)", min_value=0)
    col_end = forms.IntegerField(label="列終了", min_value=0)


@admin.register(Plot)
class PlotAdmin(admin.ModelAdmin):
    list_display = ("id", "area", "row_index", "col_index")
    list_filter = ("area",)
    search_fields = ("row_index", "col_index")
    actions = ["assign_plots_to_bed"]

    @admin.action(description="指定範囲のマスを畝に一括割り当て")
    def assign_plots_to_bed(self, request, queryset):
        if "apply" in request.POST:
            form = PlotRangeForm(request.POST)
            if form.is_valid():
                bed = form.cleaned_data["bed"]
                r_start = form.cleaned_data["row_start"]
                r_end = form.cleaned_data["row_end"]
                c_start = form.cleaned_data["col_start"]
                c_end = form.cleaned_data["col_end"]

                updated_count = Plot.objects.filter(
                    area=bed.area,
                    row_index__range=(r_start, r_end),
                    col_index__range=(c_start, c_end),
                ).update(bed=bed)

                self.message_user(
                    request,
                    f"{updated_count} 個のマスを「{bed.name}」に割り当てました。",
                )
                return HttpResponseRedirect(request.get_full_path())

        initial_data = {
            "_selected_action": request.POST.getlist(helpers.ACTION_CHECKBOX_NAME)
        }
        if queryset.exists():
            initial_data.update(
                {
                    "row_start": queryset.first().row_index,
                    "col_start": queryset.first().col_index,
                }
            )

        form = PlotRangeForm(initial=initial_data)
        return render(
            request,
            "admin/crops/assign_bed_range.html",
            {"items": queryset, "form": form, "title": "範囲を指定して畝を割り当てる"},
        )


@admin.register(VegetableFamily)
class VegetableFamilyAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "description")


@admin.register(VegetableType)
class VegetableTypeAdmin(admin.ModelAdmin):
    change_list_template = "admin/crops/vegetabletype_changelist.html"
    list_display = (
        "id",
        "name",
        "family",
        "spacing_cm",
        "icon_preview",
        "planting_method",
    )
    list_filter = ("family",)
    search_fields = ("name",)
    readonly_fields = ("icon_preview",)
    fields = ("name", "family", "icon", "icon_preview", "spacing_cm", "planting_method")

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path(
                "import/",
                self.admin_site.admin_view(self.import_view),
                name="crops_vegetabletype_import",
            ),
        ]
        return custom_urls + urls

    def import_view(self, request):
        if request.method == "POST":
            form = VegetableTypeImportForm(request.POST, request.FILES)
            if form.is_valid():
                csv_file = form.cleaned_data["csv_file"]
                zip_file = form.cleaned_data.get("zip_file")
                zip_files = {}
                if zip_file:
                    try:
                        with zipfile.ZipFile(zip_file) as zf:
                            for info in zf.infolist():
                                if not info.is_dir():
                                    zip_files[os.path.basename(info.filename)] = (
                                        zf.read(info)
                                    )
                    except zipfile.BadZipFile:
                        form.add_error(
                            "zip_file", "有効な ZIP ファイルを指定してください。"
                        )
                        return render(
                            request,
                            "admin/crops/vegetabletype_import.html",
                            {
                                **self.admin_site.each_context(request),
                                "form": form,
                                "title": "VegetableType 一括インポート",
                            },
                        )

                try:
                    decoded = TextIOWrapper(csv_file, encoding="utf-8-sig")
                    reader = csv.DictReader(decoded)
                except Exception as e:
                    form.add_error("csv_file", f"CSV 読み込みに失敗しました: {e}")
                    return render(
                        request,
                        "admin/crops/vegetabletype_import.html",
                        {
                            **self.admin_site.each_context(request),
                            "form": form,
                            "title": "VegetableType 一括インポート",
                        },
                    )

                created_count = 0
                updated_count = 0
                errors = []
                for row_num, row in enumerate(reader, start=2):
                    name = (row.get("name") or row.get("vegetable_type") or "").strip()
                    family_name = (row.get("family") or "").strip()
                    spacing_value = (
                        row.get("spacing_cm") or row.get("spacing") or ""
                    ).strip()
                    icon_filename = (
                        row.get("icon_filename") or row.get("icon") or ""
                    ).strip()

                    if not name:
                        errors.append(f"行 {row_num}: name が空です。")
                        continue
                    if not family_name:
                        errors.append(f"行 {row_num}: family が空です。")
                        continue

                    try:
                        spacing_cm = int(spacing_value) if spacing_value else 0
                    except ValueError:
                        errors.append(
                            f"行 {row_num}: spacing_cm は整数である必要があります。"
                        )
                        continue

                    family, _ = VegetableFamily.objects.get_or_create(name=family_name)
                    vt, created = VegetableType.objects.get_or_create(
                        name=name,
                        defaults={"family": family, "spacing_cm": spacing_cm},
                    )
                    if not created:
                        vt.family = family
                        vt.spacing_cm = spacing_cm

                    if icon_filename:
                        icon_data = zip_files.get(os.path.basename(icon_filename))
                        if icon_data:
                            vt.icon.save(
                                os.path.basename(icon_filename),
                                ContentFile(icon_data),
                                save=False,
                            )
                        else:
                            errors.append(
                                f"行 {row_num}: icon_filename {icon_filename} が ZIP に見つかりません。"
                            )

                    vt.save()
                    if created:
                        created_count += 1
                    else:
                        updated_count += 1

                self.message_user(
                    request,
                    f"インポート完了: {created_count} 件作成, {updated_count} 件更新。",
                )
                if errors:
                    for error in errors:
                        self.message_user(request, error, level=messages.WARNING)
                return HttpResponseRedirect("../")
        else:
            form = VegetableTypeImportForm()

        return render(
            request,
            "admin/crops/vegetabletype_import.html",
            {
                **self.admin_site.each_context(request),
                "form": form,
                "title": "VegetableType 一括インポート",
            },
        )

    def icon_preview(self, obj):
        if obj.icon:
            return mark_safe(
                f'<img src="{obj.icon.url}" style="width: 30px; height: 30px; object-fit: contain;">'
            )
        return "-"

    icon_preview.short_description = "アイコン"


@admin.register(Crop)
class CropAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "get_vegetable_name",
        "family_display",
        "planted_at",
        "plots_display",
    )
    list_filter = ("vegetable_type__family", "planted_at")
    raw_id_fields = ("plots",)

    def get_vegetable_name(self, obj):
        return obj.vegetable_type.name if obj.vegetable_type else "-"

    get_vegetable_name.short_description = "野菜名"

    def family_display(self, obj):
        return obj.vegetable_type.family.name if obj.vegetable_type else "-"

    family_display.short_description = "科"

    def plots_display(self, obj):
        # count() はデータベース側で計算するので爆速です
        count = obj.plots.count()
        if count == 0:
            return "-"

        # 最初の3つだけ取得して表示し、あとは「...」にする
        plots = obj.plots.all().order_by("row_index", "col_index")[:3]
        plot_list = [f"[{p.row_index}-{p.col_index}]" for p in plots]

        display_text = ", ".join(plot_list)
        if count > 3:
            display_text += f" (+他{count - 3}マス)"

        return display_text

    plots_display.short_description = "配置エリア"


@admin.register(MaintenanceLog)
class MaintenanceLogAdmin(admin.ModelAdmin):
    # list_display の修正
    list_display = ["worked_at", "user", "display_plots_count", "task_type", "note"]

    # list_filter の修正 (action_type を task_type へ)
    list_filter = ["task_type", "user", "worked_at"]

    # ManyToManyFieldを表示するためのカスタムメソッド
    def display_plots_count(self, obj):
        return f"{obj.plots.count()} マス"

    display_plots_count.short_description = "対象マス数"
