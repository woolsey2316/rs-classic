# Generated manually for treasure chest support.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("game", "0004_scenery"),
    ]

    operations = [
        migrations.AddField(
            model_name="scenery",
            name="is_treasure_chest",
            field=models.BooleanField(default=False),
        ),
    ]
