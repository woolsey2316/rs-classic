from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("game", "0006_player_last_action_at"),
    ]

    operations = [
        migrations.AddField(
            model_name="playerskill",
            name="current_level",
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="playerskill",
            name="level_updated_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
