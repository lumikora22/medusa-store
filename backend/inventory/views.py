from __future__ import annotations

from django.db.models import Count, Q, Sum
from django.shortcuts import get_object_or_404
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from .models import Container, InventoryMovement, Item, ItemPhoto
from .serializers import (
    ContainerSerializer,
    InventoryMovementSerializer,
    ItemPhotoSerializer,
    ItemSerializer,
)


class ContainerViewSet(viewsets.ModelViewSet):
    serializer_class = ContainerSerializer

    def get_queryset(self):
        queryset = Container.objects.annotate(
            active_items_count=Count("items", filter=Q(items__status=Item.Status.ACTIVE))
        )
        code = self.request.query_params.get("code")
        if code:
            queryset = queryset.filter(code__iexact=code.strip())
        return queryset

    @action(detail=False, methods=["get"], url_path=r"scan/(?P<code>[^/.]+)")
    def scan(self, request, code: str | None = None):
        scanned_value = (code or "").strip()
        container = get_object_or_404(
            self.get_queryset(),
            Q(code__iexact=scanned_value) | Q(qr_value__iexact=scanned_value),
        )
        active_items = container.items.filter(status=Item.Status.ACTIVE).select_related("container").prefetch_related("photos")
        return Response(
            {
                "container": self.get_serializer(container).data,
                "items": ItemSerializer(active_items, many=True, context={"request": request}).data,
            }
        )


class ItemViewSet(viewsets.ModelViewSet):
    serializer_class = ItemSerializer

    def get_queryset(self):
        queryset = Item.objects.select_related("container").prefetch_related("photos")
        status_filter = self.request.query_params.get("status")
        if self.action == "list" and status_filter:
            queryset = queryset.filter(status=status_filter)
        elif self.action == "list":
            queryset = queryset.filter(status=Item.Status.ACTIVE)

        container_code = self.request.query_params.get("container_code")
        if container_code:
            queryset = queryset.filter(container__code__iexact=container_code.strip())

        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(
                Q(code__icontains=search)
                | Q(description__icontains=search)
                | Q(container__code__icontains=search)
            )
        return queryset

    @action(detail=False, methods=["get"], url_path=r"scan/(?P<code>[^/.]+)")
    def scan(self, request, code: str | None = None):
        scanned_value = (code or "").strip()
        item = get_object_or_404(
            Item.objects.select_related("container").prefetch_related("photos"),
            Q(code__iexact=scanned_value) | Q(qr_value__iexact=scanned_value),
        )
        return Response(self.get_serializer(item).data)

    @action(detail=False, methods=["get"])
    def summary(self, request):
        active_items = Item.objects.filter(status=Item.Status.ACTIVE)
        sold_items = Item.objects.filter(status=Item.Status.SOLD)
        active_value = active_items.aggregate(total=Sum("price"))["total"] or 0
        sold_value = sold_items.aggregate(total=Sum("price"))["total"] or 0
        return Response(
            {
                "active_items_count": active_items.count(),
                "sold_items_count": sold_items.count(),
                "containers_count": Container.objects.filter(status=Container.Status.ACTIVE).count(),
                "active_inventory_value": f"{active_value:.2f}",
                "sold_inventory_value": f"{sold_value:.2f}",
            }
        )

    @action(detail=True, methods=["post"])
    def mark_sold(self, request, pk=None):
        item = self.get_object()
        if item.status == Item.Status.SOLD:
            return Response(self.get_serializer(item).data)
        previous_container = item.container
        item.mark_sold()
        InventoryMovement.objects.create(
            item=item,
            movement_type=InventoryMovement.MovementType.SOLD,
            from_container=previous_container,
            notes=request.data.get("notes", "Item marked as sold."),
        )
        return Response(self.get_serializer(item).data)

    @action(detail=True, methods=["post"])
    def move(self, request, pk=None):
        item = self.get_object()
        if item.status == Item.Status.SOLD:
            return Response(
                {"detail": "Sold items cannot be moved."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        container_id = request.data.get("container")
        container_code = request.data.get("container_code")
        if container_id:
            new_container = get_object_or_404(Container, pk=container_id)
        elif container_code:
            new_container = get_object_or_404(Container, code__iexact=str(container_code).strip())
        else:
            return Response(
                {"detail": "Provide container or container_code."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        previous_container = item.container
        item.container = new_container
        item.save(update_fields=["container", "updated_at"])
        InventoryMovement.objects.create(
            item=item,
            movement_type=InventoryMovement.MovementType.MOVED,
            from_container=previous_container,
            to_container=new_container,
            notes=request.data.get("notes", "Item moved."),
        )
        return Response(self.get_serializer(item).data)


class ItemPhotoViewSet(viewsets.ModelViewSet):
    serializer_class = ItemPhotoSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    queryset = ItemPhoto.objects.select_related("item")


class InventoryMovementViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = InventoryMovementSerializer
    queryset = InventoryMovement.objects.select_related("item", "from_container", "to_container")
