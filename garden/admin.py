from django.contrib import admin

from .models import (
    Bed,
    Crop,
    GardenArea,
    MaintenanceLog,
    SoilStatusArea,
    VegetableFamily,
    VegetableType,
)


@admin.register(VegetableFamily)
class VegetableFamilyAdmin(admin.ModelAdmin):
    list_display = ("name", "description")
    search_fields = ("name",)


@admin.register(VegetableType)
class VegetableTypeAdmin(admin.ModelAdmin):
    list_display = ("name", "family", "planting_method", "spacing_cm", "rotation_years", "rotation_buffer_cm")
    list_filter = ("family", "planting_method")
    search_fields = ("name",)


@admin.register(GardenArea)
class GardenAreaAdmin(admin.ModelAdmin):
    list_display = ("name", "owner", "rows", "cols")


@admin.register(Bed)
class BedAdmin(admin.ModelAdmin):
    list_display = ("name", "area", "row_start", "col_start", "row_end", "col_end", "created_at", "deleted_at")
    list_filter = ("area",)


@admin.register(Crop)
class CropAdmin(admin.ModelAdmin):
    list_display = ("__str__", "area", "status", "planted_at", "harvested_at")
    list_filter = ("area", "status", "vegetable_type")


@admin.register(SoilStatusArea)
class SoilStatusAreaAdmin(admin.ModelAdmin):
    list_display = ("status_type", "area", "start_date", "end_date")
    list_filter = ("area", "status_type")


@admin.register(MaintenanceLog)
class MaintenanceLogAdmin(admin.ModelAdmin):
    list_display = ("task_type", "area", "worked_at", "user")
    list_filter = ("area", "task_type")
