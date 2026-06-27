import json
from datetime import date, datetime, timedelta

from django.contrib.auth.decorators import login_required
from django.db.models import Q
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, render
from django.views.decorators.http import require_POST

from .models import Bed, Crop, GardenArea, MaintenanceLog

def _tint(hex_color):
    """16進カラーコードから薄い背景色（tint）を生成する。"""
    hex_color = hex_color.lstrip('#')
    r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
    # 元の色を白と75%ブレンド
    tr = r + (255 - r) * 3 // 4
    tg = g + (255 - g) * 3 // 4
    tb = b + (255 - b) * 3 // 4
    return f'#{tr:02x}{tg:02x}{tb:02x}'


def _family_colors(family):
    """VegetableFamilyオブジェクトから color と tint を返す。"""
    color = family.color if family.color else '#8a8067'
    return {'color': color, 'tint': _tint(color)}


def _rotation_check(area, crop, year):
    """作物の座標と過去作物の重複面積から連作リスクを判定する。"""
    if not crop:
        return {'level': 'none', 'conflicts': []}

    fam = crop.vegetable_type.family
    fam_name = fam.name
    rot_years = crop.vegetable_type.rotation_years
    since = date(year - rot_years, 1, 1)

    past = Crop.objects.filter(
        area=area,
        vegetable_type__family=fam,
        planted_at__gte=since,
        planted_at__lt=date(year, 1, 1),
        row_start__lte=crop.row_end,
        row_end__gte=crop.row_start,
        col_start__lte=crop.col_end,
        col_end__gte=crop.col_start,
    ).exclude(id=crop.id).select_related('vegetable_type').order_by('-planted_at')

    crop_area = (crop.row_end - crop.row_start + 1) * (crop.col_end - crop.col_start + 1)

    # (year, name) → 最大重複率
    seen: dict[tuple, int] = {}
    for p in past:
        ov_r = max(0, min(crop.row_end, p.row_end) - max(crop.row_start, p.row_start) + 1)
        ov_c = max(0, min(crop.col_end, p.col_end) - max(crop.col_start, p.col_start) + 1)
        pct = round(ov_r * ov_c / crop_area * 100) if crop_area > 0 else 0
        if pct <= 0:
            continue
        key = (p.planted_at.year, p.vegetable_type.name)
        seen[key] = max(seen.get(key, 0), pct)

    if not seen:
        return {'level': 'ok', 'family': fam_name, 'rotation_years': rot_years, 'conflicts': []}

    conflicts = [
        {'year': y, 'name': n, 'pct': p}
        for (y, n), p in sorted(seen.items(), key=lambda x: -x[0][0])
    ]

    years_ago = year - conflicts[0]['year']
    level = 'high' if years_ago <= 1 else ('mid' if years_ago <= 2 else 'low')

    return {
        'level': level,
        'family': fam_name,
        'rotation_years': rot_years,
        'conflicts': conflicts,
    }


def _progress(crop):
    if not crop or crop.status == 'harvested':
        return None
    harvest = crop.expected_harvest_date or crop.harvested_at
    if not harvest:
        return None
    today = date.today()
    planted = crop.planted_at
    if today < planted:
        return {'pct': 5, 'label': '植え付け直後', 'days_left': (harvest - today).days}
    if today >= harvest:
        return {'pct': 100, 'label': '収穫期です', 'days_left': 0}
    span = (harvest - planted).days or 1
    pct = int((today - planted).days / span * 100)
    return {'pct': pct, 'label': f'収穫まであと{(harvest - today).days}日', 'days_left': (harvest - today).days}


def _serialize_crop(crop):
    if not crop:
        return None
    family = crop.vegetable_type.family
    fc = _family_colors(family)
    return {
        'id': crop.id,
        'name': crop.vegetable_type.name,
        'family': family.name,
        'variety': crop.variety or '',
        'color': crop.vegetable_type.color,
        'family_color': fc['color'],
        'family_tint': fc['tint'],
        'planted_at': str(crop.planted_at),
        'harvested_at': str(crop.harvested_at) if crop.harvested_at else None,
        'expected_harvest_date': str(crop.expected_harvest_date) if crop.expected_harvest_date else None,
        'status': crop.status,
        'progress': _progress(crop),
    }


def _crops_in_bed(bed, crop_list):
    return [
        c for c in crop_list
        if (c.row_start <= bed.row_end and c.row_end >= bed.row_start
            and c.col_start <= bed.col_end and c.col_end >= bed.col_start)
    ]


@login_required
def index(request):
    areas = GardenArea.objects.filter(owner=request.user)
    return render(request, 'garden2/index.html', {
        'areas': areas,
        'today': str(date.today()),
        'current_year': date.today().year,
    })


def _available_years(area):
    today = date.today()
    first = None
    fb = Bed.objects.filter(area=area).order_by('created_at').values_list('created_at', flat=True).first()
    fc = Crop.objects.filter(area=area).order_by('planted_at').values_list('planted_at', flat=True).first()
    if fb:
        first = fb
    if fc and (first is None or fc < first):
        first = fc
    first_year = first.year if first else today.year
    return list(range(first_year, today.year + 1))


@login_required
def state_api(request, area_id):
    today = date.today()

    # date= で特定日付スナップショット、year= で年末スナップショット
    date_str = request.GET.get('date')
    if date_str:
        try:
            target_date = date.fromisoformat(date_str)
        except ValueError:
            target_date = today
    else:
        try:
            year = int(request.GET.get('year', today.year))
        except ValueError:
            year = today.year
        target_date = today if year == today.year else date(year, 12, 31)

    year = target_date.year
    area = get_object_or_404(GardenArea, id=area_id, owner=request.user)

    # 特定日付でスナップショット（重複なし）
    beds = Bed.objects.filter(
        area=area,
        created_at__lte=target_date,
    ).filter(
        Q(deleted_at__isnull=True) | Q(deleted_at__gte=target_date)
    ).order_by('row_start', 'col_start')

    crops = Crop.objects.filter(
        area=area,
        planted_at__lte=target_date,
    ).filter(
        Q(harvested_at__isnull=True) | Q(harvested_at__gte=target_date)
    ).select_related('vegetable_type', 'vegetable_type__family').order_by('planted_at')
    crops_list = list(crops)

    beds_data = []
    for bed in beds:
        bed_crops = _crops_in_bed(bed, crops_list)
        primary = bed_crops[0] if bed_crops else None
        rot = _rotation_check(area, primary, year) if primary else {'level': 'none', 'conflicts': []}
        beds_data.append({
            'id': bed.id,
            'name': bed.name,
            'row_start': bed.row_start,
            'col_start': bed.col_start,
            'row_end': bed.row_end,
            'col_end': bed.col_end,
            'created_at': str(bed.created_at),
            'deleted_at': str(bed.deleted_at) if bed.deleted_at else None,
            'crop': _serialize_crop(primary),
            'rotation': rot,
        })

    return JsonResponse({
        'area': {'id': area.id, 'name': area.name, 'rows': area.rows, 'cols': area.cols},
        'year': year,
        'target_date': str(target_date),
        'available_years': _available_years(area),
        'beds': beds_data,
    })


@login_required
def year_dates_api(request, area_id):
    """その年に畝が変化した日付一覧（日付チップ用）"""
    today = date.today()
    try:
        year = int(request.GET.get('year', today.year))
    except ValueError:
        year = today.year

    area = get_object_or_404(GardenArea, id=area_id, owner=request.user)
    year_start = date(year, 1, 1)
    year_end = date(year, 12, 31)
    cutoff = min(year_end, today)

    date_types = {}  # date -> set of type strings

    def _add(d, type_):
        if year_start <= d <= cutoff:
            date_types.setdefault(d, set()).add(type_)

    # 畝の新設・撤去
    for d in Bed.objects.filter(
        area=area, created_at__year=year, created_at__lte=cutoff
    ).values_list('created_at', flat=True):
        _add(d, 'bed')

    for d in Bed.objects.filter(
        area=area, deleted_at__year=year, deleted_at__lte=cutoff
    ).values_list('deleted_at', flat=True):
        _add(d, 'bed')

    # 作物の植え付け日
    for d in Crop.objects.filter(
        area=area, planted_at__year=year, planted_at__lte=cutoff
    ).values_list('planted_at', flat=True):
        _add(d, 'planted')

    # 作物の収穫日
    for d in Crop.objects.filter(
        area=area, harvested_at__year=year, harvested_at__lte=cutoff
    ).values_list('harvested_at', flat=True):
        _add(d, 'harvested')

    # 年初にすでに畝か作物があった場合は年初を追加
    has_bed_at_start = Bed.objects.filter(
        area=area, created_at__lte=year_start,
    ).filter(
        Q(deleted_at__isnull=True) | Q(deleted_at__gte=year_start)
    ).exists()
    has_crop_at_start = Crop.objects.filter(
        area=area, planted_at__lte=year_start,
    ).filter(
        Q(harvested_at__isnull=True) | Q(harvested_at__gte=year_start)
    ).exists()
    if has_bed_at_start or has_crop_at_start:
        date_types.setdefault(year_start, set()).add('year_start')

    # 今日（当年のみ）
    if year == today.year:
        date_types.setdefault(today, set()).add('today')

    sorted_entries = sorted(date_types.items())

    # デフォルト日付：当年は今日、過去年は最後の変化日
    if year == today.year:
        default = str(today)
    elif sorted_entries:
        default = str(sorted_entries[-1][0])
    else:
        default = str(year_end)

    return JsonResponse({
        'year': year,
        'dates': [
            {'date': str(d), 'types': sorted(types - {'today', 'year_start'})}
            for d, types in sorted_entries
        ],
        'default': default,
    })


@login_required
def bed_detail_api(request, bed_id):
    today = date.today()
    date_str = request.GET.get('date')
    if date_str:
        try:
            target_date = date.fromisoformat(date_str)
        except ValueError:
            target_date = today
    else:
        try:
            year = int(request.GET.get('year', today.year))
        except ValueError:
            year = today.year
        target_date = today if year == today.year else date(year, 12, 31)

    year = target_date.year

    bed = get_object_or_404(Bed, id=bed_id, area__owner=request.user)
    area = bed.area

    # state_api と同じ日付ベースフィルタで、その日に有効な作物を取得
    active_crops = Crop.objects.filter(
        area=area,
        planted_at__lte=target_date,
        row_start__lte=bed.row_end,
        row_end__gte=bed.row_start,
        col_start__lte=bed.col_end,
        col_end__gte=bed.col_start,
    ).filter(
        Q(harvested_at__isnull=True) | Q(harvested_at__gte=target_date)
    ).select_related('vegetable_type', 'vegetable_type__family').order_by('planted_at')

    # 作物ごとに連作チェックを付与
    crops_data = []
    for c in active_crops:
        serialized = _serialize_crop(c)
        serialized['rotation'] = _rotation_check(area, c, year)
        crops_data.append(serialized)

    # History: その年の年末（または今日）時点の作物を過去5年分
    history = []
    first_year = max(year - 4, 2020)
    for y in range(year, first_year - 1, -1):
        hist_date = today if y == today.year else date(y, 12, 31)
        c = Crop.objects.filter(
            area=area,
            planted_at__lte=hist_date,
            row_start__lte=bed.row_end,
            row_end__gte=bed.row_start,
            col_start__lte=bed.col_end,
            col_end__gte=bed.col_start,
        ).filter(
            Q(harvested_at__isnull=True) | Q(harvested_at__gte=hist_date)
        ).select_related('vegetable_type', 'vegetable_type__family').order_by('planted_at').first()
        family = c.vegetable_type.family if c else None
        fc = _family_colors(family) if family else None
        history.append({
            'year': y,
            'is_current': y == year,
            'crop_name': c.vegetable_type.name if c else None,
            'family': family.name if family else None,
            'family_color': fc['color'] if fc else None,
            'family_tint': fc['tint'] if fc else None,
        })

    logs = MaintenanceLog.objects.filter(bed=bed).select_related('user').order_by('-worked_at')[:8]
    logs_data = [
        {
            'when': log.worked_at.strftime('%m/%d'),
            'task': log.get_task_type_display(),
            'note': log.note,
            'user_name': (log.user.get_short_name() or log.user.username) if log.user else None,
        }
        for log in logs
    ]

    return JsonResponse({
        'bed': {
            'id': bed.id,
            'name': bed.name,
            'row_start': bed.row_start,
            'col_start': bed.col_start,
            'row_end': bed.row_end,
            'col_end': bed.col_end,
            'deleted_at': str(bed.deleted_at) if bed.deleted_at else None,
        },
        'year': year,
        'date': str(target_date),
        'crops': crops_data,
        'history': history,
        'logs': logs_data,
    })


@login_required
@require_POST
def log_api(request, bed_id):
    bed = get_object_or_404(Bed, id=bed_id, area__owner=request.user)
    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({'error': 'invalid json'}, status=400)

    task_type = body.get('task_type', 'other')
    note = body.get('note', '').strip()
    date_str = body.get('worked_at') or str(date.today())
    try:
        worked_at = datetime.fromisoformat(date_str)
    except ValueError:
        worked_at = datetime.combine(date.fromisoformat(date_str), datetime.min.time())

    crop = None
    crop_id = body.get('crop_id')
    if crop_id:
        try:
            crop = Crop.objects.get(id=int(crop_id), area=bed.area)
        except (Crop.DoesNotExist, (ValueError, TypeError)):
            pass

    valid_tasks = {t for t, _ in MaintenanceLog.MAINTENANCE_TYPES}
    if task_type not in valid_tasks:
        task_type = 'other'

    MaintenanceLog.objects.create(
        area=bed.area,
        bed=bed,
        crop=crop,
        task_type=task_type,
        note=note,
        worked_at=worked_at,
        user=request.user,
    )
    return JsonResponse({'ok': True})


@login_required
@require_POST
def harvest_api(request, crop_id):
    crop = get_object_or_404(Crop, id=crop_id, area__owner=request.user)
    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({'error': 'invalid json'}, status=400)

    date_str = body.get('harvested_at', str(date.today()))
    try:
        harvested_at = date.fromisoformat(date_str)
    except ValueError:
        harvested_at = date.today()

    crop.harvested_at = harvested_at
    crop.status = 'harvested'
    crop.save(update_fields=['harvested_at', 'status'])
    return JsonResponse({'ok': True})


@login_required
@require_POST
def bed_remove_api(request, bed_id):
    bed = get_object_or_404(Bed, id=bed_id, area__owner=request.user)
    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({'error': 'invalid json'}, status=400)

    date_str = body.get('deleted_at', str(date.today()))
    try:
        deleted_at = date.fromisoformat(date_str)
    except ValueError:
        deleted_at = date.today()

    bed.deleted_at = deleted_at
    bed.save(update_fields=['deleted_at'])
    return JsonResponse({'ok': True})
