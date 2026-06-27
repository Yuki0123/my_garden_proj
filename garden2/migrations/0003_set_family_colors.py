from django.db import migrations

COLORS = {
    'ナス科':    '#b3564a',
    'ウリ科':    '#6f9150',
    'アブラナ科': '#4f8a82',
    'マメ科':    '#94a04e',
    'セリ科':    '#c0883a',
    'ネギ類':    '#7d6f9c',
    'イネ科':    '#b59a4d',
    'キク科':    '#6d9b86',
    'ヒルガオ科': '#a9764a',
    'アオイ科':  '#c2693f',
    'バラ科':    '#c06070',
    'ショウガ科': '#7a9060',
    'ユリ科':    '#8870b0',
    'アカザ科':  '#70a090',
    'シソ科':    '#8090c0',
}


def set_colors(apps, schema_editor):
    VegetableFamily = apps.get_model('garden2', 'VegetableFamily')
    for family in VegetableFamily.objects.all():
        color = COLORS.get(family.name)
        if color:
            family.color = color
            family.save(update_fields=['color'])


def unset_colors(apps, schema_editor):
    VegetableFamily = apps.get_model('garden2', 'VegetableFamily')
    VegetableFamily.objects.all().update(color='#8a8067')


class Migration(migrations.Migration):

    dependencies = [
        ('garden2', '0002_add_family_color'),
    ]

    operations = [
        migrations.RunPython(set_colors, unset_colors),
    ]
