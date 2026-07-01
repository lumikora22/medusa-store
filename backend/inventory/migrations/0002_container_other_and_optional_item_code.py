# Generated for mobile-first container and item code UX.
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("inventory", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="container",
            name="type",
            field=models.CharField(choices=[("box", "Box"), ("bag", "Bag"), ("other", "Other")], max_length=12),
        ),
    ]
