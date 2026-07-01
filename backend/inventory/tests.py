from io import BytesIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.urls import reverse
from PIL import Image
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from .models import Container, InventoryMovement, Item, ItemPhoto
from .serializers import ItemPhotoSerializer


class InventoryModelTests(TestCase):
    def test_codes_are_normalized_and_qr_defaults_to_code(self):
        container = Container.objects.create(code=" box-0001 ", type=Container.ContainerType.BOX)
        item = Item.objects.create(code=" item-0001 ", container=container, price="12.50")

        self.assertEqual(container.code, "BOX-0001")
        self.assertEqual(container.qr_value, "BOX-0001")
        self.assertEqual(item.code, "ITEM-0001")
        self.assertEqual(item.qr_value, "ITEM-0001")


class InventoryApiTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="admin", password="test-pass")
        self.token = Token.objects.create(user=self.user)
        self.box = Container.objects.create(code="BOX-0001", type=Container.ContainerType.BOX)
        self.bag = Container.objects.create(code="BAG-0001", type=Container.ContainerType.BAG)
        self.item = Item.objects.create(
            code="ITEM-0001",
            container=self.box,
            price="25.00",
            description="Vintage denim jacket",
            tags=["denim", "jacket"],
        )

    def authenticate(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")

    def test_health_check_remains_public(self):
        response = self.client.get(reverse("health-check"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "ok")

    def test_unauthenticated_mutation_is_rejected(self):
        response = self.client.post(
            reverse("container-list"),
            {"code": "BOX-0002", "type": Container.ContainerType.BOX},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertFalse(Container.objects.filter(code="BOX-0002").exists())

    def test_authenticated_mutation_creates_container(self):
        self.authenticate()

        response = self.client.post(
            reverse("container-list"),
            {"code": " box-0002 ", "type": Container.ContainerType.BOX},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Container.objects.filter(code="BOX-0002").exists())

    def test_authenticated_mutation_creates_custom_container_type(self):
        self.authenticate()

        response = self.client.post(
            reverse("container-list"),
            {"code": "rack-0001", "type": " Other ", "notes": "Rolling rack"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["code"], "RACK-0001")
        self.assertEqual(response.data["type"], Container.ContainerType.OTHER)
        self.assertEqual(response.data["qr_value"], "RACK-0001")

    def test_token_endpoint_returns_token_for_valid_credentials(self):
        response = self.client.post(
            reverse("api-token-auth"),
            {"username": "admin", "password": "test-pass"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["token"], self.token.key)

    def test_scan_container_returns_active_items(self):
        self.authenticate()

        response = self.client.get(reverse("container-scan", kwargs={"code": "BOX-0001"}))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["container"]["code"], "BOX-0001")
        self.assertEqual(response.data["items"][0]["code"], "ITEM-0001")

    def test_scan_container_not_found_returns_404(self):
        self.authenticate()

        response = self.client.get(reverse("container-scan", kwargs={"code": "MISSING"}))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_scan_item_returns_location(self):
        self.authenticate()

        response = self.client.get(reverse("item-scan", kwargs={"code": "ITEM-0001"}))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["code"], "ITEM-0001")
        self.assertEqual(response.data["container_code"], "BOX-0001")

    def test_scan_item_not_found_returns_404(self):
        self.authenticate()

        response = self.client.get(reverse("item-scan", kwargs={"code": "MISSING"}))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_items_list_uses_real_drf_pagination_contract_over_page_size(self):
        self.authenticate()
        Item.objects.bulk_create(
            [
                Item(
                    code=f"ITEM-PAGE-{index:04d}",
                    qr_value=f"ITEM-PAGE-{index:04d}",
                    container=self.box,
                    price="10.00",
                    description="Pagination fixture",
                    tags=[],
                )
                for index in range(30)
            ]
        )

        first_page = self.client.get(reverse("item-list"))

        self.assertEqual(first_page.status_code, status.HTTP_200_OK)
        self.assertEqual(first_page.data["count"], 31)
        self.assertIsNotNone(first_page.data["next"])
        self.assertEqual(len(first_page.data["results"]), 25)

        second_page = self.client.get(first_page.data["next"])

        self.assertEqual(second_page.status_code, status.HTTP_200_OK)
        self.assertIsNone(second_page.data["next"])
        self.assertEqual(len(second_page.data["results"]), 6)

    def test_duplicate_item_code_is_rejected_case_insensitively(self):
        self.authenticate()

        response = self.client.post(
            reverse("item-list"),
            {
                "code": " item-0001 ",
                "container": self.box.pk,
                "price": "30.00",
                "description": "Duplicate code",
                "tags": [],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("code", response.data)

    def test_item_code_is_generated_when_omitted(self):
        self.authenticate()

        response = self.client.post(
            reverse("item-list"),
            {
                "container": self.box.pk,
                "price": "30.00",
                "description": "Generated code item",
                "tags": [],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["code"].startswith("ITEM-"))
        self.assertEqual(response.data["qr_value"], response.data["code"])

    def test_generated_item_code_uses_suffix_on_collision(self):
        self.authenticate()
        fixed_now = self.item.created_at
        expected_base = fixed_now.strftime("ITEM-%Y%m%d-%H%M%S")
        Item.objects.create(code=expected_base, container=self.box, price="10.00")

        with patch("inventory.serializers.timezone.now", return_value=fixed_now):
            response = self.client.post(
                reverse("item-list"),
                {
                    "container": self.box.pk,
                    "price": "30.00",
                    "description": "Generated code collision",
                    "tags": [],
                },
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["code"], f"{expected_base}-02")

    def test_mark_sold_hides_item_from_default_inventory_but_keeps_history_and_scan(self):
        self.authenticate()

        response = self.client.post(reverse("item-mark-sold", kwargs={"pk": self.item.pk}), {})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.item.refresh_from_db()
        self.assertEqual(self.item.status, Item.Status.SOLD)
        self.assertIsNotNone(self.item.sold_at)

        list_response = self.client.get(reverse("item-list"))
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(list_response.data["count"], 0)
        scan_response = self.client.get(reverse("item-scan", kwargs={"code": "ITEM-0001"}))
        self.assertEqual(scan_response.status_code, status.HTTP_200_OK)
        self.assertEqual(scan_response.data["status"], Item.Status.SOLD)
        self.assertTrue(
            InventoryMovement.objects.filter(
                item=self.item,
                movement_type=InventoryMovement.MovementType.SOLD,
            ).exists()
        )

    def test_move_item_to_another_container(self):
        self.authenticate()

        response = self.client.post(
            reverse("item-move", kwargs={"pk": self.item.pk}),
            {"container_code": "BAG-0001"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.item.refresh_from_db()
        self.assertEqual(self.item.container, self.bag)
        self.assertEqual(response.data["container_code"], "BAG-0001")

    def test_move_sold_item_is_rejected(self):
        self.authenticate()
        self.item.mark_sold()

        response = self.client.post(
            reverse("item-move", kwargs={"pk": self.item.pk}),
            {"container_code": "BAG-0001"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Sold items cannot be moved.")
        self.item.refresh_from_db()
        self.assertEqual(self.item.container, self.box)

    def test_move_item_to_unknown_container_returns_404(self):
        self.authenticate()

        response = self.client.post(
            reverse("item-move", kwargs={"pk": self.item.pk}),
            {"container_code": "MISSING"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_upload_item_photo_accepts_multipart_image(self):
        self.authenticate()
        image = BytesIO()
        Image.new("RGB", (1, 1), color="white").save(image, format="PNG")
        image.seek(0)

        response = self.client.post(
            reverse("photo-list"),
            {
                "item": self.item.pk,
                "image": SimpleUploadedFile("item.png", image.read(), content_type="image/png"),
                "alt_text": "Front view",
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["item"], self.item.pk)
        self.assertEqual(response.data["alt_text"], "Front view")
        self.assertTrue(ItemPhoto.objects.filter(item=self.item).exists())

    def test_upload_item_photo_rejects_non_image_content_type(self):
        self.authenticate()

        response = self.client.post(
            reverse("photo-list"),
            {
                "item": self.item.pk,
                "image": SimpleUploadedFile("item.txt", b"not an image", content_type="text/plain"),
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("image", response.data)
        self.assertFalse(ItemPhoto.objects.filter(item=self.item).exists())

    def test_upload_item_photo_rejects_images_over_size_limit(self):
        self.authenticate()

        response = self.client.post(
            reverse("photo-list"),
            {
                "item": self.item.pk,
                "image": SimpleUploadedFile(
                    "large.png",
                    b"x" * (ItemPhotoSerializer.MAX_IMAGE_SIZE_BYTES + 1),
                    content_type="image/png",
                ),
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("image", response.data)
