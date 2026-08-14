from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("game", "0002_grounditem"),
    ]

    operations = [
        migrations.AddField(
            model_name="item",
            name="sprite",
            field=models.CharField(blank=True, default="", max_length=64),
        ),
    ]
