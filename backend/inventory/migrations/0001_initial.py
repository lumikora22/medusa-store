# Generated for the Medusa Store inventory MVP.
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="Container",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("code", models.CharField(max_length=32, unique=True)),
                ("qr_value", models.CharField(blank=True, max_length=128, unique=True)),
                ("type", models.CharField(choices=[("box", "Box"), ("bag", "Bag")], max_length=12)),
                ("status", models.CharField(choices=[("active", "Active"), ("archived", "Archived")], default="active", max_length=12)),
                ("notes", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"ordering": ["code"]},
        ),
        migrations.CreateModel(
            name="Item",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("code", models.CharField(max_length=32, unique=True)),
                ("qr_value", models.CharField(blank=True, max_length=128, unique=True)),
                ("status", models.CharField(choices=[("active", "Active"), ("sold", "Sold"), ("archived", "Archived")], default="active", max_length=12)),
                ("price", models.DecimalField(decimal_places=2, max_digits=10)),
                ("description", models.TextField(blank=True)),
                ("tags", models.JSONField(blank=True, default=list)),
                ("sold_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("container", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="items", to="inventory.container")),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="ItemPhoto",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("image", models.ImageField(upload_to="item-photos/%Y/%m/")),
                ("alt_text", models.CharField(blank=True, max_length=160)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("item", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="photos", to="inventory.item")),
            ],
            options={"ordering": ["created_at"]},
        ),
        migrations.CreateModel(
            name="InventoryMovement",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("movement_type", models.CharField(choices=[("created", "Created"), ("moved", "Moved"), ("sold", "Sold")], max_length=12)),
                ("notes", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("from_container", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="movements_from", to="inventory.container")),
                ("item", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="movements", to="inventory.item")),
                ("to_container", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="movements_to", to="inventory.container")),
            ],
            options={"ordering": ["-created_at"]},
        ),
    ]
