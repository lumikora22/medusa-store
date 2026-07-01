"""ASGI config for the Medusa Store backend."""
import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "medusa_store.settings")

application = get_asgi_application()
