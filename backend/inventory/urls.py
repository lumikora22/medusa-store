from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ContainerViewSet, InventoryMovementViewSet, ItemPhotoViewSet, ItemViewSet

router = DefaultRouter()
router.register("containers", ContainerViewSet, basename="container")
router.register("items", ItemViewSet, basename="item")
router.register("photos", ItemPhotoViewSet, basename="photo")
router.register("movements", InventoryMovementViewSet, basename="movement")

urlpatterns = [path("", include(router.urls))]
