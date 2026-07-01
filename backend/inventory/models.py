from __future__ import annotations

from django.db import models
from django.utils import timezone


class Container(models.Model):
    class ContainerType(models.TextChoices):
        BOX = "box", "Box"
        BAG = "bag", "Bag"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        ARCHIVED = "archived", "Archived"

    code = models.CharField(max_length=32, unique=True)
    qr_value = models.CharField(max_length=128, unique=True, blank=True)
    type = models.CharField(max_length=12, choices=ContainerType.choices)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.ACTIVE)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["code"]

    def save(self, *args, **kwargs):
        self.code = self.code.upper().strip()
        if not self.qr_value:
            self.qr_value = self.code
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.code


class Item(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        SOLD = "sold", "Sold"
        ARCHIVED = "archived", "Archived"

    code = models.CharField(max_length=32, unique=True)
    qr_value = models.CharField(max_length=128, unique=True, blank=True)
    container = models.ForeignKey(Container, related_name="items", on_delete=models.PROTECT)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.ACTIVE)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    description = models.TextField(blank=True)
    tags = models.JSONField(default=list, blank=True)
    sold_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        self.code = self.code.upper().strip()
        if not self.qr_value:
            self.qr_value = self.code
        if self.status == self.Status.SOLD and self.sold_at is None:
            self.sold_at = timezone.now()
        super().save(*args, **kwargs)

    def mark_sold(self) -> None:
        self.status = self.Status.SOLD
        self.sold_at = timezone.now()
        self.save(update_fields=["status", "sold_at", "updated_at"])

    def __str__(self) -> str:
        return self.code


class ItemPhoto(models.Model):
    item = models.ForeignKey(Item, related_name="photos", on_delete=models.CASCADE)
    image = models.ImageField(upload_to="item-photos/%Y/%m/")
    alt_text = models.CharField(max_length=160, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"Photo for {self.item.code}"


class InventoryMovement(models.Model):
    class MovementType(models.TextChoices):
        CREATED = "created", "Created"
        MOVED = "moved", "Moved"
        SOLD = "sold", "Sold"

    item = models.ForeignKey(Item, related_name="movements", on_delete=models.CASCADE)
    movement_type = models.CharField(max_length=12, choices=MovementType.choices)
    from_container = models.ForeignKey(
        Container,
        related_name="movements_from",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
    )
    to_container = models.ForeignKey(
        Container,
        related_name="movements_to",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.item.code} {self.movement_type}"
