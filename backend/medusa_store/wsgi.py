"""WSGI config for the Medusa Store backend."""
import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "medusa_store.settings")

application = get_wsgi_application()
