from datetime import date

from django.contrib.auth.decorators import login_required
from django.db.models import Q
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, render

from .models import Bed, Crop, GardenArea, SoilStatusArea


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
