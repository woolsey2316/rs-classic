from django.db import migrations, models
import django.db.models.deletion


SLOT_CHOICES = [
    ("helmet", "Helmet"),
    ("arrows", "Arrows"),
    ("gloves", "Gloves"),
    ("body", "Body"),
    ("legs", "Legs"),
    ("boots", "Boots"),
    ("ring", "Ring"),
    ("weapon", "Weapon"),
    ("shield", "Shield"),
    ("amulet", "Amulet"),
    ("cape", "Cape"),
]


class Migration(migrations.Migration):

    dependencies = [
        ("game", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="item",
            name="equip_slot",
            field=models.CharField(
                blank=True, choices=SLOT_CHOICES, max_length=16, null=True
            ),
        ),
        migrations.AlterField(
            model_name="equipment",
            name="slot",
            field=models.CharField(choices=SLOT_CHOICES, max_length=16),
        ),
        migrations.CreateModel(
            name="GroundItem",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("x", models.PositiveIntegerField()),
                ("y", models.PositiveIntegerField()),
                ("quantity", models.PositiveIntegerField(default=1)),
                (
                    "item",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="ground_piles",
                        to="game.item",
                    ),
                ),
            ],
            options={
                "ordering": ["y", "x", "id"],
            },
        ),
    ]
