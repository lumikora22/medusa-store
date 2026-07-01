from __future__ import annotations

from io import BytesIO
from decimal import Decimal

from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from PIL import Image, ImageDraw, ImageFont

from inventory.models import Container, InventoryMovement, Item, ItemPhoto


CONTAINER_TYPES = [
    Container.ContainerType.BOX,
    Container.ContainerType.BAG,
    Container.ContainerType.OTHER,
]

ITEM_NAMES = [
    "Camisa Denim",
    "Jeans Recto",
    "Chaqueta Vintage",
    "Sudadera Oversized",
    "Blusa Floral",
    "Polo Clásica",
    "Pantalón Cargo",
    "Falda Midi",
    "Camiseta Básica",
    "Vestido Casual",
]

COLORS = [
    (36, 99, 235),
    (16, 185, 129),
    (217, 70, 239),
    (245, 158, 11),
    (239, 68, 68),
    (14, 165, 233),
]


class Command(BaseCommand):
    help = "Seed Medusa Store with demo containers and inventory items."

    def add_arguments(self, parser):
        parser.add_argument("--containers", type=int, default=15)
        parser.add_argument("--items", type=int, default=50)

    @transaction.atomic
    def handle(self, *args, **options):
        containers = self._create_containers(options["containers"])
        items = self._create_items(options["items"], containers)
        self.stdout.write(self.style.SUCCESS(f"Seeded {len(containers)} containers and {len(items)} items."))

    def _create_containers(self, total: int) -> list[Container]:
        created = []
        for index in range(1, total + 1):
            code = f"BOX-{index:04d}" if index <= 8 else f"BAG-{index - 8:04d}"
            if index > 12:
                code = f"RST-{index - 12:04d}"

            container_type = CONTAINER_TYPES[(index - 1) % len(CONTAINER_TYPES)]
            notes = ""
            if container_type == Container.ContainerType.OTHER:
                notes = f"Custom type: Rack {index - 12:02d}"

            container, _ = Container.objects.get_or_create(
                code=code,
                defaults={"type": container_type, "notes": notes},
            )
            if container.notes != notes:
                container.notes = notes
                container.type = container_type
                container.save(update_fields=["notes", "type", "updated_at"])
            created.append(container)
        return created

    def _create_items(self, total: int, containers: list[Container]) -> list[Item]:
        created = []
        for index in range(1, total + 1):
            code = f"ITEM-DEMO-{index:03d}"
            container = containers[(index - 1) % len(containers)]
            name = ITEM_NAMES[(index - 1) % len(ITEM_NAMES)]
            price = self._price_for_index(index)
            status = Item.Status.SOLD if index % 7 == 0 else Item.Status.ACTIVE

            item, _ = Item.objects.get_or_create(
                code=code,
                defaults={
                    "container": container,
                    "status": status,
                    "price": price,
                    "description": f"Pieza demo #{index:02d}: {name.lower()}.",
                    "tags": self._tags_for_item(index, name),
                    "sold_at": timezone.now() if status == Item.Status.SOLD else None,
                },
            )
            if item.container_id != container.id or item.price != price or item.status != status:
                item.container = container
                item.price = price
                item.status = status
                item.description = f"Pieza demo #{index:02d}: {name.lower()}."
                item.tags = self._tags_for_item(index, name)
                item.sold_at = timezone.now() if status == Item.Status.SOLD else None
                item.save()

            if not item.photos.exists():
                self._create_photo(item, index, name)

            if not item.movements.exists():
                InventoryMovement.objects.create(
                    item=item,
                    movement_type=InventoryMovement.MovementType.CREATED,
                    to_container=container,
                    notes="Demo item seeded in inventory.",
                )
                if status == Item.Status.SOLD:
                    InventoryMovement.objects.create(
                        item=item,
                        movement_type=InventoryMovement.MovementType.SOLD,
                        from_container=container,
                        notes="Demo sold item.",
                    )

            created.append(item)
        return created

    def _tags_for_item(self, index: int, name: str) -> list[str]:
        base_tags = ["demo", "medusa", "americana"]
        if index % 2 == 0:
            base_tags.append("mujer")
        else:
            base_tags.append("hombre")
        base_tags.append(name.split()[0].lower())
        return base_tags

    def _price_for_index(self, index: int):
        base = Decimal("12.00") + (Decimal(index) * Decimal("1.75"))
        return base.quantize(Decimal("0.01"))

    def _create_photo(self, item: Item, index: int, name: str) -> None:
        image = self._generate_demo_image(index, name)
        filename = f"{item.code.lower()}.png"
        item_photo = ItemPhoto(item=item, alt_text=name)
        item_photo.image.save(filename, ContentFile(image.getvalue()), save=True)

    def _generate_demo_image(self, index: int, name: str) -> BytesIO:
        size = (1200, 1200)
        background = COLORS[(index - 1) % len(COLORS)]
        image = Image.new("RGB", size, background)
        draw = ImageDraw.Draw(image)

        accent = (255, 255, 255)
        draw.rounded_rectangle((80, 80, 1120, 1120), radius=48, outline=accent, width=8)
        draw.text((120, 150), "Medusa Store", fill=accent)
        draw.text((120, 320), f"{name}", fill=accent)
        draw.text((120, 460), f"Demo item #{index:02d}", fill=accent)
        draw.text((120, 600), f"ITEM-DEMO-{index:03d}", fill=accent)

        font = ImageFont.load_default()
        draw.text((120, 760), "Inventory preview", fill=accent, font=font)

        output = BytesIO()
        image.save(output, format="PNG")
        output.seek(0)
        return output
