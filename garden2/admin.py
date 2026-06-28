from django.contrib import admin
from django.utils.html import format_html

from .models import Bed, Crop, GardenArea, MaintenanceLog, SoilStatusArea, VegetableFamily, VegetableType


@admin.register(VegetableFamily)
class VegetableFamilyAdmin(admin.ModelAdmin):
    list_display = ('name', 'color_preview', 'color', 'description')
    list_editable = ('color',)

    @admin.display(description='色')
    def color_preview(self, obj):
        return format_html(
            '<span style="display:inline-block;width:24px;height:24px;'
            'border-radius:4px;background:{};border:1px solid #ccc;'
            'vertical-align:middle;"></span>',
            obj.color,
        )


admin.site.register(GardenArea)


@admin.register(VegetableType)
class VegetableTypeAdmin(admin.ModelAdmin):
    list_display  = ('name', 'family', 'planting_method', 'spacing_cm', 'rotation_years', 'rotation_buffer_cm')
    list_editable = ('family', 'planting_method', 'spacing_cm', 'rotation_years', 'rotation_buffer_cm')
    list_filter   = ('family', 'planting_method')
    ordering      = ('family', 'name')
admin.site.register(Bed)
@admin.register(Crop)
class CropAdmin(admin.ModelAdmin):
    list_display = ('__str__', 'area', 'status', 'planted_at', 'harvested_at')
    list_filter  = ('status', 'area')
    ordering     = ('-planted_at',)
admin.site.register(SoilStatusArea)
admin.site.register(MaintenanceLog)
