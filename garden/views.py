import json
from datetime import date

from django.contrib.auth.decorators import login_required
from django.db.models import Q
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, render
from django.views.decorators.http import require_POST, require_http_methods

from .models import Bed, Crop, GardenArea, SoilStatusArea, VegetableType


@login_required
def mypage(request):
    areas = GardenArea.objects.filter(owner=request.user)
    return render(request, "garden/mypage.html", {
        "areas": areas,
        "today": str(date.today()),
    })


@login_required
def area_state_api(request, area_id):
    target_date_str = request.GET.get("date", str(date.today()))
    try:
        target_date = date.fromisoformat(target_date_str)
    except ValueError:
        target_date = date.today()

    area = get_object_or_404(GardenArea, id=area_id, owner=request.user)

    beds = Bed.objects.filter(
        area=area,
        created_at__lte=target_date,
    ).filter(Q(deleted_at__isnull=True) | Q(deleted_at__gte=target_date))

    crops = Crop.objects.filter(
        area=area,
        planted_at__lte=target_date,
    ).filter(
        Q(harvested_at__isnull=True) | Q(harvested_at__gte=target_date)
    ).select_related("vegetable_type")

    soil_areas = SoilStatusArea.objects.filter(
        area=area,
        start_date__lte=target_date,
    ).filter(Q(end_date__isnull=True) | Q(end_date__gte=target_date))

    return JsonResponse({
        "area": {
            "id": area.id,
            "name": area.name,
            "rows": area.rows,
            "cols": area.cols,
        },
        "beds": [
            {
                "id": b.id,
                "name": b.name,
                "row_start": b.row_start,
                "col_start": b.col_start,
                "row_end": b.row_end,
                "col_end": b.col_end,
            }
            for b in beds
        ],
        "crops": [
            {
                "id": c.id,
                "name": str(c),
                "color": c.vegetable_type.color,
                "vegetable_type_id": c.vegetable_type_id,
                "spacing_cm": c.vegetable_type.spacing_cm,
                "planting_method": c.vegetable_type.planting_method,
                "icon_url": request.build_absolute_uri(c.vegetable_type.icon.url) if c.vegetable_type.icon else None,
                "planted_at": str(c.planted_at),
                "harvested_at": str(c.harvested_at) if c.harvested_at else None,
                "status": c.status,
                "row_start": c.row_start,
                "col_start": c.col_start,
                "row_end": c.row_end,
                "col_end": c.col_end,
            }
            for c in crops
        ],
        "soil_areas": [
            {
                "id": s.id,
                "status_type": s.get_status_type_display(),
                "row_start": s.row_start,
                "col_start": s.col_start,
                "row_end": s.row_end,
                "col_end": s.col_end,
            }
            for s in soil_areas
        ],
    })


@login_required
def vegetable_types_api(request):
    veg_types = VegetableType.objects.select_related("family").order_by("name")
    return JsonResponse({
        "vegetable_types": [
            {
                "id": v.id,
                "name": v.name,
                "family": v.family.name,
                "spacing_cm": v.spacing_cm,
                "planting_method": v.planting_method,
                "color": v.color,
                "icon_url": request.build_absolute_uri(v.icon.url) if v.icon else None,
            }
            for v in veg_types
        ]
    })


@login_required
@require_http_methods(["PATCH"])
def update_bed_api(request, bed_id):
    try:
        bed = get_object_or_404(Bed, id=bed_id, area__owner=request.user)
        data = json.loads(request.body)
        bed.name      = data.get("name", bed.name)
        bed.row_start = int(data.get("row_start", bed.row_start))
        bed.col_start = int(data.get("col_start", bed.col_start))
        bed.row_end   = int(data.get("row_end",   bed.row_end))
        bed.col_end   = int(data.get("col_end",   bed.col_end))
        if "created_at" in data:
            bed.created_at = data["created_at"]
        if "deleted_at" in data:
            bed.deleted_at = data["deleted_at"] or None
        bed.save()
        return JsonResponse({"ok": True})
    except (KeyError, ValueError) as e:
        return JsonResponse({"ok": False, "error": str(e)}, status=400)


@login_required
@require_POST
def create_bed_api(request):
    try:
        data = json.loads(request.body)
        area = get_object_or_404(GardenArea, id=data["area_id"], owner=request.user)
        bed = Bed.objects.create(
            area=area,
            name=data["name"],
            row_start=int(data["row_start"]),
            col_start=int(data["col_start"]),
            row_end=int(data["row_end"]),
            col_end=int(data["col_end"]),
            created_at=data.get("created_at", str(date.today())),
        )
        return JsonResponse({"ok": True, "bed_id": bed.id})
    except (KeyError, ValueError) as e:
        return JsonResponse({"ok": False, "error": str(e)}, status=400)


@login_required
@require_http_methods(["PATCH", "DELETE"])
def crop_detail_api(request, crop_id):
    crop = get_object_or_404(Crop, id=crop_id, area__owner=request.user)
    if request.method == "DELETE":
        crop.delete()
        return JsonResponse({"ok": True})
    try:
        data = json.loads(request.body)
        if "planted_at" in data:
            crop.planted_at = date.fromisoformat(data["planted_at"])
        if "harvested_at" in data:
            crop.harvested_at = date.fromisoformat(data["harvested_at"]) if data["harvested_at"] else None
        if "status" in data:
            crop.status = data["status"]
        crop.save()
        return JsonResponse({"ok": True})
    except (KeyError, ValueError) as e:
        return JsonResponse({"ok": False, "error": str(e)}, status=400)


@login_required
@require_POST
def plant_crop_api(request):
    try:
        data = json.loads(request.body)
        area = get_object_or_404(GardenArea, id=data["area_id"], owner=request.user)
        veg_type = get_object_or_404(VegetableType, id=data["vegetable_type_id"])
        planted_at = date.fromisoformat(data.get("planted_at", str(date.today())))

        row_start = int(data["row_start"])
        col_start = int(data["col_start"])
        row_end   = int(data["row_end"])
        col_end   = int(data["col_end"])

        if veg_type.planting_method == "individual":
            spacing_grid = max(1, veg_type.spacing_cm // 10)
            half = spacing_grid // 2
            crops = []
            r = row_start + half
            while r <= row_end:
                c = col_start + half
                while c <= col_end:
                    crops.append(Crop(
                        area=area,
                        vegetable_type=veg_type,
                        row_start=r, col_start=c,
                        row_end=r,   col_end=c,
                        planted_at=planted_at,
                        status="growing",
                    ))
                    c += spacing_grid
                r += spacing_grid
            if not crops:
                return JsonResponse(
                    {"ok": False, "error": "範囲が狭すぎます（株間より広い範囲を選んでください）"},
                    status=400,
                )
            Crop.objects.bulk_create(crops)
            return JsonResponse({"ok": True, "crop_count": len(crops)})
        else:
            Crop.objects.create(
                area=area,
                vegetable_type=veg_type,
                row_start=row_start, col_start=col_start,
                row_end=row_end,     col_end=col_end,
                planted_at=planted_at,
                status="growing",
            )
            return JsonResponse({"ok": True, "crop_count": 1})
    except (KeyError, ValueError) as e:
        return JsonResponse({"ok": False, "error": str(e)}, status=400)
