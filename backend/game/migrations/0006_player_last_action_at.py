from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("game", "0005_scenery_is_treasure_chest"),
    ]

    operations = [
        migrations.AddField(
            model_name="player",
            name="last_action_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
