from django.contrib import admin

from .models import Container, InventoryMovement, Item, ItemPhoto


class ItemPhotoInline(admin.TabularInline):
    model = ItemPhoto
    extra = 1


class InventoryMovementInline(admin.TabularInline):
    model = InventoryMovement
    extra = 0
    readonly_fields = ["movement_type", "from_container", "to_container", "notes", "created_at"]
    can_delete = False


@admin.register(Container)
class ContainerAdmin(admin.ModelAdmin):
    list_display = ["code", "type", "status", "created_at"]
    list_filter = ["type", "status"]
    search_fields = ["code", "qr_value", "notes"]


@admin.register(Item)
class ItemAdmin(admin.ModelAdmin):
    list_display = ["code", "container", "status", "price", "sold_at", "created_at"]
    list_filter = ["status", "container__type", "created_at"]
    search_fields = ["code", "qr_value", "description", "container__code"]
    inlines = [ItemPhotoInline, InventoryMovementInline]


@admin.register(ItemPhoto)
class ItemPhotoAdmin(admin.ModelAdmin):
    list_display = ["item", "alt_text", "created_at"]
    search_fields = ["item__code", "alt_text"]


@admin.register(InventoryMovement)
class InventoryMovementAdmin(admin.ModelAdmin):
    list_display = ["item", "movement_type", "from_container", "to_container", "created_at"]
    list_filter = ["movement_type", "created_at"]
    search_fields = ["item__code", "from_container__code", "to_container__code", "notes"]
    readonly_fields = ["created_at"]
