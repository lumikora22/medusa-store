from __future__ import annotations

import uuid

from django.utils import timezone
from rest_framework import serializers

from .models import Container, InventoryMovement, Item, ItemPhoto


class ItemPhotoSerializer(serializers.ModelSerializer):
    MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024
    ALLOWED_IMAGE_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}

    image_url = serializers.SerializerMethodField()

    class Meta:
        model = ItemPhoto
        fields = ["id", "item", "image", "image_url", "alt_text", "created_at"]
        read_only_fields = ["id", "image_url", "created_at"]

    def get_image_url(self, obj: ItemPhoto) -> str | None:
        if not obj.image:
            return None
        request = self.context.get("request")
        url = obj.image.url
        return request.build_absolute_uri(url) if request else url

    def validate_image(self, value):
        content_type = getattr(value, "content_type", "")
        if content_type not in self.ALLOWED_IMAGE_CONTENT_TYPES:
            raise serializers.ValidationError("Upload a JPEG, PNG, or WebP image.")
        if value.size > self.MAX_IMAGE_SIZE_BYTES:
            raise serializers.ValidationError("Image uploads must be 5 MB or smaller.")
        return value


class ContainerSerializer(serializers.ModelSerializer):
    active_items_count = serializers.SerializerMethodField()
    type = serializers.CharField(max_length=12)

    class Meta:
        model = Container
        fields = [
            "id",
            "code",
            "qr_value",
            "type",
            "status",
            "notes",
            "active_items_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_code(self, value: str) -> str:
        normalized = value.upper().strip()
        queryset = Container.objects.filter(code__iexact=normalized)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("A container with this code already exists.")
        return normalized

    def validate_type(self, value: str) -> str:
        normalized = value.lower().strip()
        allowed_types = {choice.value for choice in Container.ContainerType}
        if normalized not in allowed_types:
            raise serializers.ValidationError("Use box, bag, or other.")
        return normalized

    def get_active_items_count(self, obj: Container) -> int:
        annotated_count = getattr(obj, "active_items_count", None)
        if annotated_count is not None:
            return annotated_count
        return obj.items.filter(status=Item.Status.ACTIVE).count()


class ItemSerializer(serializers.ModelSerializer):
    code = serializers.CharField(required=False, allow_blank=True, max_length=32)
    photos = ItemPhotoSerializer(many=True, read_only=True)
    container_code = serializers.CharField(source="container.code", read_only=True)

    class Meta:
        model = Item
        fields = [
            "id",
            "code",
            "qr_value",
            "container",
            "container_code",
            "status",
            "price",
            "description",
            "tags",
            "sold_at",
            "photos",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "container_code", "sold_at", "photos", "created_at", "updated_at"]

    def validate_code(self, value: str) -> str:
        normalized = value.upper().strip()
        if not normalized:
            return ""
        queryset = Item.objects.filter(code__iexact=normalized)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("An item with this code already exists.")
        return normalized

    def validate_tags(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("Tags must be a list of strings.")
        if any(not isinstance(tag, str) for tag in value):
            raise serializers.ValidationError("Each tag must be a string.")
        return value

    def generate_item_code(self) -> str:
        base_code = timezone.localtime(timezone.now()).strftime("ITEM-%Y%m%d-%H%M%S")
        if not Item.objects.filter(code__iexact=base_code).exists():
            return base_code

        for index in range(2, 100):
            candidate = f"{base_code}-{index:02d}"
            if not Item.objects.filter(code__iexact=candidate).exists():
                return candidate

        return f"{base_code}-{uuid.uuid4().hex[:6].upper()}"

    def create(self, validated_data):
        if not validated_data.get("code"):
            validated_data["code"] = self.generate_item_code()
        item = super().create(validated_data)
        InventoryMovement.objects.create(
            item=item,
            movement_type=InventoryMovement.MovementType.CREATED,
            to_container=item.container,
            notes="Item registered in inventory.",
        )
        return item


class InventoryMovementSerializer(serializers.ModelSerializer):
    item_code = serializers.CharField(source="item.code", read_only=True)
    from_container_code = serializers.CharField(source="from_container.code", read_only=True)
    to_container_code = serializers.CharField(source="to_container.code", read_only=True)

    class Meta:
        model = InventoryMovement
        fields = [
            "id",
            "item",
            "item_code",
            "movement_type",
            "from_container",
            "from_container_code",
            "to_container",
            "to_container_code",
            "notes",
            "created_at",
        ]
        read_only_fields = fields
